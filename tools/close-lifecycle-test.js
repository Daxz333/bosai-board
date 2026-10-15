const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const fs = require('node:fs')

app.setPath('userData', path.join(os.tmpdir(), `bosai-close-test-${process.pid}`))
app.on('before-quit', event => event.preventDefault())
const created = new Promise(resolve => app.once('browser-window-created', (_event, win) => resolve(win)))
require('../electron/main')
const timeout = setTimeout(() => { console.error('TIMEOUT close lifecycle'); app.exit(2) }, 20000)

created.then(async win => {
  try {
    if (win.webContents.isLoadingMainFrame()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve))
    await win.webContents.executeJavaScript(`(async () => {
      const S = () => window.__store.getState()
      if (S().doc.title !== '产品流程图示例') await new Promise(resolve => {
        const unsub = window.__store.subscribe(state => { if (state.doc.title === '产品流程图示例') { unsub(); resolve() } })
      })
      S().setTitle('unsaved close test')
      window.__closeCount = 0
      window.confirm = () => { window.__closeCount++; return false }
    })()`)
    const firstResponse = new Promise(resolve => ipcMain.once('app:closeResponse', (_event, value) => resolve(value)))
    win.close()
    const declined = await firstResponse
    const stillOpen = !win.isDestroyed() && await win.webContents.executeJavaScript(`window.__closeCount === 2 && window.__store.getState().dirty`)
    assert.equal(declined, false)
    assert.equal(stillOpen, true)
    console.log('PASS native close cancel keeps unsaved document')

    const inaccessible = path.join(os.tmpdir(), `bosai-no-such-directory-${process.pid}`, 'failed.bosai')
    assert.equal(fs.existsSync(path.dirname(inaccessible)), false)
    await win.webContents.executeJavaScript(`window.__store.getState().setFilePath(${JSON.stringify(inaccessible)}); window.confirm = () => true; window.alert = () => {}; true`)
    const failedResponse = new Promise(resolve => ipcMain.once('app:closeResponse', (_event, value) => resolve(value)))
    win.close()
    assert.equal(await failedResponse, false)
    assert.equal(win.isDestroyed(), false)
    console.log('PASS native close write failure keeps window open')

    await win.webContents.executeJavaScript(`window.__store.getState().setFilePath(null); true`)
    await win.webContents.executeJavaScript(`window.__closeCount = 0; window.confirm = () => ++window.__closeCount === 2; true`)
    const closed = new Promise(resolve => win.once('closed', resolve))
    win.close()
    await closed
    assert.equal(win.isDestroyed(), true)
    console.log('PASS native close discard closes window')
    clearTimeout(timeout)
    app.exit(0)
  } catch (error) { clearTimeout(timeout); console.error(error); app.exit(1) }
})
