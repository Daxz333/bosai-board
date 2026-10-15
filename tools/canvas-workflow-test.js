/** Regression coverage for an apparently blank canvas after creating a diagram. */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
app.setPath('userData', path.join(os.tmpdir(), 'bosai-canvas-' + Date.now()))
const timeout = setTimeout(() => app.exit(2), 60000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ x: -30000, y: -30000, width: 1500, height: 940, show: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
  const js = code => win.webContents.executeJavaScript(code, true)
  const pause = () => new Promise(resolve => setTimeout(resolve, 100))
  let failures = 0
  const check = async (name, code) => {
    const result = await js(code)
    console.log(`${result ? 'PASS' : 'FAIL'} ${name}`)
    if (!result) failures++
  }
  const mouse = async (type, x, y) => {
    win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 })
    await pause()
  }
  try {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    win.focus(); win.webContents.focus(); await pause()
    await js(`window.S=()=>__store.getState(); window.E=__engineeringMod;
      S().setCamera({x:20000,y:-15000,zoom:.05}); S().setTool('hand'); S().newDoc()`)
    await check('新建白板恢复 100% 和选择工具', `S().camera.zoom===1 && S().tool==='select' && Math.abs(S().camera.x)<2000 && Math.abs(S().camera.y)<2000`)
    await js(`[...document.querySelectorAll('.diagram-bar button')].find(b=>b.textContent.includes('新建图')).click()`)
    await pause()
    await js(`[...document.querySelectorAll('.engineering-dialog button')].find(b=>b.textContent==='新建空白图').click()`)
    await pause()
    await check('空白用例图视口正常', `S().page().diagramType==='useCase' && S().camera.zoom===1 && S().page().order.length===0`)
    for (const label of ['参与者', '用例', '系统边界']) {
      await js(`[...document.querySelectorAll('.shape-cell')].find(b=>b.querySelector('span')?.textContent===${JSON.stringify(label)}).click()`)
      await pause()
      const point = await js(`(()=>{const r=document.querySelector('.canvas-host').getBoundingClientRect();return {x:r.x+220+S().page().order.length*200,y:r.y+180}})()`)
      await mouse('mouseDown', point.x, point.y)
      await mouse('mouseMove', point.x + 1, point.y + 1)
      await mouse('mouseUp', point.x + 1, point.y + 1)
      await check('点击放置' + label, `S().selected().length===1 && S().selected()[0].w>=60`)
    }
    await check('专业符号实际绘制在主画布', `(()=>{
      const c=document.querySelector('.canvas-host > canvas'),ctx=c.getContext('2d'),cam=S().camera,dpr=devicePixelRatio;
      return S().page().order.length===3 && S().page().order.every(id=>{const n=S().page().nodes[id];
        const pixels=ctx.getImageData(Math.round((n.x*cam.zoom+cam.x)*dpr),Math.round((n.y*cam.zoom+cam.y)*dpr),Math.round(n.w*cam.zoom*dpr),Math.round(n.h*cam.zoom*dpr)).data;
        let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<160&&pixels[i+1]<160&&pixels[i+2]<160)dark++;
        return dark>50;
      })
    })()`)
    await js(`S().setCurrentShape('useCase')`)
    await pause()
    const drag = await js(`(()=>{const r=document.querySelector('.canvas-host').getBoundingClientRect();return {x:r.x+240,y:r.y+450}})()`)
    await mouse('mouseDown', drag.x, drag.y)
    await mouse('mouseMove', drag.x+230, drag.y+110)
    await mouse('mouseUp', drag.x+230, drag.y+110)
    await check('拖动仍能自定义用例尺寸', `S().selected()[0]?.w===230 && S().selected()[0]?.h===110`)
    await js(`window.useCasePage=S().page().id; S().setCamera({x:20000,y:-15000,zoom:.05}); S().addPage()`)
    await check('新增页面重置视口', `S().camera.zoom===1`)
    await js(`S().setActivePage(useCasePage)`)
    await check('返回用例图时内容位于可见视口', `(()=>{const r=document.querySelector('.canvas-host').getBoundingClientRect(),c=S().camera;return S().page().order.every(id=>{const n=S().page().nodes[id];return n.x*c.zoom+c.x>=0&&n.y*c.zoom+c.y>=0&&(n.x+n.w)*c.zoom+c.x<=r.width&&(n.y+n.h)*c.zoom+c.y<=r.height})})()`)
    await check('工具栏不遮挡图类型入口', `document.querySelector('.toolbar').getBoundingClientRect().top>=document.querySelector('.diagram-bar').getBoundingClientRect().bottom`)
    await check('桌面版品牌图标正常加载', `document.querySelector('.brand-mark').naturalWidth>0`)
    await check('当前图形分类排在最前', `document.querySelector('.shape-group .group-label').textContent.includes('用例')`)
    await js(`window.beforeCount=S().page().order.length; [...document.querySelectorAll('.shape-cell')].find(b=>b.querySelector('span')?.textContent==='参与者').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`)
    await pause()
    await check('双击形状添加并选中', `S().page().order.length===beforeCount+1&&S().selected()[0]?.kind==='actor'`)
    await js(`window.setSearch=value=>{const input=document.querySelector('[aria-label="搜索专业符号"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))};setSearch('无匹配图形xyz')`)
    await pause()
    await check('搜索无结果有清除筛选入口', `!!document.querySelector('.search-empty button')&&document.querySelectorAll('.shape-cell').length===0`)
    await js(`setSearch(E.SYMBOLS.find(s=>s.diagram==='er').label)`)
    await pause()
    await check('搜索可跨图类型查找符号', `document.querySelectorAll('.shape-cell').length>0`)
    await js(`setSearch('');window.beforeWidth=document.querySelector('.canvas-host').clientWidth;document.querySelector('[aria-label="切换形状面板"]').click();document.querySelector('[aria-label="切换属性面板"]').click()`)
    await pause()
    await check('收起面板增加画布空间', `document.querySelector('.canvas-host').clientWidth>beforeWidth+400 && getComputedStyle(document.querySelector('.left')).display==='none'`)
    await js(`document.querySelector('[aria-label="切换形状面板"]').click();document.querySelector('[aria-label="切换属性面板"]').click();document.querySelector('[aria-label="新增空白页面"]').click()`)
    await pause()
    await check('底部新增页面与空白引导', `S().page().order.length===0 && !!document.querySelector('.canvas-empty') && document.querySelector('.page-strip [aria-current="page"]').textContent.includes(S().page().name)`)
    await js(`document.querySelectorAll('.page-strip-list button')[1].click()`)
    await pause()
    await check('底部切页恢复用例图', `S().page().id===useCasePage`)
    await js(`S().newDoc();S().editDoc('预览',d=>E.insertTemplate(d,E.TEMPLATES.find(t=>t.type==='useCase').id));S().fitView()`)
    await pause()
    fs.writeFileSync(path.join(__dirname,'..','reports','WORKSPACE_LAYOUT_1500.png'),(await win.webContents.capturePage()).toPNG())
    win.setSize(1024, 700); await pause()
    await js(`S().fitView()`); await pause()
    await check('小窗口画布仍有可用尺寸', `document.querySelector('.canvas-host').clientWidth>=500 && document.querySelector('.canvas-host').clientHeight>=450`)
    await check('小窗口状态栏与缩放按钮不重叠', `document.querySelector('.canvas-status').getBoundingClientRect().bottom<=document.querySelector('.zoombar').getBoundingClientRect().top`)
    fs.writeFileSync(path.join(__dirname,'..','reports','WORKSPACE_LAYOUT_1024.png'),(await win.webContents.capturePage()).toPNG())
    await check('无渲染异常', `__ERRS__.length===0`)
    console.log(JSON.stringify(await js(`({camera:S().camera,errors:__ERRS__})`)))
    clearTimeout(timeout); app.exit(failures ? 1 : 0)
  } catch (error) { console.error(error); clearTimeout(timeout); app.exit(1) }
})
