/**
 * 开发期辅助脚本：用 Electron 主进程抓取窗口截图，
 * 用于验证画布渲染效果。用法：node tools/shot.js [outPath] [delayMs]
 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const out = process.argv[2] || path.join(__dirname, '..', 'shot.png')
const delay = Number(process.argv[3] || 2500)

// 用临时用户目录隔离 localStorage，确保每次都是全新状态
const tmpProfile = path.join(os.tmpdir(), 'bosai-shot-' + Date.now())
app.setPath('userData', tmpProfile)

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1500, height: 940, show: false,
    backgroundColor: '#1b1d23',
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  await new Promise((r) => setTimeout(r, delay))
  if (process.argv.includes('select')) {
    const selected = await win.webContents.executeJavaScript(`(() => {
      const s = window.__store.getState()
      const id = s.page().order.find(id => {
        const n = s.page().nodes[id]
        return n && n.kind !== 'connector' && n.kind !== 'text'
      })
      const n = s.page().nodes[id]
      const canvas = document.querySelector('.canvas-host > canvas')
      const rect = canvas.getBoundingClientRect()
      const x = rect.left + s.camera.x + (n.x + n.w / 2) * s.camera.zoom
      const y = rect.top + s.camera.y + (n.y + n.h / 2) * s.camera.zoom
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y, pointerId: 1 }))
      canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: x, clientY: y, pointerId: 1 }))
      return window.__store.getState().selection
    })()`)
    console.log('SELECTED', selected.join(','))
    await new Promise((r) => setTimeout(r, 180))
  }

  // 收集渲染层错误
  const errs = await win.webContents.executeJavaScript('window.__ERRS__ || []')

  const img = await win.webContents.capturePage()
  fs.writeFileSync(out, img.toPNG())
  console.log('SAVED', out)
  if (errs && errs.length) console.log('RENDER_ERRORS', JSON.stringify(errs, null, 2))
  else console.log('RENDER_ERRORS none')
  win.destroy()
  app.quit()
})
