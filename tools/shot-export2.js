/** 截取导出面板在 JPG / PNG 两种模式下的对比图 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 120000)
app.setPath('userData', path.join(os.tmpdir(), 'bosai-exp2-' + Date.now()))

const outDir = path.join(__dirname, '..')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1500, height: 940, show: false, backgroundColor: '#1b1d23',
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  await new Promise((r) => setTimeout(r, 2800))

  const openPanel = async () => {
    await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '导出')
      if (b) b.click()
    })()`, true)
    await new Promise((r) => setTimeout(r, 1300))
  }

  const pickFormat = async (label) => {
    await win.webContents.executeJavaScript(`(() => {
      const c = [...document.querySelectorAll('.format-cell')].find(x => x.textContent.includes(${JSON.stringify(label)}))
      if (c) c.click()
    })()`, true)
    await new Promise((r) => setTimeout(r, 1200))
  }

  const readState = () => win.webContents.executeJavaScript(`(() => {
    const cb = document.querySelector('.opt-check input')
    const note = document.querySelector('.opt-note')
    const alphaTag = document.querySelector('.tag-alpha')
    const opaqueTag = document.querySelector('.tag-opaque')
    const stage = document.querySelector('.preview-stage')
    return {
      checkboxDisabled: cb ? cb.disabled : null,
      checkboxChecked: cb ? cb.checked : null,
      noteText: note ? note.textContent.trim() : null,
      footTag: alphaTag ? 'alpha' : (opaqueTag ? 'opaque' : 'none'),
      checkerBg: stage ? getComputedStyle(stage).backgroundImage !== 'none' : null
    }
  })()`, true)

  await openPanel()
  console.log('PNG 模式:', JSON.stringify(await readState()))
  fs.writeFileSync(path.join(outDir, 'export-png.png'), (await win.webContents.capturePage()).toPNG())

  await pickFormat('JPG')
  console.log('JPG 模式:', JSON.stringify(await readState()))
  fs.writeFileSync(path.join(outDir, 'export-jpg.png'), (await win.webContents.capturePage()).toPNG())

  const errs = await win.webContents.executeJavaScript('(window.__ERRS__||[]).join(" | ")')
  console.log('RENDER_ERRORS:', errs || '无')
  win.destroy()
  app.quit()
})
