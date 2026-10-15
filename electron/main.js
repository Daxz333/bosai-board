const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { writeAtomic } = require('./atomic-file')

const isDev = !app.isPackaged && process.env.BOSAI_DEV === '1'
let mainWindow = null
let closeApproved = false
let closePromptPending = false

function createWindow() {
  closeApproved = false
  closePromptPending = false
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#1b1d23',
    title: 'BoSai Board 白板',
    icon: path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5273')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.on('close', (event) => {
    if (closeApproved || mainWindow.webContents.isDestroyed() || mainWindow.webContents.isLoadingMainFrame()) return
    event.preventDefault()
    if (!closePromptPending) {
      closePromptPending = true
      mainWindow.webContents.send('app:closeRequested')
    }
  })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/* ---------------- IPC：文件读写 / 导入导出 ---------------- */

ipcMain.handle('file:new', async () => ({ ok: true }))
ipcMain.on('app:closeResponse', (event, approved) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !closePromptPending) return
  closePromptPending = false
  if (approved === true) { closeApproved = true; mainWindow.close() }
})

ipcMain.handle('file:open', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '打开白板文件',
    filters: [{ name: '白板文件', extensions: ['bosai', 'json'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true }
  try {
    if (fs.statSync(res.filePaths[0]).size > 50 * 1024 * 1024) throw new Error('工程文件超过 50 MB 限制')
    const text = fs.readFileSync(res.filePaths[0], 'utf8')
    return { ok: true, path: res.filePaths[0], content: text }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

ipcMain.handle('file:save', async (_e, payload) => {
  const { path: existingPath, defaultName, content } = payload || {}
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 50 * 1024 * 1024) return { ok: false, error: '工程内容无效或超过 50 MB' }
  try {
    const doc = JSON.parse(content)
    if (![1,2].includes(doc?.version) || !Array.isArray(doc.pages) || doc.pages.length < 1) throw new Error('工程内容结构无效')
  } catch (e) { return { ok: false, error: String(e.message || e) } }
  if (existingPath) {
    if (!path.isAbsolute(existingPath) || !/\.(bosai|json)$/i.test(existingPath)) return { ok: false, error: '无效的工程文件路径' }
    try {
      writeAtomic(existingPath, content)
      return { ok: true, path: existingPath }
    } catch (e) { return { ok: false, error: String(e.message || e) } }
  }
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '保存白板文件',
    defaultPath: defaultName || '未命名白板.bosai',
    filters: [{ name: '白板文件', extensions: ['bosai', 'json'] }]
  })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  try {
    writeAtomic(res.filePath, content)
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

ipcMain.handle('file:saveAs', async (_e, { defaultName, content }) => {
  return saveDirect(defaultName, content)
})

async function saveDirect(defaultName, content) {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '另存为',
    defaultPath: defaultName || '未命名.bosai',
    filters: [{ name: '白板文件', extensions: ['bosai', 'json'] }]
  })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  try {
    writeAtomic(res.filePath, content)
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
}

ipcMain.handle('file:exportImage', async (_e, { defaultName, dataUrl }) => {
  // 根据导出格式给出对应的文件类型过滤器
  const ext = (path.extname(defaultName || '').replace('.', '') || 'png').toLowerCase()
  const filters = [
    { name: 'PNG 图片（支持透明）', extensions: ['png'] },
    { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] },
    { name: 'WebP 图片（支持透明）', extensions: ['webp'] },
    { name: 'BMP 图片', extensions: ['bmp'] },
    { name: '所有图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }
  ]
  // 把当前格式对应的过滤器排在最前
  const priority = ext === 'jpg' || ext === 'jpeg' ? 1 : ext === 'webp' ? 2 : ext === 'bmp' ? 3 : 0
  const ordered = [filters[priority], ...filters.filter((_, i) => i !== priority)]

  const res = await dialog.showSaveDialog(mainWindow, {
    title: '导出图片',
    defaultPath: defaultName || '白板导出.png',
    filters: ordered
  })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  try {
    const b64 = String(dataUrl).replace(/^data:image\/[\w+.-]+;base64,/, '')
    writeAtomic(res.filePath, Buffer.from(b64, 'base64'))
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

ipcMain.handle('file:exportText', async (_e, { defaultName, content, ext, name }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '导出',
    defaultPath: defaultName || `白板导出.${ext}`,
    filters: [{ name: name || ext.toUpperCase(), extensions: [ext] }]
  })
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  try {
    writeAtomic(res.filePath, content)
    return { ok: true, path: res.filePath }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

ipcMain.handle('file:importImage', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '插入图片',
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true }
  const files = []
  for (const p of res.filePaths) {
    try {
      const buf = fs.readFileSync(p)
      const ext = path.extname(p).slice(1).toLowerCase()
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
      files.push({ name: path.basename(p), dataUrl: `data:${mime};base64,${buf.toString('base64')}` })
    } catch (e) { /* 跳过读取失败的文件 */ }
  }
  return { ok: true, files }
})

ipcMain.handle('file:importDrawing', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '导入可编辑绘图（SVG / VSDX）',
    filters: [{ name: '矢量与 Visio 文件', extensions: ['svg', 'vsdx'] }], properties: ['openFile']
  })
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true }
  try {
    const file = res.filePaths[0], format = path.extname(file).slice(1).toLowerCase()
    if (!['svg', 'vsdx'].includes(format)) throw new Error('仅支持 SVG 或 VSDX')
    if (fs.statSync(file).size > 32 * 1024 * 1024) throw new Error('绘图文件最大支持 32 MB')
    const buffer = fs.readFileSync(file)
    return { ok: true, name: path.basename(file), format,
      ...(format === 'svg' ? { content: buffer.toString('utf8') } : { parts: require('./vsdx').readVsdx(buffer) }) }
  } catch (e) { return { ok: false, error: String(e.message || e) } }
})

ipcMain.handle('app:info', async () => ({
  version: app.getVersion(),
  platform: process.platform,
  userData: app.getPath('userData')
}))

ipcMain.handle('app:openPath', async (_e, p) => { shell.showItemInFolder(p) })
