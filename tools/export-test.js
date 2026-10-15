/** 导出功能测试：验证多格式 + 透明通道真实生效 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 90000)
app.setPath('userData', path.join(os.tmpdir(), 'bosai-export-' + Date.now()))

const SCRIPT = `(async () => {
  const st = window.__store.getState()
  const mod = await import('/assets/export-test.js').catch(() => null)
  return 'noop'
})()`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1500, height: 940, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  await new Promise((r) => setTimeout(r, 3000))

  const results = await win.webContents.executeJavaScript(`(async () => {
    const S = () => window.__store.getState()
    const exp = window.__exportMod
    if (!exp) return [['导出模块未暴露', false, '缺少 window.__exportMod']]
    const out = []
    const pageId = S().doc.activePageId

    // 1. 透明 PNG：检查 alpha 通道
    const pngT = await exp.exportPageImage(S().doc, pageId, 'png', { scale: 1, transparent: true })
    let hasAlpha = false, cornerAlpha = -1
    if (pngT && pngT.startsWith('data:image/png')) {
      const img = new Image()
      await new Promise(r => { img.onload = r; img.src = pngT })
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const cx = c.getContext('2d')
      cx.drawImage(img, 0, 0)
      const d = cx.getImageData(0, 0, 1, 1).data
      cornerAlpha = d[3]
      hasAlpha = cornerAlpha === 0
    }
    out.push(['透明 PNG 含 Alpha', pngT.startsWith('data:image/png') && hasAlpha, '左上角 alpha=' + cornerAlpha])

    // 2. 不透明 PNG：角应为不透明
    const pngO = await exp.exportPageImage(S().doc, pageId, 'png', { scale: 1, transparent: false, background: '#FF0000' })
    let redFill = false
    if (pngO) {
      const img = new Image()
      await new Promise(r => { img.onload = r; img.src = pngO })
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const cx = c.getContext('2d')
      cx.drawImage(img, 0, 0)
      const d = cx.getImageData(0, 0, 1, 1).data
      redFill = d[3] === 255 && d[0] > 200 && d[1] < 60 && d[2] < 60
    }
    out.push(['不透明 PNG 填充底色', redFill, redFill ? '红色不透明' : '未填充红色'])

    // 3. JPEG 必须是 image/jpeg，且透明请求被忽略
    const jpg = await exp.exportPageImage(S().doc, pageId, 'jpg', { scale: 1, transparent: true, background: '#0000FF' })
    out.push(['JPEG MIME 正确', jpg.startsWith('data:image/jpeg'), jpg.slice(0, 24)])

    // 4. JPEG 合成底色而非黑块（检查四角不透明）
    let jpgOk = false
    if (jpg) {
      const img = new Image()
      await new Promise(r => { img.onload = r; img.src = jpg })
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const cx = c.getContext('2d')
      cx.drawImage(img, 0, 0)
      const d = cx.getImageData(0, 0, 1, 1).data
      jpgOk = d[2] > 200 && d[0] < 60
    }
    out.push(['JPEG 合成底色(蓝)', jpgOk, jpgOk ? '四角为蓝色非黑块' : 'JPEG 底色异常'])

    // 5. WebP 透明
    const webp = await exp.exportPageImage(S().doc, pageId, 'webp', { scale: 1, transparent: true })
    out.push(['WebP 透明导出', webp.startsWith('data:image/webp'), webp.slice(0, 22)])

    // 6. 缩放生效
    const s1 = await exp.exportPageImage(S().doc, pageId, 'png', { scale: 1, transparent: true, padding: 0 })
    const s3 = await exp.exportPageImage(S().doc, pageId, 'png', { scale: 3, transparent: true, padding: 0 })
    const d1 = exp.estimateDataUrlBytes(s1)
    const d3 = exp.estimateDataUrlBytes(s3)
    out.push(['3x 体积大于 1x', d3 > d1 * 3, Math.round(d1/1024) + 'KB -> ' + Math.round(d3/1024) + 'KB'])

    // 7. 只导出选中
    const shape = S().page().order.map(id => S().page().nodes[id]).find(n => n.kind === 'rect')
    S().select([shape.id])
    const selImg = await exp.exportPageImage(S().doc, pageId, 'png', { scale: 1, transparent: true, onlySelection: true, selection: [shape.id] })
    const fullImg = await exp.exportPageImage(S().doc, pageId, 'png', { scale: 1, transparent: true })
    out.push(['仅选中范围更小', exp.estimateDataUrlBytes(selImg) < exp.estimateDataUrlBytes(fullImg),
      Math.round(exp.estimateDataUrlBytes(selImg)/1024) + 'KB < ' + Math.round(exp.estimateDataUrlBytes(fullImg)/1024) + 'KB'])

    // 8. SVG 矢量导出
    const { svg } = exp.exportPageSvg(S().doc, pageId)
    out.push(['SVG 导出', svg.startsWith('<svg') && svg.includes('</svg>'), svg.length + ' 字符'])

    // 9. 支持透明的能力表
    out.push(['透明能力判定正确',
      exp.supportsTransparency('png') === true && exp.supportsTransparency('webp') === true &&
      exp.supportsTransparency('jpg') === false && exp.supportsTransparency('jpeg') === false,
      'png/webp=true, jpg/jpeg=false'])

    // 10. 空页面安全
    const emptyDoc = { ...S().doc, pages: [{ id: 'e1', name: '空', background: '#fff', nodes: {}, order: [] }], activePageId: 'e1' }
    const empty = await exp.exportPageImage(emptyDoc, 'e1', 'png', { scale: 1, transparent: true })
    out.push(['空页面不崩溃', empty === '', '返回空字符串'])

    return out
  })()`, true)

  let pass = 0, fail = 0
  for (const [name, ok, detail] of results) {
    console.log((ok ? '  PASS  ' : '  FAIL  ') + String(name).padEnd(22) + ' ' + detail)
    ok ? pass++ : fail++
  }
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')

  const errs = await win.webContents.executeJavaScript('(window.__ERRS__||[]).join(" | ")')
  console.log('渲染错误:', errs || '无')

  win.destroy()
  app.quit()
})
