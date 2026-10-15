/** 打开导出面板并截图 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')

setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 90000)
app.setPath('userData', path.join(os.tmpdir(), 'bosai-exp-shot-' + Date.now()))

const out = process.argv[2] || path.join(__dirname, '..', 'export-dialog.png')

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
  await new Promise((r) => setTimeout(r, 2800))

  // 打开导出面板
  await win.webContents.executeJavaScript(`(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find(x => x.textContent.trim() === '导出')
    if (b) b.click()
    return !!b
  })()`, true)
  await new Promise((r) => setTimeout(r, 1400))

  const opened = await win.webContents.executeJavaScript(`!!document.querySelector('.export-modal')`)
  console.log('面板已打开:', opened)

  const img = await win.webContents.capturePage()
  fs_write(out, img.toPNG())
  console.log('SAVED', out)

  const errs = await win.webContents.executeJavaScript('(window.__ERRS__||[]).join(" | ")')
  console.log('RENDER_ERRORS:', errs || '无')

  win.destroy()
  app.quit()
})

function fs_write(p, buf) {
  require('node:fs').writeFileSync(p, buf)
}
