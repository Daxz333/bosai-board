import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/board'
import type { Camera, PathAnchor, ShapeNode } from '../types'
import { pathData, pathFromWorld, splitSegment } from '../engine/paths'
import { nodeCenter, rotatePoint, type Pt } from '../engine/geometry'
import { inheritedFlag } from '../engine/hierarchy'

export default function VectorEditor({ cam }: { cam: Camera }) {
  const s = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<PathAnchor[]>([])
  const draftRef = useRef<PathAnchor[]>([])
  const [selected, setSelected] = useState(0)
  const dragRef = useRef<{ index: number; part: 'anchor' | 'in' | 'out'; node?: ShapeNode; start: Pt } | null>(null)
  const node = s.selection.length === 1 ? s.page().nodes[s.selection[0]] : null
  const path = node?.kind === 'path' ? node : null
  const editable=path && !inheritedFlag(path,s.page().nodes,'locked') && !inheritedFlag(path,s.page().nodes,'hidden')
  const updateDraft = (points: PathAnchor[]) => { draftRef.current = points; setDraft(points) }
  const finish = (closed: boolean) => {
    const points = draftRef.current
    if (points.length < (closed ? 3 : 2)) return
    const st = useStore.getState()
    const id = st.addNode(pathFromWorld(points, closed, st.maxZ() + 1), '绘制矢量路径')
    updateDraft([]); dragRef.current = null
    st.setTool('node'); st.select([id])
  }
  const removeAnchor = () => {
    if (!path || !path.anchors || path.anchors.length <= (path.closed ? 3 : 2)) return
    const anchors = path.anchors.filter((_, i) => i !== Math.min(selected, path.anchors!.length - 1))
    s.updateNode(path.id, { anchors }, '删除路径锚点')
    setSelected(Math.max(0, selected - 1))
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input,textarea,select') || target.isContentEditable) return
      if (s.tool === 'bezier') {
        if (e.key === 'Enter') { e.preventDefault(); finish(e.shiftKey) }
        if (e.key === 'Escape') { updateDraft([]); dragRef.current = null; s.setTool('select') }
        if (e.key === 'Backspace') { e.preventDefault(); updateDraft(draftRef.current.slice(0, -1)) }
      }
      if (s.tool === 'node' && e.key === 'Delete' && path) { e.preventDefault(); removeAnchor() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [s.tool, path, selected])
  useEffect(() => { if (s.tool !== 'bezier') { updateDraft([]); dragRef.current = null } }, [s.tool])
  useEffect(() => setSelected(0), [node?.id])

  const world = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left - cam.x) / cam.zoom, y: (e.clientY - rect.top - cam.y) / cam.zoom }
  }
  const begin = (e: React.PointerEvent<SVGElement>, index: number, part: 'anchor' | 'in' | 'out') => {
    if (!path || !editable) return
    e.preventDefault(); e.stopPropagation(); e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId)
    setSelected(index)
    dragRef.current = { index, part, node: structuredClone(path), start: world(e) }
    s.commit('编辑路径锚点')
  }
  const move = (e: { clientX: number; clientY: number; altKey: boolean }) => {
    const drag = dragRef.current
    if (!drag) return
    const p = world(e)
    if (!drag.node) {
      const anchors = structuredClone(draftRef.current)
      const a = anchors[drag.index]
      if (!a) return
      if (Math.hypot(p.x - a.x, p.y - a.y) > 2 / cam.zoom) {
        a.out = p; a.in = { x: 2 * a.x - p.x, y: 2 * a.y - p.y }
        updateDraft(anchors)
      }
      return
    }
    const original = drag.node
    const local = rotatePoint(p, nodeCenter(original), -original.rot)
    const q = { x: (local.x - original.x) / original.w, y: (local.y - original.y) / original.h }
    const anchors = structuredClone(original.anchors || [])
    const a = anchors[drag.index]
    if (!a) return
    if (drag.part === 'anchor') {
      const dx = q.x - a.x, dy = q.y - a.y
      a.x = q.x; a.y = q.y
      if (a.in) a.in = { x: a.in.x + dx, y: a.in.y + dy }
      if (a.out) a.out = { x: a.out.x + dx, y: a.out.y + dy }
    } else {
      a[drag.part] = q
      if (!e.altKey) a[drag.part === 'in' ? 'out' : 'in'] = { x: 2 * a.x - q.x, y: 2 * a.y - q.y }
    }
    s.updateNode(original.id, { anchors })
  }
  useEffect(() => {
    const end = () => { dragRef.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end) }
  }, [cam])

  const draftNode = draft.length ? pathFromWorld(draft, false, 0) : null
  const screen = (p: Pt, n?: ShapeNode) => {
    const wp = n ? rotatePoint({ x: n.x + p.x * n.w, y: n.y + p.y * n.h }, nodeCenter(n), n.rot) : p
    return { x: wp.x * cam.zoom + cam.x, y: wp.y * cam.zoom + cam.y }
  }
  const anchorUI = (a: PathAnchor, i: number, n?: ShapeNode) => {
    const p = screen(a, n)
    return <g key={i}>
      {(i === selected || !n) && (['in', 'out'] as const).map(part => {
        const cp = a[part]
        if (!cp) return null
        const c = screen(cp, n)
        return <g key={part}>
          <line x1={p.x} y1={p.y} x2={c.x} y2={c.y} stroke="#7EA6FF" />
          <circle cx={c.x} cy={c.y} r={4} fill="#fff" stroke="#5B8CFF" style={{ pointerEvents: n ? 'all' : 'none', cursor: 'move' }}
            onPointerDown={e => begin(e, i, part)} />
        </g>
      })}
      <rect x={p.x - 4} y={p.y - 4} width={8} height={8} fill={i === selected ? '#5B8CFF' : '#fff'} stroke="#5B8CFF"
        style={{ pointerEvents: n ? 'all' : 'none', cursor: 'move' }} onPointerDown={e => begin(e, i, 'anchor')}
        />
    </g>
  }
  if (s.tool !== 'bezier' && s.tool !== 'node') return null
  return <>
    <svg ref={svgRef} className="vector-editor" style={{ pointerEvents: s.tool === 'bezier' ? 'all' : 'none' }}
      onPointerDown={e => {
        if (s.tool !== 'bezier' || e.button !== 0 || e.detail > 1) return
        e.preventDefault(); e.stopPropagation()
        const p = world(e)
        const points = draftRef.current
        if (points.length >= 3 && Math.hypot(p.x - points[0].x, p.y - points[0].y) < 10 / cam.zoom) { finish(true); return }
        updateDraft([...points, p])
        dragRef.current = { index: points.length, part: 'anchor', start: p }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onDoubleClick={() => { if (s.tool === 'bezier') finish(false) }}>
      {draftNode && <path d={pathData(draftNode)} transform={`translate(${cam.x},${cam.y}) scale(${cam.zoom})`}
        fill="none" stroke="#7EA6FF" strokeWidth={2 / cam.zoom} />}
      {s.tool === 'bezier' && draft.map((a, i) => anchorUI(a, i))}
      {s.tool === 'node' && editable && path?.anchors?.map((a, i) => anchorUI(a, i, path))}
    </svg>
    <div className="vector-actions">
      {s.tool === 'bezier' ? <>
        <span>点击创建角点 · 拖动创建曲线 · 点击起点闭合</span>
        <button disabled={draft.length < 2} onClick={() => finish(false)}>完成 Enter</button>
        <button disabled={draft.length < 3} onClick={() => finish(true)}>闭合</button>
      </> : path ? <>
        <span>锚点 {selected + 1}/{path.anchors?.length} · Alt 独立手柄</span>
        <button onClick={() => {
          if (!path.anchors) return
          const index = Math.min(selected, path.closed ? path.anchors.length - 1 : path.anchors.length - 2)
          s.updateNode(path.id, { anchors: splitSegment(path.anchors, index) }, '插入路径锚点'); setSelected(index + 1)
        }}>插入锚点</button>
        <button onClick={() => {
          const anchors = structuredClone(path.anchors || [])
          const a = anchors[Math.min(selected, anchors.length - 1)]
          if (!a) return
          if (a.in || a.out) { delete a.in; delete a.out }
          else { a.in = { x: a.x - .1, y: a.y }; a.out = { x: a.x + .1, y: a.y } }
          s.updateNode(path.id, { anchors }, '切换平滑锚点')
        }}>角点/平滑</button>
        <button onClick={() => s.updateNode(path.id, { closed: !path.closed }, '开闭路径')}>{path.closed ? '开放路径' : '闭合路径'}</button>
        <button onClick={removeAnchor}>删除锚点</button>
      </> : <span>选择一个矢量路径，或在属性面板将基础图形转换为路径</span>}
    </div>
  </>
}
