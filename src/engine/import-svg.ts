import { newId, type Doc, type AnyNode, type PathAnchor, type ShapeNode } from '../types'
import { pathFromWorld } from './paths'
import type { Pt } from './geometry'
import { parseDocument } from './document-validation'

export interface ImportResult { doc: Doc; warnings: string[]; format: 'svg' | 'vsdx' }
export function parseXml(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('不接受包含 DTD 或实体定义的 XML')
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('XML 格式无效')
  return xml
}
export function importedDoc(title: string): Doc {
  const id = newId('page')
  return { version: 1, title: title.replace(/\.(svg|vsdx)$/i, ''), pages: [{ id, name: '页面 1', background: '#ffffff', nodes: {}, order: [] }], activePageId: id, createdAt: Date.now(), updatedAt: Date.now() }
}
export function transformAnchors(points: PathAnchor[], matrix: DOMMatrix) {
  const p = (v: Pt) => { const q = matrix.transformPoint(v); return { x: q.x, y: q.y } }
  return points.map(a => ({ ...p(a), ...(a.in ? { in: p(a.in) } : {}), ...(a.out ? { out: p(a.out) } : {}) }))
}
function svgTransform(text: string) {
  let matrix = new DOMMatrix()
  let rest = text
  for (const match of text.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    rest = rest.replace(match[0], '')
    const v = match[2].trim().split(/[\s,]+/).map(Number)
    if (v.some(x => !Number.isFinite(x))) throw new Error('无效变换')
    let m = new DOMMatrix()
    switch (match[1]) {
      case 'matrix': if (v.length !== 6) throw new Error('无效矩阵'); m = new DOMMatrix(v); break
      case 'translate': m.translateSelf(v[0], v[1] || 0); break
      case 'scale': m.scaleSelf(v[0], v[1] ?? v[0]); break
      case 'rotate': m.translateSelf(v[1] || 0, v[2] || 0).rotateSelf(v[0]).translateSelf(-(v[1] || 0), -(v[2] || 0)); break
      case 'skewX': m.skewXSelf(v[0]); break
      case 'skewY': m.skewYSelf(v[0]); break
    }
    matrix = matrix.multiply(m)
  }
  if (rest.trim()) throw new Error('不支持的变换表达式')
  return matrix
}

// Preserve cubic and quadratic curves as editable anchors. Unsupported compound/arc paths
// are rejected explicitly instead of flattening away holes or silently dropping commands.
export function parseSvgPath(data: string): { points: PathAnchor[]; closed: boolean } {
  const tokens = data.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || []
  if (data.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]/g, '')) throw new Error('无效路径数据')
  let i = 0, command = '', x = 0, y = 0, closed = false, previous = '', quadratic: Pt | undefined
  const points: PathAnchor[] = []
  const number = () => { const n = Number(tokens[i++]); if (!Number.isFinite(n)) throw new Error('路径参数缺失'); return n }
  while (i < tokens.length) {
    if(points.length>20000) throw new Error('路径锚点过多')
    if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++]
    if (!command) throw new Error('路径缺少命令')
    const upper = command.toUpperCase(), relative = command !== upper
    const point = (): Pt => ({ x: number() + (relative ? x : 0), y: number() + (relative ? y : 0) })
    const last = points[points.length - 1]
    if (upper === 'Z') {
      closed = true
      if (points.length > 1 && Math.hypot(points[0].x - last.x, points[0].y - last.y) < .001) { points[0].in = last.in; points.pop() }
      x = points[0]?.x || 0; y = points[0]?.y || 0; command = ''; previous = 'Z'; continue
    }
    if (closed) throw new Error('暂不支持复合路径和镂空路径')
    let next: Pt
    if (upper === 'M') {
      if (points.length) throw new Error('暂不支持复合路径和镂空路径')
      next = point(); command = relative ? 'l' : 'L'
    } else if (upper === 'L') next = point()
    else if (upper === 'H') next = { x: number() + (relative ? x : 0), y }
    else if (upper === 'V') next = { x, y: number() + (relative ? y : 0) }
    else if (upper === 'C' || upper === 'S') {
      if (!last) throw new Error('路径缺少起点')
      const c1 = upper === 'C' ? point() : ['C','S'].includes(previous) && last.in ? { x: 2*x-last.in.x, y: 2*y-last.in.y } : { x,y }
      const c2 = point(); next = point(); last.out = c1
      points.push({ ...next, in: c2 }); x=next.x; y=next.y; previous=upper; quadratic=undefined; continue
    } else if (upper === 'Q' || upper === 'T') {
      if (!last) throw new Error('路径缺少起点')
      const control: Pt = upper === 'Q' ? point() : ['Q','T'].includes(previous) && quadratic ? { x: 2*x-quadratic.x, y: 2*y-quadratic.y } : { x,y }
      next = point(); last.out = { x:x+(control.x-x)*2/3, y:y+(control.y-y)*2/3 }
      points.push({ ...next, in: { x:next.x+(control.x-next.x)*2/3, y:next.y+(control.y-next.y)*2/3 } })
      quadratic=control; x=next.x; y=next.y; previous=upper; continue
    } else throw new Error(upper === 'A' ? '暂不支持 SVG 椭圆弧 A 命令' : `不支持的路径命令 ${command}`)
    if (!points.length && upper !== 'M') throw new Error('路径缺少 M 起点')
    points.push(next); x=next.x; y=next.y; previous=upper; quadratic=undefined
    if (points.length > 20000) throw new Error('路径锚点过多')
  }
  if (points.length < 2) throw new Error('路径至少需要两个锚点')
  return { points, closed }
}

