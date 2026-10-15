const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { writeAtomic } = require('../electron/atomic-file')

app.setPath('userData', path.join(os.tmpdir(), `bosai-data-test-${process.pid}`))
const failures = []
const check = (name, actual) => {
  try { assert.equal(actual, true); console.log(`PASS ${name}`) }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`) }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
  win.webContents.on('console-message', (_event, level, message) => console.error('renderer', level, message))
  const timeout = setTimeout(async () => { try { console.error('TIMEOUT at', await win.webContents.executeJavaScript('({stage:window.__dataTestStage,title:window.__store?.getState().doc.title,html:document.querySelector(".topbar")?.outerHTML.slice(0,100)})')) } catch {} app.exit(2) }, 20000)
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'))
    const result = await win.webContents.executeJavaScript(`(async () => {
      const S = () => window.__store.getState()
      const stage = value => window.__dataTestStage = value
      if (S().doc.title !== '产品流程图示例') await new Promise(resolve => {
        const unsub = window.__store.subscribe(state => { if (state.doc.title === '产品流程图示例') { unsub(); resolve() } })
      })
      const base = (title = 'base') => ({version:1, title, pages:[{id:'p',name:'page',background:'#fff',nodes:{},order:[]}],activePageId:'p',createdAt:1,updatedAt:1})
      const reset = () => S().loadDoc(base())
      const results = {}
      const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
      reset(); S().addPage(); results.addPageDirty = S().dirty && S().revision === 1
      S().setDirty(false); S().removePage(S().doc.activePageId); results.removePageDirty = S().dirty && S().revision === 2
      reset(); S().setTitle('unsaved')
      let choices = 0, done
      const refused = new Promise(resolve => done = resolve)
      window.confirm = () => { choices++; if (choices === 2) done(); return false }
      window.boardAPI = {openFile: async () => ({ok:true,path:'C:/other.bosai',content:JSON.stringify(base('opened'))})}
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))
      stage('open cancel'); await refused; await tick()
      results.openCancel = S().doc.title === 'unsaved' && choices === 2
      reset(); S().setTitle('before')
      let resolveSave, started
      const saveStarted = new Promise(resolve => started = resolve)
      window.boardAPI = {saveFile: () => { started(); return new Promise(resolve => resolveSave = resolve) }}
      document.querySelector('.top-right .btn-primary').click()
      stage('save started'); await saveStarted
      const initialRevision = S().revision
      S().setTitle('after')
      const saved = new Promise(resolve => {
        const unsub = window.__store.subscribe(state => { if(state.filePath === 'C:/saved.bosai') { unsub(); resolve() } })
      })
      stage('save completed'); resolveSave({ok:true,path:'C:/saved.bosai'}); await saved
      results.pendingEdit = S().dirty && S().revision > initialRevision && S().filePath === 'C:/saved.bosai'
      await tick()
      reset(); S().setTitle('old')
      let resolveOld, oldStarted
      const oldSaveStarted = new Promise(resolve => oldStarted = resolve)
      window.boardAPI = {saveFile: () => { oldStarted(); return new Promise(resolve => resolveOld = resolve) }}
      document.querySelector('.top-right .btn-primary').click(); stage('old save started'); await oldSaveStarted
      S().loadDoc({...S().doc, title:'new'}, 'C:/new.bosai')
      resolveOld({ok:true,path:'C:/old.bosai'}); await tick()
      results.oldSaveIsolated = S().doc.title === 'new' && S().filePath === 'C:/new.bosai' && !S().dirty
      reset(); S().setTitle('keep')
      let errorShown
      const sawError = new Promise(resolve => errorShown = resolve)
      window.alert = () => errorShown()
      window.confirm = () => true
      window.boardAPI = {openFile: async () => ({ok:true,path:'C:/other.bosai',content:JSON.stringify(base('opened'))}),saveFile: async () => ({ok:false,error:'synthetic write failure'})}
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))
      stage('write error'); await sawError; await tick()
      results.writeFailureStopsOpen = S().doc.title === 'keep' && S().dirty
      reset(); S().setTitle('keep canceled')
      let saveCanceled
      const sawCancel = new Promise(resolve => saveCanceled = resolve)
      window.boardAPI = {openFile: async () => ({ok:true,path:'C:/other.bosai',content:JSON.stringify(base('opened'))}),saveFile: async () => { saveCanceled(); return {ok:false,canceled:true} }}
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))
      await sawCancel; await tick()
      results.saveCancelStopsOpen = S().doc.title === 'keep canceled' && S().dirty
      reset(); S().setTitle('first revision')
      let resolveFirst, startedFirst
      const firstStarted = new Promise(resolve => startedFirst = resolve)
      const savedContents = []
      window.confirm = () => true
      window.boardAPI = {
        openFile: async () => ({ok:true,path:'C:/next.bosai',content:JSON.stringify(base('opened after both saves'))}),
        saveFile: ({content}) => { savedContents.push(JSON.parse(content).title); if (savedContents.length === 1) { startedFirst(); return new Promise(resolve => resolveFirst = resolve) } return Promise.resolve({ok:true,path:'C:/saved-twice.bosai'}) }
      }
      const switched = new Promise(resolve => {
        const unsub = window.__store.subscribe(state => { if (state.doc.title === 'opened after both saves') { unsub(); resolve() } })
      })
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))
      await firstStarted
      S().setTitle('second revision')
      resolveFirst({ok:true,path:'C:/saved-twice.bosai'})
      await switched
      results.saveDuringSwitchRepeats = savedContents.join('|') === 'first revision|second revision'
      reset(); S().setTitle('keep')
      let parseError
      const sawParseError = new Promise(resolve => parseError = resolve)
      window.alert = () => parseError()
      window.boardAPI = {openFile: async () => ({ok:true,path:'C:/bad.bosai',content:'{"version":999,"pages":[]}'})}
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'o',ctrlKey:true,bubbles:true}))
      stage('parse error'); await sawParseError; await tick()
      results.corruptKeepsDoc = S().doc.title === 'keep' && S().dirty
      reset(); S().addPage(); S().autosave()
      const raw = JSON.parse(localStorage.getItem('bosai-board:autosave'))
      results.snapshotMetadata = raw.documentId === S().documentId && raw.revision === S().revision && raw.dirty === true && Number.isFinite(raw.savedAt)
      S().loadDoc(base('other'))
      results.restoreDirty = S().restore() && S().dirty && S().doc.pages.length === 2 && S().revision === raw.revision
      let savedPath
      const completed = new Promise(resolve => {
        const unsub = window.__store.subscribe(state => { if (state.filePath === 'C:/restored.bosai' && !state.dirty) { unsub(); resolve() } })
      })
      window.boardAPI = {saveFile: async () => ({ok:true,path:'C:/restored.bosai'})}
      document.querySelector('.top-right .btn-primary').click(); await completed
      results.explicitSaveClearsRecovery = localStorage.getItem('bosai-board:autosave') === null
      reset(); S().setTitle('continuous 0')
      const originalSetForCadence = Storage.prototype.setItem
      let noticeSnapshot
      const snapshotWritten = new Promise(resolve => noticeSnapshot = resolve)
      Storage.prototype.setItem = function(key, value) { originalSetForCadence.call(this, key, value); if (key === 'bosai-board:autosave') noticeSnapshot() }
      let editNumber = 0
      const edits = setInterval(() => S().setTitle('continuous ' + ++editNumber), 40)
      let deadline
      try {
        await Promise.race([snapshotWritten, new Promise((_, reject) => deadline = setTimeout(() => reject(new Error('continuous edit snapshot timeout')), 4000))])
        results.continuousEditSnapshot = editNumber > 0 && !!localStorage.getItem('bosai-board:autosave')
      } finally { clearInterval(edits); clearTimeout(deadline); Storage.prototype.setItem = originalSetForCadence }
      localStorage.setItem('bosai-board:autosave','{bad json')
      const titleBefore = S().doc.title
      results.badRecoveryVisible = !S().restore() && !!S().recoveryError && S().doc.title === titleBefore && localStorage.getItem('bosai-board:autosave') === '{bad json'
      const originalSet = Storage.prototype.setItem
      Storage.prototype.setItem = () => { throw new Error('synthetic quota') }
      S().autosave()
      results.quotaVisible = !!S().recoveryError && S().recoveryError.includes('synthetic quota')
      Storage.prototype.setItem = originalSet
      return results
    })()`)
    for (const [name, passed] of Object.entries(result)) check(name, passed)

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosai-atomic-'))
    const target = path.join(dir, 'sample.bosai')
    try {
      fs.writeFileSync(target, 'old')
      writeAtomic(target, 'new')
      check('atomicSuccess', fs.readFileSync(target, 'utf8') === 'new')
      const failedOps = { ...fs, writeFileSync() { throw new Error('synthetic disk failure') } }
      let failed = false
      try { writeAtomic(target, 'bad', failedOps) } catch { failed = true }
      check('atomicFailurePreservesOriginal', failed && fs.readFileSync(target, 'utf8') === 'new' && fs.readdirSync(dir).length === 1)
      const failedRenameOps = { ...fs, renameSync() { throw new Error('synthetic rename failure') } }
      failed = false
      try { writeAtomic(target, 'bad', failedRenameOps) } catch { failed = true }
      check('atomicRenameFailurePreservesOriginal', failed && fs.readFileSync(target, 'utf8') === 'new' && fs.readdirSync(dir).length === 1)
      const imageTarget = path.join(dir, 'sample.png')
      writeAtomic(imageTarget, Buffer.from([0, 1, 255]))
      check('atomicBinaryExport', fs.readFileSync(imageTarget).equals(Buffer.from([0, 1, 255])))
      fs.unlinkSync(imageTarget)
    } finally {
      fs.unlinkSync(target)
      fs.rmdirSync(dir)
    }
  } catch (error) { failures.push('runner'); console.error(error) }
  finally { clearTimeout(timeout); win.destroy(); console.log(`data protection: ${failures.length} failures`); app.exit(failures.length ? 1 : 0) }
})
