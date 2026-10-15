/** 真实 Chromium 指针/键盘交互，覆盖桌面专业绘图的基础工作流。 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
app.setPath('userData', path.join(os.tmpdir(), 'bosai-professional-' + Date.now()))
const timeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(1) }, 60000)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ x: -30000, y: -30000, width: 1500, height: 940, show: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
  const out = []
  const wait = () => new Promise(resolve => setTimeout(resolve, 100))
  const js = code => win.webContents.executeJavaScript(code, true)
  const check = (name, ok, detail = '') => { out.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }
  const mouse = async (type, x, y, button = 'left', clickCount = 1) => {
    win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button, clickCount, modifiers: type === 'mouseMove' ? ['leftButtonDown'] : [] }); await wait()
  }
  const key = async (keyCode, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await wait()
  }
  try {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    win.focus()
    win.webContents.focus()
    await js(`(async () => { const S = () => window.__store.getState(); if (S().doc.title !== '产品流程图示例') await new Promise(resolve => { const unsub = window.__store.subscribe(state => { if (state.doc.title === '产品流程图示例') { unsub(); resolve() } }) }) })()`)
    await js(`(() => {
      const s = window.__store.getState()
      window.__fitDone = new Promise(resolve => { const unsub = window.__store.subscribe((state, previous) => { if (state.camera !== previous.camera) { unsub(); resolve() } }) })
      const base = { w: 120, h: 70, rot: 0, fill: '#e8f0ff', stroke: '#3b6fe0', strokeWidth: 2, text: '', z: 1 }
      const nodes = {
        a: { ...base, id: 'a', kind: 'rect', x: 100, y: 200 },
        b: { ...base, id: 'b', kind: 'ellipse', x: 400, y: 200 },
        t: { ...base, id: 't', kind: 'table', x: 100, y: 380, w: 300, h: 150, rows: 3, cols: 3,
          data: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ text: '' }))) }
      }
      s.loadDoc({ version: 1, title: '真实交互测试', pages: [{ id: 'page', name: '页面 1', nodes, order: ['a','b','t'], background: '#fff' }], activePageId: 'page', createdAt: Date.now(), updatedAt: Date.now() })
    })()`)
    await js(`window.__fitDone`)
    await js(`window.__store.getState().setCamera({ x: 0, y: 0, zoom: 1 })`)
    await wait()
    const host = await js(`(() => { const r = document.querySelector('.canvas-host').getBoundingClientRect(); return { x: r.x, y: r.y } })()`)
    const clickWorld = async (x, y, count = 1) => { await mouse('mouseDown', host.x + x, host.y + y, 'left', count); await mouse('mouseUp', host.x + x, host.y + y, 'left', count) }
    const dragWorld = async (x1,y1,x2,y2) => { await mouse('mouseDown', host.x+x1,host.y+y1); await mouse('mouseMove',host.x+(x1+x2)/2,host.y+(y1+y2)/2); await mouse('mouseMove',host.x+x2,host.y+y2); await mouse('mouseUp',host.x+x2,host.y+y2) }

    await clickWorld(160, 235)
    check('选区工具条实际渲染', await js(`document.querySelector('.selection-toolbar') !== null && document.querySelector('.prop-panel').textContent.includes('矩形')`), await js(`JSON.stringify({focus:document.hasFocus(), camera:window.__store.getState().camera, selection:window.__store.getState().selection})`))
    await js(`window.__store.getState().setTool('connector')`); await wait()
    await dragWorld(160,235,460,235)
    check('真实拖拽连线双端绑定', await js(`(() => { const s=window.__store.getState(); const n=Object.values(s.page().nodes).find(n=>n.kind==='connector'); return n && n.from?.nodeId==='a' && n.to?.nodeId==='b' && n.strokeWidth===2 })()`))
    await dragWorld(220,235,250,300)
    check('拖动连线端点解除绑定',await js(`(()=>{const n=window.__store.getState().selected()[0];return n?.kind==='connector'&&!n.from&&n.to?.nodeId==='b'})()`))
    await key('Z',['control'])
    check('连线端点编辑可撤销',await js(`window.__store.getState().selected()[0]?.from?.nodeId==='a'`))

    await js(`window.__store.getState().setTool('hand')`); await wait()
    await mouse('mouseDown',host.x+600,host.y+600)
    await mouse('mouseMove',host.x+610,host.y+605)
    await mouse('mouseMove',host.x+620,host.y+610)
    await mouse('mouseUp',host.x+620,host.y+610)
    check('平移位移不累加', await js(`(() => { const c=window.__store.getState().camera; return c.x===20 && c.y===10 })()`))
    await js(`window.__store.getState().setCamera({ x:0,y:0,zoom:1 }); window.__store.getState().setTool('select')`); await wait()

    await clickWorld(250,455,2)
    check('双击打开指定单元格', await js(`document.querySelector('textarea[aria-label="编辑第 2 行第 2 列"]') !== null`))
    win.webContents.insertText('单元格验收'); await wait(); await key('Enter')
    check('单元格内容写入正确行列', await js(`window.__store.getState().page().nodes.t.data[1][1].text === '单元格验收'`))
    await key('Z', ['control'])
    check('单元格编辑可撤销', await js(`window.__store.getState().page().nodes.t.data[1][1].text === ''`))

    await key('B')
    await clickWorld(100,100)
    await dragWorld(300,120,330,160)
    await key('Enter')
    check('钢笔创建三次曲线路径', await js(`(() => { const n=window.__store.getState().selected()[0]; return n?.kind==='path' && n.anchors.length===2 && !!n.anchors[1].in && document.querySelector('.vector-actions').textContent.includes('锚点') })()`))
    await dragWorld(100,100,120,110)
    check('真实拖动锚点', await js(`(() => { const n=window.__store.getState().selected()[0]; return n && Math.abs(n.x+n.anchors[0].x*n.w-120)<1 && Math.abs(n.y+n.anchors[0].y*n.h-110)<1 })()`))
    require('node:fs').writeFileSync(path.join(os.tmpdir(),`bosai-professional-preview-${process.pid}.png`),(await win.webContents.capturePage()).toPNG())

    check('路径 SVG 与 XML 有效', await js(`(() => { const s=window.__store.getState(); const {svg}=window.__exportMod.exportPageSvg(s.doc,s.doc.activePageId,{transparent:true}); const xml=new DOMParser().parseFromString(svg,'image/svg+xml'); return !xml.querySelector('parsererror') && [...xml.querySelectorAll('path')].some(p=>p.getAttribute('d')?.includes(' C ')) })()`))
    check('真实 BMP 文件头', await js(`(async () => { const s=window.__store.getState(); const url=await window.__exportMod.exportPageImage(s.doc,s.doc.activePageId,'bmp',{scale:1}); const bytes=atob(url.split(',')[1]); return bytes.slice(0,2)==='BM' })()`))

    await js(`window.__store.getState().setDirty(true); window.__store.getState().autosave()`)
    check('自动缓存保留磁盘未保存状态', await js(`window.__store.getState().dirty === true`))
    await js(`document.querySelectorAll('.right-tabs button')[1].click()`); await wait()
    check('页面管理入口接通', await js(`document.querySelector('.page-list .add-page') !== null`))
    await js(`document.querySelector('.page-list .add-page').click()`); await wait()
    check('页面按钮实际新增', await js(`window.__store.getState().doc.pages.length === 2 && document.querySelectorAll('.page-item').length === 2`))
    const errors = await js(`window.__ERRS__ || []`)
    check('无渲染异常', errors.length === 0, JSON.stringify(errors))
    const failures=out.filter(r=>!r.ok).length
    console.log(`结果: ${out.length-failures} 通过, ${failures} 失败`)
    process.exitCode=failures?1:0
  } catch (error) { console.error(error); process.exitCode=1 }
  finally { clearTimeout(timeout); win.destroy(); app.exit(process.exitCode || 0) }
})
