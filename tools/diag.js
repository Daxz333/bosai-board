/** 运行时诊断：检查连线端点、路由与节点状态 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

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

  const info = await win.webContents.executeJavaScript(`(() => {
    const s = window.__store && window.__store.getState ? window.__store.getState() : null
    if (!s) return { error: 'store 未暴露到 window' }
    const page = s.page()
    const nodes = page.nodes
    const order = page.order
    const out = []
    for (const id of order) {
      const n = nodes[id]
      if (!n) continue
      if (n.kind === 'connector') {
        out.push({
          id, kind: n.kind, route: n.route,
          from: n.from ? n.from.nodeId + ':' + n.from.side : null,
          to: n.to ? n.to.nodeId + ':' + n.to.side : null,
          pts: (n.points||[]).map(p => [Math.round(p.x + n.x), Math.round(p.y + n.y)])
        })
      }
    }
    return {
      total: order.length,
      connectors: out,
      shapes: order.map(id => {
        const n = nodes[id]
        return { id, kind: n.kind, text: n.text, x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h) }
      })
    }
  })()`)
  console.log(JSON.stringify(info, null, 2))
  win.destroy()
  app.quit()
})
