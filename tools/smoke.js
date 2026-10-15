/** 交互冒烟测试：验证选择 / 移动 / 缩放 / 撤销 / 对齐 / 组合 / 页面 等核心操作 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 90000)

const SCRIPT = `(() => {
  const S = () => window.__store.getState()
  const out = []
  const page = () => S().page()
  const firstShape = page().order.map(id => page().nodes[id]).find(n => n.kind === 'rect')

  S().select([firstShape.id])
  out.push(['选择', S().selection.length === 1, S().selection[0] === firstShape.id])

  const x0 = S().page().nodes[firstShape.id].x
  S().commit('test')
  S().moveNodes(S().selection, 50, 30)
  const x1 = S().page().nodes[firstShape.id].x
  out.push(['移动', Math.abs(x1 - x0 - 50) < 0.01, Math.round(x0) + ' -> ' + Math.round(x1)])

  S().undo()
  const x2 = S().page().nodes[firstShape.id].x
  out.push(['撤销', Math.abs(x2 - x0) < 0.01, '回到 ' + Math.round(x2)])

  S().redo()
  const x3 = S().page().nodes[firstShape.id].x
  out.push(['重做', Math.abs(x3 - x1) < 0.01, '到 ' + Math.round(x3)])

  const conn = page().order.map(id => page().nodes[id]).find(n => n.kind === 'connector' && n.from)
  const beforeX = conn.points[0].x + conn.x
  S().moveNodes([conn.from.nodeId], 40, 0)
  const conn2 = S().page().nodes[conn.id]
  const afterX = conn2.points[0].x + conn2.x
  out.push(['连线跟随端点', Math.abs(afterX - beforeX - 40) < 1.5, Math.round(beforeX) + ' -> ' + Math.round(afterX)])

  const graphIds = [conn.from.nodeId, conn.to.nodeId, conn.id]
  S().duplicate(graphIds, { x: 0, y: 0 })
  const clonedIds = new Set(S().selection)
  const clonedConnector = S().selected().find(n => n.kind === 'connector')
  const remapped = clonedConnector && clonedConnector.from && clonedConnector.to &&
    clonedIds.has(clonedConnector.from.nodeId) && clonedIds.has(clonedConnector.to.nodeId) &&
    !graphIds.includes(clonedConnector.from.nodeId) && !graphIds.includes(clonedConnector.to.nodeId)
  out.push(['图结构复制', !!remapped, remapped ? '端点已重映射' : '端点仍引用原对象'])
  S().undo()

  const n = S().page().nodes[conn.from.nodeId]
  const w0 = n.w
  S().scaleNodes([conn.from.nodeId], { x: n.x, y: n.y, w: w0, h: n.h }, { x: n.x, y: n.y, w: w0 * 2, h: n.h * 2 })
  const w1 = S().page().nodes[conn.from.nodeId].w
  out.push(['缩放', Math.abs(w1 / w0 - 2) < 0.02, w0 + ' -> ' + Math.round(w1)])

  const shapes = page().order.map(id => page().nodes[id]).filter(x => x.kind !== 'connector' && x.kind !== 'text')
  S().select(shapes.slice(0, 3).map(s => s.id))
  S().align('top')
  const tops = S().selected().map(x => Math.round(x.y))
  out.push(['顶对齐', new Set(tops).size === 1, 'tops=' + tops.join(',')])

  S().group(S().selection)
  const grouped = S().selected()
  out.push(['组合', grouped.length === 1 && grouped[0].kind === 'group', String(grouped[0] && grouped[0].kind)])
  const groupId = grouped[0].id
  const children = Object.values(page().nodes).filter(n => n.parent === groupId)
  const childBefore = new Map(children.map(n => [n.id, { x: n.x, y: n.y }]))
  S().commit('test-group-move')
  S().moveNodes([groupId], 25, 15)
  const groupMoved = children.every(old => {
    const now = page().nodes[old.id], before = childBefore.get(old.id)
    return before && Math.abs(now.x - before.x - 25) < .01 && Math.abs(now.y - before.y - 15) < .01
  })
  out.push(['组合整体移动', groupMoved, children.length + ' 个子元素同步'])
  S().ungroup()
  out.push(['取消组合', S().selected().length === 3, S().selected().length + ' 个子元素'])

  const p0 = S().doc.activePageId
  S().addPage()
  const p1 = S().doc.activePageId
  out.push(['新增页面', p0 !== p1, '切换成功'])
  S().removePage(p1)
  out.push(['删除页面', S().doc.activePageId === p0, '已还原'])

  const all = page().order.length
  S().selectAll()
  out.push(['全选', S().selection.length === all, S().selection.length + '/' + all])

  return out
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

  let results
  try {
    results = await win.webContents.executeJavaScript(SCRIPT, true)
  } catch (e) {
    console.log('SCRIPT_ERROR:', String(e && e.message ? e.message : e))
    const errs = await win.webContents.executeJavaScript('(window.__ERRS__||[]).join(" | ")')
    console.log('PAGE_ERRORS:', errs || '无')
    win.destroy(); app.quit(); return
  }

  let pass = 0, fail = 0
  for (const [name, ok, detail] of results) {
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(16) + ' ' + detail)
    ok ? pass++ : fail++
  }
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')

  const errs = await win.webContents.executeJavaScript('window.__ERRS__ || []')
  console.log('渲染错误:', errs.length ? JSON.stringify(errs) : '无')

  win.destroy()
  app.quit()
})
