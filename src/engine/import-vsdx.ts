import { newId, type AnyNode, type Page, type PathAnchor, type LineNode } from '../types'
import { importedDoc, parseXml, transformAnchors, type ImportResult } from './import-svg'
import { pathFromWorld } from './paths'
import { reflowConnector } from '../store/board'
import { unionRect, nodeRect } from './geometry'

const PX = 96 // Visio cached dimensions are inches; our document uses CSS pixels.
const children = (el: Element, tag: string) => [...el.children].filter(c=>c.localName===tag)
const child = (el: Element, tag: string) => children(el,tag)[0]
const cells = (el?: Element) => Object.fromEntries(el ? children(el,'Cell').filter(c=>c.getAttribute('V')!==null && c.getAttribute('V')!=='Inh').map(c=>[c.getAttribute('N')!,c.getAttribute('V')!]) : [])
function number(c: Record<string,string>, key:string, fallback=0) {
  if(c[key]===undefined) return fallback
  const n=Number(c[key]); if(!Number.isFinite(n)) throw new Error(`${key} 缺少可用的计算值`); return n
}
function resolvePart(base: string, target: string) {
  const url=new URL(target, 'https://package.invalid/'+base)
  if(url.origin!=='https://package.invalid') throw new Error('不接受外部包引用')
  return decodeURIComponent(url.pathname.slice(1))
}
export function importVsdx(parts: Record<string,string>, name: string): ImportResult {
  const warnings=new Set<string>(['VSDX 导入为转换副本：不保留 ShapeSheet 公式、主题、数据绑定和 Visio 专属行为；不能回写 VSDX'])
  const xmlCache=new Map<string,Document>()
  const xml=(path:string) => {
    if(!parts[path]) throw new Error(`缺少 VSDX 部件 ${path}`)
    if(!xmlCache.has(path)) xmlCache.set(path,parseXml(parts[path]))
    return xmlCache.get(path)!
  }
  const relations=(path:string) => {
    const slash=path.lastIndexOf('/'), rp=path.slice(0,slash+1)+'_rels/'+path.slice(slash+1)+'.rels'
    const result:Record<string,string>={}
    if(!parts[rp]) return result
    for(const rel of xml(rp).getElementsByTagNameNS('*','Relationship')) {
      if(rel.getAttribute('TargetMode')==='External') { warnings.add('外部关系/链接未导入'); continue }
      result[rel.getAttribute('Id')!]=resolvePart(path,rel.getAttribute('Target') || '')
    }
    return result
  }
  const relId=(el:Element) => child(el,'Rel')?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')
  const masterMap=new Map<string,Element>()
  if(parts['visio/masters/masters.xml']) {
    const rels=relations('visio/masters/masters.xml')
    for(const master of xml('visio/masters/masters.xml').getElementsByTagNameNS('*','Master')) {
      const path=rels[relId(master) || '']
      if(path && parts[path]) { const shape=xml(path).getElementsByTagNameNS('*','Shape')[0]; if(shape) masterMap.set(master.getAttribute('ID')!,shape) }
    }
  }
  const doc=importedDoc(name); doc.pages=[]
  const pagePart='visio/pages/pages.xml', pageRels=relations(pagePart)
  for(const entry of xml(pagePart).getElementsByTagNameNS('*','Page')) {
    const file=pageRels[relId(entry) || '']
    if(!file || !parts[file]) { warnings.add(`页面 ${entry.getAttribute('Name')} 缺少内容部件`); continue }
    const page:Page={id:newId('page'),name:entry.getAttribute('Name') || '导入页面',background:'#ffffff',nodes:{},order:[]}
    const pageCells=cells(child(entry,'PageSheet')), height=number(pageCells,'PageHeight',11)*PX
    const root=xml(file).documentElement, idMap=new Map<string,string>()
    let count=0
    const add=(n:AnyNode,sourceId?:string) => {
      if(++count>20000) throw new Error('VSDX 单页对象超过 20000')
      n.id=newId('n'); page.nodes[n.id]=n; page.order.push(n.id); if(sourceId) idMap.set(sourceId,n.id); return n
    }
    const readShape=(shape:Element,parentMatrix:DOMMatrix,parentHeight:number,parentId?:string,inheritedMaster?:Element) => {
      const sourceId=shape.getAttribute('ID') || '', label=shape.getAttribute('NameU') || sourceId
      try {
        let master=masterMap.get(shape.getAttribute('Master') || '') || inheritedMaster
        if(shape.hasAttribute('MasterShape') && master) {
          master=[master,...master.getElementsByTagNameNS('*','Shape')].find(m=>m.getAttribute('ID')===shape.getAttribute('MasterShape'))
        }
        const c={...cells(master),...cells(shape)}
        const width=number(c,'Width',1)*PX,h=number(c,'Height',.5)*PX
        const px=number(c,'PinX')*PX,py=parentHeight-number(c,'PinY')*PX
        const lx=number(c,'LocPinX',width/PX/2)*PX,ly=h-number(c,'LocPinY',h/PX/2)*PX
        const matrix=parentMatrix.translate(px,py).rotate(-number(c,'Angle')*180/Math.PI).scale(number(c,'FlipX')?-1:1,number(c,'FlipY')?-1:1).translate(-lx,-ly)
        const style={fill:c.FillPattern==='0'?'transparent':color(c.FillForegnd,'#ffffff'),stroke:c.LinePattern==='0'?'transparent':color(c.LineColor,'#2b3550'),strokeWidth:number(c,'LineWeight',.02)*PX,
          opacity:1-number(c,'FillForegndTrans'),text:child(shape,'Text')?.textContent || child(master || shape,'Text')?.textContent || '',fontSize:13,color:'#1f2937'}
        if(c.FillForegnd && !/^#|RGB\(/i.test(c.FillForegnd)) warnings.add('Visio 索引色/主题色按默认颜色转换')
        if(shape.getElementsByTagNameNS('*','ForeignData').length) throw new Error('暂不支持图片、OLE 或外部对象')
        if(shape.getAttribute('Type')==='Group') {
          const group=add({id:'',kind:'group',x:px-width/2,y:py-h/2,w:width,h,rot:0,z:page.order.length,name:label,parent:parentId},sourceId)
          const descendants=child(shape,'Shapes')
          if(descendants) for(const sub of children(descendants,'Shape')) readShape(sub,matrix,h,group.id,master)
          const nodes=Object.values(page.nodes).filter(n=>n.parent===group.id)
          if(nodes.length) Object.assign(group,unionRect(nodes.map(nodeRect)))
          return
        }
        if(c.BeginX!==undefined && c.EndX!==undefined) {
          const a=parentMatrix.transformPoint({x:number(c,'BeginX')*PX,y:parentHeight-number(c,'BeginY')*PX})
          const b=parentMatrix.transformPoint({x:number(c,'EndX')*PX,y:parentHeight-number(c,'EndY')*PX})
          const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y)
          add({id:'',kind:'connector',x,y,w:Math.max(1,Math.abs(b.x-a.x)),h:Math.max(1,Math.abs(b.y-a.y)),rot:0,z:page.order.length,parent:parentId,
            points:[{x:a.x-x,y:a.y-y},{x:b.x-x,y:b.y-y}],route:'straight',arrow:'none',startMarker:number(c,'BeginArrow')?'arrow':'none',endMarker:number(c,'EndArrow')?'arrow':'none',lineStyle:c.LinePattern==='2'?'dashed':c.LinePattern==='3'?'dotted':'solid',stroke:style.stroke,strokeWidth:style.strokeWidth,text:style.text},sourceId)
          warnings.add('Visio 连接线保留双端绑定、标签、起终点箭头及常见线型；路由按端点重建，非零 Visio 箭头类型统一转换为普通实心箭头，不推断 UML / ER 语义')
          return
        }
        let sections=children(shape,'Section').filter(s=>s.getAttribute('N')==='Geometry')
        let fromMaster=false
        if(!sections.length && master) { sections=children(master,'Section').filter(s=>s.getAttribute('N')==='Geometry'); fromMaster=true }
        if(sections.length!==1) throw new Error(sections.length?'暂不支持多几何区/复合几何':'无可转换的几何；不使用矩形冒充原图形')
        const section=sections[0], sc=cells(section), points:PathAnchor[]=[]
        if(sc.NoShow==='1') return
        const mc=cells(master), sx=fromMaster?width/(number(mc,'Width',width/PX)*PX || width):1, sy=fromMaster?h/(number(mc,'Height',h/PX)*PX || h):1
        let ellipse=false
        for(const row of children(section,'Row')) {
          if(row.getAttribute('Del')==='1') continue
          const rc=cells(row),type=row.getAttribute('T')
          if(type==='Ellipse') {
            const cx=number(rc,'X')*PX*sx,cy=h-number(rc,'Y')*PX*sy
            const ax=number(rc,'A')*PX*sx-cx,ay=h-number(rc,'B')*PX*sy-cy
            const bx=number(rc,'C')*PX*sx-cx,by=h-number(rc,'D')*PX*sy-cy
            if(points.length || Math.abs(ax*bx+ay*by)>.01) throw new Error('暂不支持非正交椭圆轴')
            const k=.5522847498
            const p=(a:number,b:number)=>({x:cx+a*ax+b*bx,y:cy+a*ay+b*by})
            points.push({ ...p(1,0),in:p(1,-k),out:p(1,k) },{ ...p(0,1),in:p(k,1),out:p(-k,1) },
              { ...p(-1,0),in:p(-1,k),out:p(-1,-k) },{ ...p(0,-1),in:p(-k,-1),out:p(k,-1) })
            ellipse=true; continue
          }
          if(!['MoveTo','LineTo','RelMoveTo','RelLineTo','RelCubBezTo','RelQuadBezTo'].includes(type || '') || ellipse) throw new Error(`暂不支持几何 ${type}`)
          if(type?.includes('MoveTo') && points.length) throw new Error('暂不支持多子路径')
          const relative=type?.startsWith('Rel')
          const next:PathAnchor={x:number(rc,'X')*(relative?width:PX*sx),y:h-number(rc,'Y')*(relative?h:PX*sy)}
          if(type==='RelCubBezTo' || type==='RelQuadBezTo') {
            const last=points[points.length-1]
            if(!last) throw new Error('曲线缺少起点')
            const control={x:number(rc,'A')*width,y:h-number(rc,'B')*h}
            if(type==='RelCubBezTo') { last.out=control; next.in={x:number(rc,'C')*width,y:h-number(rc,'D')*h} }
            else { last.out={x:last.x+(control.x-last.x)*2/3,y:last.y+(control.y-last.y)*2/3}; next.in={x:next.x+(control.x-next.x)*2/3,y:next.y+(control.y-next.y)*2/3} }
          }
          points.push(next)
        }
        if(points.length<2) throw new Error('缺少有效的几何顶点')
        const repeated=points.length>2 && Math.hypot(points[0].x-points[points.length-1].x,points[0].y-points[points.length-1].y)<.01
        const closed=ellipse || repeated
        if(repeated) { points[0].in=points[points.length-1].in; points.pop() }
        const node=pathFromWorld(transformAnchors(points,matrix),closed,page.order.length)
        Object.assign(node,style,{name:label,parent:parentId,fill:sc.NoFill==='1'?'transparent':style.fill,stroke:sc.NoLine==='1'?'transparent':style.stroke})
        add(node,sourceId)
      } catch(error) { warnings.add(`页面「${page.name}」形状 ${label}：${(error as Error).message}，未导入`) }
    }
    const shapes=child(root,'Shapes')
    if(shapes) for(const shape of children(shapes,'Shape')) readShape(shape,new DOMMatrix(),height)
    const connects=child(root,'Connects')
    if(connects) for(const connection of children(connects,'Connect')) {
      const ln=page.nodes[idMap.get(connection.getAttribute('FromSheet') || '') || '']
      const to=idMap.get(connection.getAttribute('ToSheet') || '')
      if(ln?.kind==='connector' && to) {
        const endpoint=connection.getAttribute('FromCell') || ''
        if(endpoint.startsWith('Begin')) ln.from={nodeId:to,side:'auto'}
        if(endpoint.startsWith('End')) ln.to={nodeId:to,side:'auto'}
      } else warnings.add('部分连接关系因目标形状未转换而未保留')
    }
    for(const n of Object.values(page.nodes)) if(n.kind==='connector' && n.from && n.to) Object.assign(n,reflowConnector(n as LineNode,id=>page.nodes[id]))
    if(entry.getAttribute('BackPage')) warnings.add('背景页引用未合成')
    doc.pages.push(page)
  }
  if(!doc.pages.length || !doc.pages.some(p=>p.order.length)) throw new Error('没有可转换的 Visio 对象。'+[...warnings].join('；'))
  doc.activePageId=doc.pages[0].id
  return {doc,warnings:[...warnings],format:'vsdx'}
}
function color(value:string|undefined,fallback:string) {
  if(!value) return fallback
  const rgb=value.match(/^RGB\((\d+),(\d+),(\d+)\)$/i)
  if(rgb) return `rgb(${rgb[1]},${rgb[2]},${rgb[3]})`
  return /^#[\da-f]{6}$/i.test(value)?value:fallback
}
