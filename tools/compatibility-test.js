const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
const { deflateRawSync } = require('node:zlib')
const { readVsdx, crc32 } = require('../electron/vsdx')
app.setPath('userData',path.join(os.tmpdir(),'bosai-compat-'+Date.now()))
const ns='http://schemas.microsoft.com/office/visio/2012/main'
const cell=(n,v)=>`<Cell N="${n}" V="${v}"/>`
const rows='<Row T="MoveTo">'+cell('X',0)+cell('Y',0)+'</Row>'+[[1,0],[1,1],[0,1],[0,0]].map(([x,y])=>'<Row T="LineTo">'+cell('X',x)+cell('Y',y)+'</Row>').join('')
const shape=(id,x,geometry=rows)=>`<Shape ID="${id}" Type="Shape">${cell('Width',1)}${cell('Height',1)}${cell('PinX',x)}${cell('PinY',2)}${cell('LocPinX',.5)}${cell('LocPinY',.5)}<Section N="Geometry">${geometry}</Section><Text>节点 ${id}</Text></Shape>`
const rel='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="page1.xml" Type="http://schemas.microsoft.com/visio/2010/relationships/page"/></Relationships>'
const parts={
  'visio/pages/pages.xml':`<Pages xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Page ID="0" Name="测试页"><PageSheet>${cell('PageHeight',10)}</PageSheet><Rel r:id="rId1"/></Page></Pages>`,
  'visio/pages/_rels/pages.xml.rels':rel,
  'visio/pages/page1.xml':`<PageContents xmlns="${ns}"><Shapes>${shape(1,2)}${shape(2,5)}<Shape ID="3">${cell('BeginX',2.5)}${cell('BeginY',2)}${cell('EndX',4.5)}${cell('EndY',2)}${cell('EndArrow',1)}</Shape></Shapes><Connects><Connect FromSheet="3" FromCell="BeginX" ToSheet="1"/><Connect FromSheet="3" FromCell="EndX" ToSheet="2"/></Connects></PageContents>`
}
function zip(parts,method=8) {
  const locals=[],directory=[]; let offset=0
  for(const [name,text] of Object.entries(parts)) {
    const original=Buffer.from(text),data=method===8?deflateRawSync(original):original,filename=Buffer.from(name)
    const local=Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4); local.writeUInt16LE(method,8); local.writeUInt32LE(crc32(original),14)
    local.writeUInt32LE(data.length,18); local.writeUInt32LE(original.length,22); local.writeUInt16LE(filename.length,26)
    const central=Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt16LE(method,10)
    central.writeUInt32LE(crc32(original),16); central.writeUInt32LE(data.length,20); central.writeUInt32LE(original.length,24); central.writeUInt16LE(filename.length,28); central.writeUInt32LE(offset,42)
    locals.push(local,filename,data); directory.push(central,filename); offset+=30+filename.length+data.length
  }
  const cd=Buffer.concat(directory),end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(parts).length,8); end.writeUInt16LE(Object.keys(parts).length,10); end.writeUInt32LE(cd.length,12); end.writeUInt32LE(offset,16)
  return Buffer.concat([...locals,cd,end])
}
const rejects=fn=>{try{fn();return false}catch{return true}}
let failure=0
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failure++}
check('VSDX Deflate ZIP 解包',readVsdx(zip(parts))['visio/pages/page1.xml']===parts['visio/pages/page1.xml'])
check('VSDX Stored ZIP 解包',readVsdx(zip(parts,0))['visio/pages/pages.xml']===parts['visio/pages/pages.xml'])
check('拒绝伪造 ZIP',rejects(()=>readVsdx(Buffer.from('not zip'))))
check('拒绝危险部件名',rejects(()=>readVsdx(zip({...parts,'../escape.xml':'<a/>'}))))
const corrupt=zip(parts,0); corrupt[80]^=1
check('拒绝校验损坏的 ZIP',rejects(()=>readVsdx(corrupt)))
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}})
  const js=code=>win.webContents.executeJavaScript(code,true)
  try {
    await win.loadFile(path.join(__dirname,'..','dist','index.html'))
    const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><g transform="translate(10,20) scale(2)"><rect x="5" y="6" width="100" height="50" fill="#ff0000"/><path d="M0 0 C20 40 60 40 80 0" stroke="blue" fill="none"/></g><circle cx="300" cy="200" r="25"/><text x="20" y="300">可编辑文字</text></svg>'
    await js(`window.__svgResult=window.__importMod.importSvg(${JSON.stringify(svg)},'测试.svg')`)
    check('SVG 创建独立可编辑对象',await js(`__svgResult.doc.pages[0].order.length===4 && Object.values(__svgResult.doc.pages[0].nodes).some(n=>n.kind==='text' && n.text==='可编辑文字')`))
    check('SVG 累积组变换',await js(`(()=>{const n=Object.values(__svgResult.doc.pages[0].nodes)[0];return n.x===20 && n.y===32 && n.w===200 && n.h===100})()`))
    check('SVG 三次曲线保留控制柄',await js(`Object.values(__svgResult.doc.pages[0].nodes)[1].anchors[0].out!==undefined`))
    check('SVG 二次曲线转换为三次',await js(`__importMod.parseSvgPath('M0 0 Q30 60 90 0 T180 0').points.length===3`))
    check('SVG 相对坐标命令',await js(`__importMod.parseSvgPath('m10 20 h30 v40 l-30 0 z').closed`))
    check('SVG 不支持元素明确告警',await js(`(()=>{const r=__importMod.importSvg('<svg><rect width="10" height="10"/><path d="M0 0 A10 10 0 0 0 20 20"/><image href="https://invalid.example/a.png"/></svg>','warning.svg');return r.warnings.some(w=>w.includes('椭圆弧'))&&r.warnings.some(w=>w.includes('image'))&&r.doc.pages[0].order.length===1})()`))
    check('拒绝 SVG DTD',await js(`(()=>{try{__importMod.importSvg('<!DOCTYPE svg><svg/>','x.svg');return false}catch{return true}})()`))
    const decoded=readVsdx(zip(parts))
    await js(`window.__vsdxResult=__importMod.importVsdx(${JSON.stringify(decoded)},'测试.vsdx')`)
    check('VSDX 页面与几何转换',await js(`__vsdxResult.doc.pages.length===1 && __vsdxResult.doc.pages[0].order.length===3`))
    check('VSDX 英寸与 Y 轴转换',await js(`(()=>{const n=Object.values(__vsdxResult.doc.pages[0].nodes)[0];return n.x===144&&n.y===720&&n.w===96&&n.h===96})()`))
    check('VSDX 连接线保留双端引用',await js(`(()=>{const p=__vsdxResult.doc.pages[0],n=Object.values(p.nodes).find(n=>n.kind==='connector');return n.from&&n.to&&p.nodes[n.from.nodeId]&&p.nodes[n.to.nodeId]})()`))
    const beginOnlyParts={...decoded,'visio/pages/page1.xml':decoded['visio/pages/page1.xml'].replace('<Cell N="EndArrow" V="1"/>','<Cell N="BeginArrow" V="1"/><Text>起点箭头标签</Text>')}
    check('VSDX 单独起点箭头与标签保留',await js(`(()=>{const r=__importMod.importVsdx(${JSON.stringify(beginOnlyParts)},'begin.vsdx'),n=Object.values(r.doc.pages[0].nodes).find(n=>n.kind==='connector');return n.startMarker==='arrow'&&n.endMarker==='none'&&n.text==='起点箭头标签'})()`))
    check('VSDX 转换限制明示',await js(`__vsdxResult.warnings.some(w=>w.includes('不能回写 VSDX'))`))
    const ellipse='<Row T="Ellipse">'+cell('X',.5)+cell('Y',.5)+cell('A',1)+cell('B',.5)+cell('C',.5)+cell('D',1)+'</Row>'
    const ellipseParts={...parts,'visio/pages/page1.xml':`<PageContents xmlns="${ns}"><Shapes>${shape(1,2,ellipse)}</Shapes></PageContents>`}
    check('VSDX 椭圆转换为贝塞尔路径',await js(`(()=>{const r=__importMod.importVsdx(${JSON.stringify(ellipseParts)},'ellipse.vsdx'),n=Object.values(r.doc.pages[0].nodes)[0];return n.closed&&n.anchors.length===4&&!!n.anchors[0].out})()`))
    await js(`window.boardAPI={importDrawing:async()=>({ok:true,format:'svg',content:${JSON.stringify(svg)},name:'UI.svg'})}; [...document.querySelectorAll('.menu-btn')].find(b=>b.textContent==='文件').click()`)
    await new Promise(r=>setTimeout(r,100))
    await js(`[...document.querySelectorAll('.menu-item')].find(b=>b.textContent.includes('导入可编辑')).click()`)
    await new Promise(r=>setTimeout(r,100))
    check('导入菜单显示兼容性确认窗',await js(`document.querySelector('.import-dialog')?.textContent.includes('viewBox')`))
    await js(`window.__store.getState().setDirty(false);document.querySelector('.import-footer .btn-primary').click()`)
    await new Promise(r=>setTimeout(r,100))
    check('导入副本不覆盖源路径',await js(`__store.getState().doc.title==='UI' && __store.getState().filePath===null && __store.getState().dirty && !document.querySelector('.import-dialog')`))
    check('导入后 SVG 导出为有效 XML',await js(`(()=>{const s=__store.getState(),r=__exportMod.exportPageSvg(s.doc,s.doc.activePageId);return !new DOMParser().parseFromString(r.svg,'image/svg+xml').querySelector('parsererror')})()`))
    check('没有渲染异常',await js(`__ERRS__.length===0`))
  } catch(e) {console.error(e);failure++}
  finally {win.destroy();console.log(`失败: ${failure}`);app.exit(failure?1:0)}
})
