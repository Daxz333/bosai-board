import { useEffect, useState } from 'react'
import { useStore } from '../store/board'

interface MenuState { x: number; y: number }

let openAt: { x: number; y: number } | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('contextmenu', (e) => {
    // 画布外区域不拦截浏览器默认菜单
    const t = e.target as HTMLElement
    if (!t.closest('.canvas-host')) { openAt = null; notify(); return }
    e.preventDefault()
    openAt = { x: e.clientX, y: e.clientY }
    notify()
  })
  window.addEventListener('click', () => { if (openAt) { openAt = null; notify() } })
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openAt) { openAt = null; notify() } })
}

export default function ContextMenu() {
  const [pos, setPos] = useState<MenuState | null>(null)
  const s = useStore()

  useEffect(() => {
    const l = () => setPos(openAt ? { ...openAt } : null)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])

  if (!pos) return null
  const hasSel = s.selection.length > 0
  const w = 190
  const x = Math.min(pos.x, window.innerWidth - w - 8)
  const y = Math.min(pos.y, window.innerHeight - 300)

  const run = (fn: () => void) => { fn(); openAt = null; notify() }

  return (
    <div className="ctx-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <div className="ctx-group">
        <button onClick={() => run(() => s.undo())} disabled={!s.past.length}>撤销 <kbd>Ctrl+Z</kbd></button>
        <button onClick={() => run(() => s.redo())} disabled={!s.future.length}>重做 <kbd>Ctrl+Y</kbd></button>
      </div>
      <div className="ctx-sep" />
      <div className="ctx-group">
        <button onClick={() => run(() => s.copy(s.selection))} disabled={!hasSel}>复制 <kbd>Ctrl+C</kbd></button>
        <button onClick={() => run(() => s.paste())}>粘贴 <kbd>Ctrl+V</kbd></button>
        <button onClick={() => run(() => s.duplicate(s.selection))} disabled={!hasSel}>再制 <kbd>Ctrl+D</kbd></button>
        <button className="danger" onClick={() => run(() => s.removeNodes(s.selection))} disabled={!hasSel}>删除 <kbd>Del</kbd></button>
      </div>
      <div className="ctx-sep" />
      <div className="ctx-group">
        <button onClick={() => run(() => s.bringToFront(s.selection))} disabled={!hasSel}>置于顶层</button>
        <button onClick={() => run(() => s.sendToBack(s.selection))} disabled={!hasSel}>置于底层</button>
        <button onClick={() => run(() => s.bringForward(s.selection))} disabled={!hasSel}>上移一层</button>
        <button onClick={() => run(() => s.sendBackward(s.selection))} disabled={!hasSel}>下移一层</button>
      </div>
      <div className="ctx-sep" />
      <div className="ctx-group">
        <button onClick={() => run(() => s.group(s.selection))} disabled={s.selection.length < 2}>组合 <kbd>Ctrl+G</kbd></button>
        <button onClick={() => run(() => s.ungroup())} disabled={!hasSel}>取消组合</button>
        <button onClick={() => run(() => s.selectAll())}>全选 <kbd>Ctrl+A</kbd></button>
      </div>
      <div className="ctx-sep" />
      <div className="ctx-group">
        <button onClick={() => run(() => s.setTool('shape'))}>绘制形状</button>
        <button onClick={() => run(() => s.setTool('text'))}>插入文本</button>
        <button onClick={() => run(() => s.setTool('connector'))}>连接线</button>
        <button onClick={() => run(() => s.fitView())}>适应画布 <kbd>Ctrl+1</kbd></button>
      </div>
    </div>
  )
}