export function importSvg(content: string, name: string): ImportResult {
  const xml = parseXml(content), root = xml.documentElement
  if (root.localName !== 'svg') throw new Error('文件根元素不是 SVG')
  const native=root.querySelector('metadata#bosai-native[data-version="2"]')
  if(native){const doc=parseDocument(native.textContent||'');doc.documentId=newId('doc');doc.title=name.replace(/\.svg$/i,'');return {doc,warnings:['已读取 BoSai SVG 内的原生对象，保留专业属性、关系标签与模型引用；本文件仅包含导出的页面范围。'],format:'svg'}}
  const doc = importedDoc(name), page = doc.pages[0], warnings = new Set<string>()
  const add = (n: AnyNode) => { if (page.order.length >= 20000) throw new Error('导入对象数量超过 20000'); n.id=newId('n'); page.nodes[n.id]=n; page.order.push(n.id) }
  const attr = (el: Element, key: string, fallback = 0) => {
    const value = el.getAttribute(key)
    if (value === null) return fallback
    if (!/^[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?(?:px)?$/i.test(value.trim())) throw new Error(`${key} 暂仅支持无单位或 px 数值`)
    const n = parseFloat(value); if (!Number.isFinite(n)) throw new Error(`${key} 数值无效`); return n
  }
  const ellipse = (cx:number,cy:number,rx:number,ry:number) => {
    const k = .5522847498
    return [ {x:cx+rx,y:cy,in:{x:cx+rx,y:cy-k*ry},out:{x:cx+rx,y:cy+k*ry}},
      {x:cx,y:cy+ry,in:{x:cx+k*rx,y:cy+ry},out:{x:cx-k*rx,y:cy+ry}},
      {x:cx-rx,y:cy,in:{x:cx-rx,y:cy+k*ry},out:{x:cx-rx,y:cy-k*ry}},
      {x:cx,y:cy-ry,in:{x:cx-k*rx,y:cy-ry},out:{x:cx+k*rx,y:cy-ry}} ]
  }
  const walk = (el: Element, parentMatrix: DOMMatrix, inherited: Record<string,string>, parentOpacity: number) => {
    const tag = el.localName
    if (['defs','title','desc','metadata'].includes(tag)) return
    if (['script','foreignObject','style','animate','animateTransform','set'].includes(tag)) { warnings.add(`未导入 ${tag}（活动内容或 CSS）`); return }
    try {
      const own: Record<string,string> = {}
      for (const part of (el.getAttribute('style') || '').split(';')) { const at=part.indexOf(':'); if(at>0) own[part.slice(0,at).trim()]=part.slice(at+1).trim() }
      const style={...inherited}
      for (const key of ['fill','stroke','stroke-width','stroke-dasharray','font-family','font-size','font-weight','font-style','text-anchor','visibility','display','fill-opacity','stroke-opacity','color']) {
        if(el.hasAttribute(key)) style[key]=el.getAttribute(key)!
        if(own[key]) style[key]=own[key]
      }
      if (style.display==='none' || style.visibility==='hidden') return
      const opacity=parentOpacity * Math.min(1,Math.max(0,Number(own.opacity || el.getAttribute('opacity') || 1)))
      const matrix=parentMatrix.multiply(svgTransform(el.getAttribute('transform') || ''))
      if (el.hasAttribute('clip-path') || own['clip-path'] || el.hasAttribute('mask') || own.mask) throw new Error('暂不支持裁剪/蒙版')
      if (el.hasAttribute('filter') || own.filter) warnings.add('滤镜效果未导入')
      if (['g','svg','a'].includes(tag)) {
        if (tag==='svg' && el!==root) { warnings.add('未导入嵌套 SVG 视口'); return }
        if(tag==='g' && opacity!==parentOpacity) warnings.add('组透明度按子对象透明度转换（重叠区域可能不同）')
        for (const child of el.children) walk(child,matrix,style,opacity)
        return
      }
      const paint = (v:string|undefined, fallback:string) => {
        if(!v) return fallback
        if(v==='none') return 'transparent'
        if(v.startsWith('url(')) { warnings.add('渐变/图案填充转换为纯色'); return fallback }
        if(v==='currentColor') v=style.color || '#000000'
        if (!CSS.supports('color',v)) throw new Error('不支持的颜色表达式')
        return v
      }
      const scale=Math.sqrt(Math.abs(matrix.a*matrix.d-matrix.b*matrix.c))
      const strokeWidth=parseFloat(style['stroke-width'] || '1')*scale
      if(!Number.isFinite(strokeWidth) || !Number.isFinite(opacity)) throw new Error('样式数值无效')
      if(style['fill-opacity'] || style['stroke-opacity']) warnings.add('独立填充/描边透明度尚未导入')
      if(el.hasAttribute('marker-start') || el.hasAttribute('marker-end')) warnings.add('SVG 箭头标记尚未导入')
      let points: PathAnchor[] = [], closed=true
      if(tag==='rect') {
        const x=attr(el,'x'),y=attr(el,'y'),w=attr(el,'width'),h=attr(el,'height')
        if(w<=0 || h<=0) return
        if(attr(el,'rx') || attr(el,'ry')) warnings.add('圆角矩形暂按直角矩形转换')
        points=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]
      } else if(tag==='circle' || tag==='ellipse') {
        points=ellipse(attr(el,'cx'),attr(el,'cy'),attr(el,tag==='circle'?'r':'rx'),attr(el,tag==='circle'?'r':'ry'))
      } else if(tag==='line') { points=[{x:attr(el,'x1'),y:attr(el,'y1')},{x:attr(el,'x2'),y:attr(el,'y2')}]; closed=false }
      else if(tag==='polyline' || tag==='polygon') {
        const nums=(el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
        if(nums.length<4 || nums.length%2 || nums.some(n=>!Number.isFinite(n))) throw new Error('无效的多边形坐标')
        for(let i=0;i<nums.length;i+=2) points.push({x:nums[i],y:nums[i+1]})
        closed=tag==='polygon'
      } else if(tag==='path') { const parsed=parseSvgPath(el.getAttribute('d') || ''); points=parsed.points; closed=parsed.closed }
      else if(tag==='text') {
        if(el.querySelector('textPath')) throw new Error('暂不支持沿路径文本')
        if(el.children.length) warnings.add('富文本 / tspan 转为单一样式文本')
        const p=matrix.transformPoint({x:attr(el,'x'),y:attr(el,'y')}), fontSize=parseFloat(style['font-size'] || '16')*scale
        const text=el.textContent || '', w=Math.max(fontSize,text.length*fontSize*.65),h=fontSize*1.5
        const align=style['text-anchor']==='middle'?'center':style['text-anchor']==='end'?'right':'left'
        add({id:'',kind:'text',x:p.x-(align==='center'?w/2:align==='right'?w:0),y:p.y-fontSize,w,h,rot:Math.atan2(matrix.b,matrix.a)*180/Math.PI,z:page.order.length,
          text,fontSize,fontFamily:style['font-family'],bold:style['font-weight']==='bold' || Number(style['font-weight'])>=600,italic:style['font-style']==='italic',align,valign:'top',color:paint(style.fill,'#000000'),fill:'transparent',stroke:'transparent',opacity})
        return
      } else { warnings.add(`未导入 ${tag} 元素`); return }
      const node: ShapeNode=pathFromWorld(transformAnchors(points,matrix),closed,page.order.length)
      Object.assign(node,{name:el.getAttribute('id') || undefined,fill:paint(style.fill,'#000000'),stroke:paint(style.stroke,'transparent'),strokeWidth,opacity,lineStyle:style['stroke-dasharray'] && style['stroke-dasharray']!=='none'?'dashed':'solid'})
      add(node)
    } catch(error) { warnings.add(`${tag}${el.id ? '#'+el.id : ''}：${(error as Error).message}，未导入该元素`) }
  }
  if(root.hasAttribute('viewBox')) warnings.add('SVG viewBox 按内部坐标导入，未保留画板尺寸/裁切')
  walk(root,new DOMMatrix(),{},1)
  if(!page.order.length) throw new Error('没有可转换的矢量对象。'+[...warnings].join('；'))
  return {doc,warnings:[...warnings],format:'svg'}
}
