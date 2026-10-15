import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useStore, computeConnectorPoints, reflowConnector, expandNodeIds } from '../store/board'
import type { AnyNode, LineNode, ShapeNode, TableNode, ImageNode, SnapGuide } from '../types'
import type { Rect as GeoRect, Pt as GeoPt } from '../engine/geometry'
import { makeShape, makeTable, makeImage, makePencil, makeLine } from '../engine/factory'
import { relationPatch, symbolDefinition, isProfessional } from '../engine/engineering'
import { drawNode, toWorld, toScreen, applyCam, roundRectPath } from '../engine/render'
import { nodePoly } from '../engine/shapes'
import Navigator from './Navigator'
import VectorEditor from './VectorEditor'
import ConnectorEditor from './ConnectorEditor'
import { inheritedFlag } from '../engine/hierarchy'
import { saveDocument } from '../document-lifecycle'
import {
  unionRect, nodeRect, rotatedBounds, rectsIntersect, rectContains, inflate,
  nodeCenter, autoSide, sideAnchor, distToSegment, pointInPolygon, clamp, hitTestNode, rotatePoint, rotateLineGeometry
} from '../engine/geometry'

type RectT = GeoRect
type PtT = GeoPt

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot'

interface DragState {
  kind: 'move' | 'draw' | 'marquee' | 'resize' | 'rotate' | 'pen' | 'connector' | 'pan' | 'table-cell' | 'erase'
  startWorld: PtT
  startScreen: PtT
  origNodes: Record<string, AnyNode>
  origBox?: RectT
  handle?: Handle
  startAngle?: number
  targetNode?: AnyNode
  sourceNode?: AnyNode
  camera0?: { x: number; y: number }
  targetSide?: string
  startPoints?: PtT[]
  cell?: { r: number; c: number }
  /** 框选开始时已有的选择，避免 Shift 框选在移动过程中只能增加不能减少 */
  baseSelection?: string[]
}

const HANDLE_SIZE = 9
const ROT_OFFSET = 22

export default function Canvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [marquee, setMarquee] = useState<RectT | null>(null)
  const [marqueeMode, setMarqueeMode] = useState<'contain' | 'cross'>('contain')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AnyNode | null>(null)
  const [previewConnect, setPreviewConnect] = useState<{ a: PtT; b: PtT; hover: AnyNode | null } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [cursorWorld, setCursorWorld] = useState<PtT | null>(null)
  const [editingCell, setEditingCell] = useState<{ id: string; r: number; c: number } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [size, setSize] = useState({ w: 1200, h: 800 })

  const s = useStore()
  const page = s.page()
  const nodes = page.nodes
  const order = page.order
  const cam = s.camera
  const tool = s.tool
  const editingId = s.editingId
  const gridSize = s.gridSize
  const gridVisible = s.gridVisible
  const selection = s.selection
  const showTextEdit = editingId && tool === 'select'

  /* ---------- 尺寸自适应 ---------- */
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  /* ---------- 绘制 ---------- */
  useEffect(() => {
    const cvs = canvasRef.current
    if (!cvs) return
    const dpr = window.devicePixelRatio || 1
    cvs.width = size.w * dpr
    cvs.height = size.h * dpr
    cvs.style.width = size.w + 'px'
    cvs.style.height = size.h + 'px'
    const ctx = cvs.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    const professionalPage=page.diagramType&&page.diagramType!=='free'||Object.values(nodes).some(isProfessional)
    ctx.fillStyle = professionalPage?page.background:'#20232b'
    ctx.fillRect(0, 0, size.w, size.h)

    // 网格
    if (gridVisible) {
      const g = gridSize * cam.zoom
      if (g >= 6) {
        ctx.save()
        ctx.strokeStyle = professionalPage?'rgba(15,23,42,0.055)':'rgba(255,255,255,0.055)'
        ctx.lineWidth = 1
        const startX = ((cam.x % g) + g) % g
        const startY = ((cam.y % g) + g) % g
        ctx.beginPath()
        for (let x = startX; x < size.w; x += g) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, size.h) }
        for (let y = startY; y < size.h; y += g) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(size.w, Math.round(y) + 0.5) }
        ctx.stroke()
        // 主网格
        const g5 = g * 5
        if (g5 >= 24) {
          ctx.strokeStyle = professionalPage?'rgba(15,23,42,0.09)':'rgba(255,255,255,0.09)'
          ctx.beginPath()
          const sx = ((cam.x % g5) + g5) % g5
          const sy = ((cam.y % g5) + g5) % g5
          for (let x = sx; x < size.w; x += g5) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, size.h) }
          for (let y = sy; y < size.h; y += g5) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(size.w, Math.round(y) + 0.5) }
          ctx.stroke()
        }
        ctx.restore()
      }
    }

    const rc = { ctx, cam: { x: cam.x, y: cam.y, zoom: cam.zoom }, dpr, interactive: true }
    applyCam(ctx, rc.cam)

    // 节点
    for (const id of order) {
      const n = nodes[id]
      if (!n || inheritedFlag(n, nodes, 'hidden')) continue
      drawNode(rc, n)
    }
    if (draft) drawNode(rc, draft)

    // 画笔进行中
    if (dragRef.current?.kind === 'pen' && draft) drawNode(rc, draft)

    // 连线预览
    if (previewConnect) {
      const a = previewConnect.a, b = previewConnect.b
      const t = previewConnect.hover
      const bEnd = t ? sideAnchor(nodeRect(t), autoSide(nodeRect(t), b, a)) : b
      ctx.save()
      ctx.strokeStyle = '#5B8CFF'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(bEnd.x, bEnd.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#5B8CFF'
      ctx.fill()
      ctx.restore()
    }

    // 吸附参考线
    if (guides.length) {
      ctx.save()
      ctx.strokeStyle = '#FF4D8D'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      for (const g of guides) {
        if (g.type === 'v') { ctx.moveTo(g.pos, g.from); ctx.lineTo(g.pos, g.to) }
        else { ctx.moveTo(g.from, g.pos); ctx.lineTo(g.to, g.pos) }
      }
      ctx.stroke()
      ctx.restore()
    }

    // 框选
    if (marquee) {
      ctx.save()
      const crossing = marqueeMode === 'cross'
      ctx.fillStyle = crossing ? 'rgba(49,196,141,0.10)' : 'rgba(91,140,255,0.12)'
      ctx.strokeStyle = crossing ? '#31C48D' : '#5B8CFF'
      ctx.lineWidth = 1 / cam.zoom
      ctx.setLineDash(crossing ? [6 / cam.zoom, 4 / cam.zoom] : [])
      const r = marquee
      ctx.fillRect(r.x, r.y, r.w, r.h)
      ctx.strokeRect(r.x, r.y, r.w, r.h)
      ctx.restore()
    }

    // 选中框
    const selNodes = selection.map((id) => nodes[id]).filter(Boolean) as AnyNode[]
    if (selNodes.length && tool === 'select' && !editingId) {
      for (const n of selNodes) {
        if (n.locked) continue
        const b = rotatedBounds(nodeRect(n), n.rot)
        ctx.save()
        if (n.rot) {
          const c = nodeCenter(n)
          ctx.translate(c.x, c.y); ctx.rotate((n.rot * Math.PI) / 180); ctx.translate(-c.x, -c.y)
        }
        ctx.strokeStyle = '#5B8CFF'
        ctx.lineWidth = 1.5 / cam.zoom
        ctx.setLineDash(n.rot ? [4 / cam.zoom, 3 / cam.zoom] : [])
        ctx.strokeRect(b.x, b.y, b.w, b.h)
        ctx.setLineDash([])
        ctx.restore()
      }
      // 多选时显示整体包围盒 + 手柄
      if (selNodes.length > 1) {
        const bb = unionRect(selNodes.map((n) => rotatedBounds(nodeRect(n), n.rot)))
        ctx.save()
        ctx.strokeStyle = '#8AB0FF'
        ctx.lineWidth = 1 / cam.zoom
        ctx.setLineDash([5 / cam.zoom, 4 / cam.zoom])
        ctx.strokeRect(bb.x, bb.y, bb.w, bb.h)
        ctx.setLineDash([])
        ctx.restore()
        drawHandles(ctx, bb, cam.zoom)
      } else if (!selNodes[0].locked) {
        drawHandles(ctx, rotatedBounds(nodeRect(selNodes[0]), selNodes[0].rot), cam.zoom)
      }
    }

    // hover 高亮
    if (hoverId && selection.length === 0 && tool === 'select') {
      const n = nodes[hoverId]
      if (n && !n.locked) {
        const b = rotatedBounds(nodeRect(n), n.rot)
        ctx.save()
        ctx.strokeStyle = 'rgba(138,176,255,0.75)'
        ctx.lineWidth = 1.5
        ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4)
        ctx.restore()
      }
    }
  }, [size, cam, nodes, order, selection, draft, guides, marquee, marqueeMode, hoverId, tool, editingId, previewConnect, gridVisible, gridSize])

  /* ---------- 命中测试辅助 ---------- */
  const hitAt = useCallback((p: PtT, opts: { topOnly?: boolean } = {}): AnyNode | null => {
    const pg = useStore.getState().page()
    const list = pg.order.map((id) => pg.nodes[id]).filter((n): n is AnyNode => !!n && !inheritedFlag(n, pg.nodes, 'hidden') && !inheritedFlag(n, pg.nodes, 'locked'))
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i]
      if (n.parent && pg.nodes[n.parent]?.kind==='group' && !selection.includes(n.id)) {
        // 子元素被组合时只允许选组
        continue
      }
      const poly = n.rot ? null : nodePoly(n)
      if (hitTestNode(n, p, poly, 2)) return n
    }
    return null
  }, [selection])

  const hitGroupAt = useCallback((p: PtT): AnyNode | null => {
    // 组合整体命中（优先于子元素）
    const pg = useStore.getState().page()
    const list = pg.order.map((id) => pg.nodes[id]).filter((n): n is AnyNode => !!n && !inheritedFlag(n, pg.nodes, 'hidden') && !inheritedFlag(n, pg.nodes, 'locked'))
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i]
      if (n.kind !== 'group') continue
      if (rectContains(inflate(nodeRect(n), 2), p.x, p.y)) return n
    }
    return null
  }, [])

  const handleAt = useCallback((p: PtT): { node: AnyNode; handle: Handle } | null => {
    const st = useStore.getState()
    const sel = st.selection.map((id) => st.page().nodes[id]).filter(Boolean) as AnyNode[]
    if (!sel.length || sel.some(n => n.locked) || st.tool !== 'select') return null
    const box = sel.length > 1
      ? unionRect(sel.map((n) => rotatedBounds(nodeRect(n), n.rot)))
      : rotatedBounds(nodeRect(sel[0]), sel[0].rot)
    const tol = (HANDLE_SIZE / cam.zoom) * 1.6
    const rotR = Math.hypot(p.x - (box.x + box.w / 2), p.y - (box.y - ROT_OFFSET / cam.zoom))
    if (rotR < tol) return { node: sel[0], handle: 'rot' }
    const hs: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
    for (const h of hs) {
      const pt = handlePos(box, h)
      if (Math.abs(p.x - pt.x) <= tol && Math.abs(p.y - pt.y) <= tol) return { node: sel[0], handle: h }
    }
    return null
  }, [cam.zoom])

  /* ---------- 指针事件 ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || spaceDown) { startPan(e); return }
    if (e.button !== 0) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const p = toWorld(cam, e.clientX - rectLeft(), e.clientY - rectTop())

    if (tool === 'hand' || spaceDown) { startPan(e); return }

    // 变换手柄
    const hd = handleAt(p)
    if (hd) {
      const st = useStore.getState()
      const sel = st.selection.map((id) => st.page().nodes[id]).filter(Boolean) as AnyNode[]
      const origNodes: Record<string, AnyNode> = {}
      const transformIds = hd.handle!=='rot'&&sel.length===1&&sel[0].container?st.selection:expandNodeIds(st.page(), st.selection)
      for (const id of transformIds) {
        const n = st.page().nodes[id]
        if (n) origNodes[id] = structuredClone(n)
      }
      if (hd.handle === 'rot') {
        const c = sel.length > 1 ? rectCenterOf(unionRect(sel.map((n) => rotatedBounds(nodeRect(n), n.rot)))) : nodeCenter(sel[0])
        dragRef.current = {
          kind: 'rotate', startWorld: p, startScreen: { x: e.clientX, y: e.clientY },
          origNodes, origBox: sel.length > 1 ? unionRect(sel.map((n) => rotatedBounds(nodeRect(n), n.rot))) : nodeRect(sel[0]),
          startAngle: Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI
        }
      } else {
        dragRef.current = {
          kind: 'resize', startWorld: p, startScreen: { x: e.clientX, y: e.clientY },
          origNodes, origBox: sel.length > 1 ? unionRect(sel.map((n) => rotatedBounds(nodeRect(n), n.rot))) : nodeRect(sel[0]),
          handle: hd.handle
        }
      }
      useStore.getState().commit('变换元素')
      return
    }

    if (tool === 'select' || tool === 'node') {
      const g = hitGroupAt(p)
      const n = g || hitAt(p)
      if (n) {
        const st = useStore.getState()
        if (e.shiftKey) {
          if (st.selection.includes(n.id)) {
            st.select(st.selection.filter(id => id !== n.id))
            return
          }
          st.select([n.id], true)
        } else if (!st.selection.includes(n.id)) {
          st.select([n.id])
        }
        let ids = e.shiftKey
          ? Array.from(new Set([...st.selection, n.id]))
          : (st.selection.includes(n.id) ? st.selection : [n.id])
        // 与 Figma / Illustrator 一致：Alt 拖动立即创建副本并拖动副本。
        // duplicate 会同时重映射组关系和选区内部的连线端点。
        if (e.altKey) {
          st.duplicate(ids, { x: 0, y: 0 })
          ids = [...useStore.getState().selection]
        }
        ids = expandNodeIds(useStore.getState().page(), ids)
        const origNodes: Record<string, AnyNode> = {}
        const pg = useStore.getState().page()
        for (const id of ids) if (pg.nodes[id]) origNodes[id] = structuredClone(pg.nodes[id])
        dragRef.current = { kind: 'move', startWorld: p, startScreen: { x: e.clientX, y: e.clientY }, origNodes }
        if (!e.altKey) useStore.getState().commit('移动元素')
        if (!e.altKey && n.kind === 'text' && st.selection.length === 1 && !e.shiftKey) {
          useStore.getState().setEditing(n.id)
        }
      } else {
        const baseSelection = e.shiftKey ? [...useStore.getState().selection] : []
        if (!e.shiftKey) useStore.getState().clearSelection()
        dragRef.current = {
          kind: 'marquee', startWorld: p, startScreen: { x: e.clientX, y: e.clientY },
          origNodes: {}, baseSelection
        }
      }
      return
    }

    if (tool === 'shape') {
      const st = useStore.getState()
      const kind = st.currentShape
      const meta = defaultSize(kind)
      const n = (kind === 'table' || kind === 'image')
        ? (kind === 'table'
          ? makeTable(p.x, p.y, st.maxZ() + 1)
          : makeImage(p.x, p.y, meta.w, meta.h, '', st.maxZ() + 1))
        : makeShape(kind as any, p.x, p.y, meta.w, meta.h, st.maxZ() + 1)
      dragRef.current = { kind: 'draw', startWorld: p, startScreen: { x: e.clientX, y: e.clientY }, origNodes: {}, targetNode: n }
      setDraft(n)
      return
    }

    if (tool === 'text') {
      const st = useStore.getState()
      const n = makeShape('text', p.x, p.y, 220, 40, st.maxZ() + 1)
      n.text = '文本'
      const id = st.addNode(n, '添加文本')
      st.setTool('select')
      st.setEditing(id)
      return
    }

    if (tool === 'pen') {
      const st = useStore.getState()
      const n = makePencil(p.x, p.y, st.maxZ() + 1, '#E8EAF0')
      dragRef.current = { kind: 'pen', startWorld: p, startScreen: { x: e.clientX, y: e.clientY }, origNodes: {}, targetNode: n }
      setDraft(n)
      return
    }

    if (tool === 'eraser') {
      const n = hitAt(p)
      if (n) useStore.getState().removeNodes([n.id])
      return
    }

    if (tool === 'connector') {
      const st = useStore.getState()
      const target = hitGroupAt(p) || hitAt(p)
      const ln = makeLine(p.x, p.y, 0, 0, st.maxZ() + 1, {
        kind: 'connector', arrow: 'end', route: 'orthogonal',
        ...(st.currentRelation?relationPatch(st.currentRelation):st.page().diagramType==='dfd'?relationPatch('dataFlow'):{}),
        from: target ? { nodeId: target.id, side: autoSide(nodeRect(target), p, p) } : undefined
      })
      dragRef.current = {
        kind: 'connector', startWorld: p, startScreen: { x: e.clientX, y: e.clientY },
        origNodes: {}, targetNode: ln, sourceNode: target ?? undefined
      }
      setDraft(ln)
      return
    }

    if (tool === 'frame') {
      const st = useStore.getState()
      const n = makeShape('frame', p.x, p.y, 400, 300, st.maxZ() + 1)
      ;(n as ShapeNode).fill = 'transparent'
      ;(n as ShapeNode).stroke = '#5B8CFF'
      ;(n as ShapeNode).strokeWidth = 2
      ;(n as ShapeNode).text = '框架'
      n.container=true
      dragRef.current = { kind: 'draw', startWorld: p, startScreen: { x: e.clientX, y: e.clientY }, origNodes: {}, targetNode: n }
      setDraft(n)
    }
  }

  const startPan = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = {
      kind: 'pan', startWorld: { x: e.clientX, y: e.clientY },
      startScreen: { x: e.clientX, y: e.clientY }, origNodes: {}, camera0: { x: cam.x, y: cam.y }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const screen = { x: e.clientX - rectLeft(), y: e.clientY - rectTop() }
    const p = toWorld(cam, screen.x, screen.y)
    setCursorWorld(p)
    const d = dragRef.current

    if (!d) {
      // hover
      if (tool === 'select') {
        const hd = handleAt(p)
        setHoverId(hd ? null : ((hitGroupAt(p) || hitAt(p))?.id ?? null))
      } else setHoverId(null)
      // 连线起点的吸附预览
      if (tool === 'connector') {
        const t = hitGroupAt(p) || hitAt(p)
        setPreviewConnect((prev) => prev ? { ...prev, b: p, hover: t } : prev)
      }
      return
    }

    switch (d.kind) {
      case 'pan': {
        const dx = e.clientX - d.startScreen.x
        const dy = e.clientY - d.startScreen.y
        useStore.getState().setCamera({ x: d.camera0!.x + dx, y: d.camera0!.y + dy })
        return
      }
      case 'move': {
        let dx = p.x - d.startWorld.x
        let dy = p.y - d.startWorld.y
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
        const st = useStore.getState()
        const ids = Object.keys(d.origNodes)
        let moved = ids.map((id) => {
          const o = d.origNodes[id]
          return { ...o, x: o.x + dx, y: o.y + dy }
        })
        let gl: SnapGuide[] = []
        if (st.snapEnabled && !e.altKey && ids.length) {
          // 先吸附网格，再让更精确的对象边缘/中心吸附覆盖它。
          if (st.gridVisible && st.gridSize > 0) {
            const mb = unionRect(moved.map(nodeRect))
            const gx = Math.round(mb.x / st.gridSize) * st.gridSize - mb.x
            const gy = Math.round(mb.y / st.gridSize) * st.gridSize - mb.y
            dx += gx; dy += gy
            moved = ids.map((id) => {
              const o = d.origNodes[id]
              return { ...o, x: o.x + dx, y: o.y + dy }
            })
          }
          const r = snapCheck(moved, page, ids, 6 / st.camera.zoom)
          dx += r.dx; dy += r.dy
          gl = r.guides
        }
        setGuides(gl)
        // dx/dy 是「从拖拽起点算起的总位移」，需要写成绝对坐标而非增量
        applyTarget(d.origNodes, ids, dx, dy)
        return
      }
      case 'draw': {
        const n = d.targetNode!
        let x1 = d.startWorld.x, y1 = d.startWorld.y
        let x2 = p.x, y2 = p.y
        if (e.shiftKey) {
          const sz = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
          x2 = x1 + Math.sign(x2 - x1 || 1) * sz
          y2 = y1 + Math.sign(y2 - y1 || 1) * sz
        }
        const nx = Math.min(x1, x2), ny = Math.min(y1, y2)
        n.w = Math.max(4, Math.abs(x2 - x1))
        n.h = Math.max(4, Math.abs(y2 - y1))
        n.x = nx; n.y = ny
        setDraft({ ...n })
        return
      }
      case 'resize': {
        const b0 = d.origBox!
        const h = d.handle!
        const b1 = resizeBox(b0, p, h, e.shiftKey, e.altKey)
        // 始终从 pointerdown 时的快照计算，避免连续 pointermove 累积缩放误差。
        applyScaleTarget(d.origNodes, Object.keys(d.origNodes), b0, b1)
        return
      }
      case 'rotate': {
        const c = rectCenterOf(d.origBox!)
        const cur = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI
        let deg = cur - (d.startAngle ?? 0)
        if (e.shiftKey) deg = Math.round(deg / 15) * 15
        const st = useStore.getState()
        const ids = Object.keys(d.origNodes)
        const rad = deg * Math.PI / 180
        const cos = Math.cos(rad), sin = Math.sin(rad)
        for (const id of ids) {
          const o = d.origNodes[id]
          if(['line','pencil','connector'].includes(o.kind)){st.updateNode(id,rotateLineGeometry(o as LineNode,c,deg));continue}
          const oc = nodeCenter(o)
          const vx = oc.x - c.x, vy = oc.y - c.y
          const nc = { x: c.x + vx * cos - vy * sin, y: c.y + vx * sin + vy * cos }
          st.updateNode(id, {
            x: nc.x - o.w / 2,
            y: nc.y - o.h / 2,
            rot: ((o.rot + deg) % 360 + 360) % 360
          })
        }
        reflowAttached(ids)
        return
      }
      case 'pen': {
        const n = d.targetNode as LineNode
        const lx = p.x - d.startWorld.x, ly = p.y - d.startWorld.y
        const last = n.points![n.points!.length - 1]
        if (Math.hypot(lx - last.x, ly - last.y) > 1.5 / cam.zoom) {
          n.points!.push({ x: lx, y: ly })
          n.pressure!.push((n.strokeWidth || 3) * (e.pointerType === 'pen' ? Math.max(.1, e.pressure) * 2 : 1))
          setDraft({ ...n })
        }
        return
      }
      case 'connector': {
        const n = d.targetNode as LineNode
        const t = hitGroupAt(p) || hitAt(p)
        const a = d.sourceNode
          ? sideAnchor(nodeRect(d.sourceNode), autoSide(nodeRect(d.sourceNode), nodeCenter(d.sourceNode), p))
          : d.startWorld
        const b = t ? sideAnchor(nodeRect(t), autoSide(nodeRect(t), p, a)) : p
        const pts = makeRoute(a, b, n.route || 'orthogonal')
        const minX = Math.min(...pts.map((q) => q.x)), minY = Math.min(...pts.map((q) => q.y))
        const n2: LineNode = {
          ...n, x: minX, y: minY,
          from: d.sourceNode ? { nodeId: d.sourceNode.id, side: 'auto' } : undefined,
          w: Math.max(1, Math.max(...pts.map((q) => q.x)) - minX),
          h: Math.max(1, Math.max(...pts.map((q) => q.y)) - minY),
          points: pts.map((q) => ({ x: q.x - minX, y: q.y - minY })),
          to: t ? { nodeId: t.id, side: 'auto' } : undefined
        }
        setDraft(n2)
        return
      }
      case 'marquee': {
        const mode = p.x >= d.startWorld.x ? 'contain' : 'cross'
        setMarqueeMode(mode)
        const r: RectT = {
          x: Math.min(d.startWorld.x, p.x), y: Math.min(d.startWorld.y, p.y),
          w: Math.abs(p.x - d.startWorld.x), h: Math.abs(p.y - d.startWorld.y)
        }
        setMarquee(r)
        const pg = useStore.getState().page()
        const hits = pg.order.filter((id) => {
          const n = pg.nodes[id]
          if (!n || n.locked || n.hidden || n.parent) return false
          const b = rotatedBounds(nodeRect(n), n.rot)
          return mode === 'cross'
            ? rectsIntersect(r, b)
            : b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h
        })
        useStore.getState().select(Array.from(new Set([...(d.baseSelection || []), ...hits])))
        return
      }
      default: return
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    setGuides([])
    setMarquee(null)
    if (!d) return

    if (d.kind === 'draw' && draft) {
      const st = useStore.getState()
      const n = { ...draft }
      // A click often includes a few pixels of pointer jitter. Keep the symbol's
      // default size instead of committing a nearly invisible 4px shape.
      if (Math.hypot(e.clientX - d.startScreen.x, e.clientY - d.startScreen.y) < 4) {
        Object.assign(n, { x: d.startWorld.x, y: d.startWorld.y }, defaultSize(n.kind))
      }
      if (n.kind === 'image' && !n.src) {
        st.setTool('select')
        setDraft(null)
        void insertImageAt(n.x + n.w / 2, n.y + n.h / 2)
        return
      }
      if (n.kind === 'table' && d.startWorld) {
        n.x = d.startWorld.x; n.y = d.startWorld.y
        n.w = Math.max(80, n.w); n.h = Math.max(60, n.h)
      }
      const id = st.addNode(n, '添加元素')
      st.setTool('select')
      st.select([id])
      setDraft(null)
      return
    }

    if (d.kind === 'pen' && draft) {
      const n = draft as LineNode
      if (n.points && n.points.length > 1) {
        const b = unionRect(n.points.map(q => ({ x: q.x, y: q.y, w: 0, h: 0 })))
        n.points = n.points.map(q => ({ x: q.x - b.x, y: q.y - b.y }))
        n.x += b.x; n.y += b.y; n.w = Math.max(1, b.w); n.h = Math.max(1, b.h)
        useStore.getState().addNode(n, '画笔绘制')
        setDraft(null)
        return
      }
      setDraft(null)
      return
    }

    if (d.kind === 'connector' && draft) {
      const st = useStore.getState()
      const n = draft as LineNode
      if (n.points && n.points.length > 1 && Math.hypot(n.w, n.h) > 3) {
        if(st.page().diagramType==='sequence'&&n.from&&n.to){if(!n.relation)Object.assign(n,relationPatch('syncMessage'));n.messageY=Math.max(n.y,Math.max(st.page().nodes[n.from.nodeId].y,st.page().nodes[n.to.nodeId].y)+70)}
        if (n.from && n.to) Object.assign(n, reflowConnector(n, id => st.page().nodes[id]))
        const id=st.addNode(n, '添加连线')
        st.select([id])
      }
      setDraft(null)
      setPreviewConnect(null)
      st.setTool('select')
      return
    }

    if (d.kind === 'move' || d.kind === 'resize' || d.kind === 'rotate') {
      // 已在按下时 commit，无需额外处理
    }
    setPreviewConnect(null)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = toWorld(cam, e.clientX - rectLeft(), e.clientY - rectTop())
    const n = hitGroupAt(p) || hitAt(p)
    if (n?.kind === 'table') {
      const local = n.rot ? rotatePoint(p, nodeCenter(n), -n.rot) : p
      const hh = n.rows === 1 ? n.h : Math.min(34, n.h * .22)
      const r = local.y < n.y + hh ? 0 : Math.min(n.rows - 1, 1 + Math.floor((local.y - n.y - hh) / ((n.h - hh) / (n.rows - 1))))
      const c = clamp(Math.floor((local.x - n.x) / (n.w / n.cols)), 0, n.cols - 1)
      useStore.getState().select([n.id])
      setEditingCell({ id: n.id, r, c })
      return
    }
    if (n && (n.kind === 'text' || (n as ShapeNode).text !== undefined)) {
      useStore.getState().setEditing(n.id)
      useStore.getState().select([n.id])
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const screen = { x: e.clientX - rectLeft(), y: e.clientY - rectTop() }
    const st = useStore.getState()
    if (e.ctrlKey || e.metaKey) {
      const f = Math.exp(-e.deltaY * 0.0022)
      st.zoomBy(f, screen)
    } else if (e.shiftKey) {
      st.setCamera({ x: cam.x - e.deltaY })
    } else {
      st.setCamera({ x: cam.x - e.deltaX, y: cam.y - e.deltaY })
    }
  }

  /* ---------- 快捷键 ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        if (e.key === 'Escape') t.blur()
        return
      }
      const st = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      if ((st.tool === 'bezier' && ['Enter', 'Escape', 'Backspace'].includes(e.key)) || (st.tool === 'node' && e.key === 'Delete')) return

      if (e.code === 'Space' && !e.repeat) { setSpaceDown(true); return }

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); return }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); st.redo(); return }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); st.selectAll(); return }
      if (mod && e.key.toLowerCase() === 'c') { st.copy(st.selection); return }
      if (mod && e.key.toLowerCase() === 'v') { st.paste(); return }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); st.duplicate(st.selection); return }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void doSave(); return }
      if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); e.shiftKey ? st.ungroup() : st.group(st.selection); return }
      if (mod && e.key === ']') { e.preventDefault(); st.bringToFront(st.selection); return }
      if (mod && e.key === '[') { e.preventDefault(); st.sendToBack(st.selection); return }
      if (mod && e.key === '=') { e.preventDefault(); st.zoomBy(1.2); return }
      if (mod && e.key === '-') { e.preventDefault(); st.zoomBy(1 / 1.2); return }
      if (mod && e.key === '0') { e.preventDefault(); st.zoomTo(1); return }
      if (mod && e.key === '1') { e.preventDefault(); st.fitView(); return }
      if (mod && e.key === '2') { e.preventDefault(); st.zoomToSelection(); return }

      switch (e.key) {
        case 'Delete': case 'Backspace':
          e.preventDefault(); st.removeNodes(st.selection); break
        case 'Escape':
          st.clearSelection(); st.setTool('select'); setDraft(null); break
        case 'Enter': {
          const id = st.selection[0]
          const n = id ? st.page().nodes[id] : null
          if (n) st.setEditing(id)
          break
        }
        case 'v': case 'V': st.setTool('select'); break
        case 'h': case 'H': st.setTool('hand'); break
        case 'r': case 'R': st.setCurrentShape('rect'); break
        case 'o': case 'O': st.setCurrentShape('ellipse'); break
        case 't': case 'T': st.setTool('text'); break
        case 'p': case 'P': st.setTool('pen'); break
        case 'b': case 'B': st.setTool('bezier'); break
        case 'a': case 'A': st.setTool('node'); break
        case 'e': case 'E': st.setTool('eraser'); break
        case 'l': case 'L': st.setTool('connector'); break
        case 'f': case 'F': st.setTool('frame'); break
        case 'g': case 'G': st.setCurrentShape('sticky'); break
        case 'Tab': {
          e.preventDefault()
          const ids = st.selection
          if (ids.length) st.selectTopAt(centerOfSel(ids, st))
          break
        }
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
          e.preventDefault()
          const d = e.shiftKey ? 10 : 1
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
          const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
          if (st.selection.length) { st.commit('移动元素'); st.moveNodes(st.selection, dx, dy) }
          break
        }
        default: break
      }
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const cursor = useMemo(() => {
    if (spaceDown || tool === 'hand') return dragRef.current?.kind === 'pan' ? 'grabbing' : 'grab'
    if (tool === 'pen' || tool === 'eraser' || tool === 'text' || tool === 'connector') return 'crosshair'
    if (tool === 'shape') return 'crosshair'
    return 'default'
  }, [spaceDown, tool])

  const editing = editingId ? nodes[editingId] : null
  const placementHint = tool === 'shape' ? `点击放置${symbolDefinition(s.currentShape)?.label || '形状'}，拖动可调整大小` : tool === 'connector' ? '从一个图形拖向另一个图形，创建连接' : tool === 'text' ? '点击画布添加文字' : tool === 'hand' ? '拖动画布移动视图' : null

  return (
    <div className="canvas-host" ref={hostRef} style={{ cursor }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setHoverId(null); setCursorWorld(null) }}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!order.length && tool === 'select' && <div className={`canvas-empty ${page.diagramType && page.diagramType !== 'free' ? 'on-light' : ''}`}>
        <span className="empty-canvas-icon">＋</span><h2>从第一个图形开始</h2>
        <p>选择左侧形状，再点击画布放置<br />也可以双击形状，直接添加到中央</p>
        <small>空格 + 拖动平移 · Ctrl + 滚轮缩放</small>
      </div>}
      {placementHint && <div className="placement-hint" role="status"><span>{placementHint}</span><kbd>Esc 退出</kbd></div>}
      {editing && <InlineEditor node={editing as any} cam={cam} hostRef={hostRef} />}
      <VectorEditor cam={cam} />
      <ConnectorEditor cam={cam} />
      {editingCell && nodes[editingCell.id]?.kind === 'table' && (
        <TableCellEditor key={`${editingCell.id}-${editingCell.r}-${editingCell.c}`} table={nodes[editingCell.id] as TableNode} cell={editingCell} cam={cam} onClose={() => setEditingCell(null)} />
      )}
      {!editing && tool === 'select' && selection.length > 0 && (
        <SelectionToolbar cam={cam} viewport={size} />
      )}
      <Navigator viewport={size} />
      <div className="canvas-status" aria-label="画布状态">
        <button className={s.snapEnabled ? 'on' : ''} onClick={() => s.toggleSnap()} title="切换智能吸附">
          吸附 {s.snapEnabled ? '开' : '关'}
        </button>
        <span className="status-sep" />
        <button className={s.gridVisible ? 'on' : ''} onClick={() => s.toggleGrid()} title="切换网格">
          网格 {s.gridVisible ? `${s.gridSize}px` : '关'}
        </button>
        {selection.length > 0 && <><span className="status-sep" /><span>已选 {selection.length}</span></>}
        {cursorWorld && <><span className="status-sep" /><span>X {Math.round(cursorWorld.x)} · Y {Math.round(cursorWorld.y)}</span></>}
      </div>
    </div>
  )

  function rectLeft() { return hostRef.current?.getBoundingClientRect().left ?? 0 }
  function rectTop() { return hostRef.current?.getBoundingClientRect().top ?? 0 }

  async function insertImageAt(cx: number, cy: number) {
    const api = (window as any).boardAPI
    if (!api) return
    const res = await api.importImage()
    if (!res?.ok || !res.files?.length) return
    const st = useStore.getState()
    const files = res.files
    const items = files.map((f: any, i: number) => {
      const n = makeImage(cx - 160, cy - 100 + i * 24, 320, 220, f.dataUrl, st.maxZ() + 1 + i)
      n.name = f.name
      return n
    })
    st.addNodes(items, '插入图片')
  }
}

function SelectionToolbar({ cam, viewport }: { cam: { x: number; y: number; zoom: number }; viewport: { w: number; h: number } }) {
  const s = useStore()
  const box = s.selectionRect()
  if (!box) return null
  const count = s.selection.length
  const centerX = (box.x + box.w / 2) * cam.zoom + cam.x
  const top = box.y * cam.zoom + cam.y
  const bottom = (box.y + box.h) * cam.zoom + cam.y
  if (centerX < -120 || centerX > viewport.w + 120 || bottom < -80 || top > viewport.h + 80) return null
  const x = clamp(centerX, 150, Math.max(150, viewport.w - 150))
  const y = top > 52 ? top - 10 : Math.min(viewport.h - 12, bottom + 10)
  const style: React.CSSProperties = {
    left: x,
    top: y,
    transform: top > 52 ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'
  }
  const stop = (e: React.PointerEvent) => e.stopPropagation()
  return (
    <div className="selection-toolbar" style={style} onPointerDown={stop}>
      <span className="selection-count">{count} 个对象</span>
      <span className="selection-divider" />
      {count > 1 && (
        <>
          <button onClick={() => s.align('hcenter')} title="水平居中对齐">↔</button>
          <button onClick={() => s.align('vcenter')} title="垂直居中对齐">↕</button>
          <button onClick={() => s.distribute('h')} disabled={count < 3} title="水平等距分布">⇥⇤</button>
          <button onClick={() => s.group(s.selection)} title="组合 (Ctrl+G)">组合</button>
          <span className="selection-divider" />
        </>
      )}
      <button onClick={() => s.duplicate(s.selection)} title="创建副本 (Ctrl+D)">副本</button>
      <button onClick={() => s.bringToFront(s.selection)} title="置于顶层">置顶</button>
      <button onClick={() => {
        s.updateNodes(s.selection, (n) => { n.locked = true }, '锁定元素')
        s.clearSelection()
      }} title="锁定对象">锁定</button>
      <button className="danger" onClick={() => s.removeNodes(s.selection)} title="删除 (Delete)">删除</button>
    </div>
  )
}

function centerOfSel(ids: string[], st: ReturnType<typeof useStore.getState>): PtT {
  const ns = ids.map((id) => st.page().nodes[id]).filter(Boolean) as AnyNode[]
  if (!ns.length) return { x: 0, y: 0 }
  return rectCenterOf(unionRect(ns.map((n) => rotatedBounds(nodeRect(n), n.rot))))
}

/* ---------------- 辅助函数 ---------------- */

function rectCenterOf(r: RectT): PtT { return { x: r.x + r.w / 2, y: r.y + r.h / 2 } }

function handlePos(b: RectT, h: Handle): PtT {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  switch (h) {
    case 'nw': return { x: b.x, y: b.y }
    case 'n': return { x: cx, y: b.y }
    case 'ne': return { x: b.x + b.w, y: b.y }
    case 'e': return { x: b.x + b.w, y: cy }
    case 'se': return { x: b.x + b.w, y: b.y + b.h }
    case 's': return { x: cx, y: b.y + b.h }
    case 'sw': return { x: b.x, y: b.y + b.h }
    case 'w': return { x: b.x, y: cy }
    default: return { x: cx, y: b.y }
  }
}

function drawHandles(ctx: CanvasRenderingContext2D, b: RectT, zoom: number) {
  const hs: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  const handleSize = HANDLE_SIZE / zoom
  const rotOffset = ROT_OFFSET / zoom
  ctx.save()
  // 旋转手柄
  ctx.strokeStyle = '#5B8CFF'
  ctx.lineWidth = 1 / zoom
  ctx.beginPath()
  ctx.moveTo(b.x + b.w / 2, b.y)
  ctx.lineTo(b.x + b.w / 2, b.y - rotOffset)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(b.x + b.w / 2, b.y - rotOffset, 5 / zoom, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.stroke()
  for (const h of hs) {
    const p = handlePos(b, h)
    ctx.beginPath()
    ctx.rect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#5B8CFF'
    ctx.lineWidth = 1.5 / zoom
    ctx.stroke()
  }
  ctx.restore()
}

function resizeBox(b: RectT, p: PtT, h: Handle, keepAspect = false, fromCenter = false): RectT {
  let { x, y, w, h: hh } = b
  const right = b.x + b.w, bottom = b.y + b.h
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  if (fromCenter) {
    if (h.includes('w') || h.includes('e')) { w = Math.max(20, Math.abs(p.x - cx) * 2); x = cx - w / 2 }
    if (h.includes('n') || h.includes('s')) { hh = Math.max(20, Math.abs(p.y - cy) * 2); y = cy - hh / 2 }
  } else {
    if (h.includes('w')) { const nx = Math.min(p.x, right - 20); w = right - nx; x = nx }
    if (h.includes('e')) { w = Math.max(20, p.x - b.x) }
    if (h.includes('n')) { const ny = Math.min(p.y, bottom - 20); hh = bottom - ny; y = ny }
    if (h.includes('s')) { hh = Math.max(20, p.y - b.y) }
  }
  if (keepAspect && b.w > 0 && b.h > 0) {
    const ratio = b.w / b.h
    const horizontal = h.includes('w') || h.includes('e')
    const vertical = h.includes('n') || h.includes('s')
    if (horizontal && vertical) {
      if (Math.abs(w / b.w - 1) >= Math.abs(hh / b.h - 1)) hh = Math.max(20, w / ratio)
      else w = Math.max(20, hh * ratio)
    } else if (horizontal) {
      hh = Math.max(20, w / ratio)
    } else if (vertical) {
      w = Math.max(20, hh * ratio)
    }
    if (fromCenter) {
      x = cx - w / 2; y = cy - hh / 2
    } else {
      x = h.includes('w') ? right - w : horizontal ? b.x : cx - w / 2
      y = h.includes('n') ? bottom - hh : vertical ? b.y : cy - hh / 2
    }
  }
  return { x, y, w, h: hh }
}

function defaultSize(kind: string): { w: number; h: number } {
  const symbol=symbolDefinition(kind);if(symbol)return {w:symbol.w,h:symbol.h}
  const map: Record<string, [number, number]> = {
    rect: [160, 100], roundRect: [160, 100], ellipse: [160, 100], triangle: [150, 110],
    diamond: [150, 110], pentagon: [150, 120], hexagon: [160, 110], star: [150, 140],
    cylinder: [130, 150], cloud: [190, 130], arrow: [180, 90], chevron: [180, 90],
    parallelogram: [170, 90], trapezoid: [160, 90], document: [150, 130], sticky: [170, 170],
    text: [220, 50], table: [240, 150], image: [260, 190], frame: [400, 300]
  }
  const [w, h] = map[kind] || [160, 100]
  return { w, h }
}

function makeRoute(a: PtT, b: PtT, route: string): PtT[] {
  if (route === 'straight') return [a, b]
  if (route === 'curve') return [a, { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.08, y: (a.y + b.y) / 2 - (b.x - a.x) * 0.08 }, b]
  const bias: 'h' | 'v' = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
  if (bias === 'h') {
    const mx = (a.x + b.x) / 2
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]
  }
  const my = (a.y + b.y) / 2
  return [a, { x: a.x, y: my }, { x: b.x, y: my }, b]
}

/** 把节点写到「起点 + 总位移」的绝对位置（拖拽中每帧调用） */
function applyTarget(orig: Record<string, AnyNode>, ids: string[], dx: number, dy: number) {
  const st = useStore.getState()
  for (const id of ids) {
    const o = orig[id]
    if (!o) continue
    st.updateNode(id, { x: o.x + dx, y: o.y + dy })
    if((o as LineNode).bends)st.updateNode(id,{bends:(o as LineNode).bends!.map(p=>({x:p.x+dx,y:p.y+dy}))})
    if((o as LineNode).messageY!==undefined)st.updateNode(id,{messageY:(o as LineNode).messageY!+dy})
  }
  // 连线跟随端点（与 store.moveNodes 内逻辑一致，这里做每帧实时刷新）
  const page = st.page()
  const affected = page.order.filter((id) => {
    const n = page.nodes[id]
    if (n?.kind !== 'connector') return false
    const ln = n as LineNode
    return !!((ln.from && ids.includes(ln.from.nodeId)) || (ln.to && ids.includes(ln.to.nodeId)))
  })
  if (!affected.length) return
  st.updateNodes(affected, (n) => {
    Object.assign(n, reflowConnector(n as LineNode, (id) => page.nodes[id]))
  })
}

/** 从拖拽起点快照做绝对缩放，杜绝 pointermove 连续累积造成的尺寸漂移。 */
function applyScaleTarget(orig: Record<string, AnyNode>, ids: string[], box0: RectT, box1: RectT) {
  const st = useStore.getState()
  const sx = box0.w === 0 ? 1 : box1.w / box0.w
  const sy = box0.h === 0 ? 1 : box1.h / box0.h
  st.updateNodes(ids, (n) => {
    const o = orig[n.id]
    if (!o) return
    n.x = box1.x + (o.x - box0.x) * sx
    n.y = box1.y + (o.y - box0.y) * sy
    n.w = Math.max(4, o.w * sx)
    n.h = Math.max(4, o.h * sy)
    const line = n as LineNode
    const source = o as LineNode
    if (source.points) line.points = source.points.map((pt) => ({ x: pt.x * sx, y: pt.y * sy }))
  })
  reflowAttached(ids)
}

function reflowAttached(ids: string[]) {
  const st = useStore.getState()
  const page = st.page()
  const affected = page.order.filter((id) => {
    const n = page.nodes[id]
    if (n?.kind !== 'connector' || ids.includes(id)) return false
    const line = n as LineNode
    return !!((line.from && ids.includes(line.from.nodeId)) || (line.to && ids.includes(line.to.nodeId)))
  })
  if (affected.length) st.updateNodes(affected, (n) => {
    Object.assign(n, reflowConnector(n as LineNode, (id) => page.nodes[id]))
  })
}

/** 吸附：与其它节点边缘/中心对齐 */
function snapCheck(
  moved: { id: string; x: number; y: number; w: number; h: number }[],
  page: { nodes: Record<string, AnyNode>; order: string[] },
  movingIds: string[],
  threshold = 5
): { dx: number; dy: number; guides: SnapGuide[] } {
  const TH = threshold
  const others = page.order
    .filter((id) => !movingIds.includes(id))
    .map((id) => page.nodes[id])
    .filter((n) => n && !n.hidden && !n.locked)
  if (!others.length) return { dx: 0, dy: 0, guides: [] }

  const box = unionRect(moved.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h })))
  const vTargets: { pos: number; from: number; to: number }[] = []
  const hTargets: { pos: number; from: number; to: number }[] = []
  for (const o of others) {
    const r = nodeRect(o)
    vTargets.push({ pos: r.x, from: r.y - 20, to: r.y + r.h + 20 })
    vTargets.push({ pos: r.x + r.w, from: r.y - 20, to: r.y + r.h + 20 })
    vTargets.push({ pos: r.x + r.w / 2, from: r.y - 20, to: r.y + r.h + 20 })
    hTargets.push({ pos: r.y, from: r.x - 20, to: r.x + r.w + 20 })
    hTargets.push({ pos: r.y + r.h, from: r.x - 20, to: r.x + r.w + 20 })
    hTargets.push({ pos: r.y + r.h / 2, from: r.x - 20, to: r.x + r.w + 20 })
  }
  let best: { d: number; dx: number; dy: number; guides: SnapGuide[] } | null = null
  const cands: { d: number; dx: number; dy: number; guides: SnapGuide[] }[] = []
  for (const t of vTargets) {
    for (const [edge, off] of [['x', 0], ['x2', box.w], ['cx', box.w / 2]] as [string, number][]) {
      const d = t.pos - (box.x + off)
      if (Math.abs(d) <= TH) cands.push({ d: Math.abs(d), dx: d, dy: 0, guides: [{ type: 'v', pos: t.pos, from: Math.min(t.from, box.y), to: Math.max(t.to, box.y + box.h) }] })
    }
  }
  for (const t of hTargets) {
    for (const [edge, off] of [['y', 0], ['y2', box.h], ['cy', box.h / 2]] as [string, number][]) {
      const d = t.pos - (box.y + off)
      if (Math.abs(d) <= TH) cands.push({ d: Math.abs(d), dx: 0, dy: d, guides: [{ type: 'h', pos: t.pos, from: Math.min(t.from, box.x), to: Math.max(t.to, box.x + box.w) }] })
    }
  }
  if (!cands.length) return { dx: 0, dy: 0, guides: [] }
  cands.sort((a, b) => a.d - b.d)
  const v = cands.find((c) => c.dx !== 0)
  const h = cands.find((c) => c.dy !== 0)
  const guides: SnapGuide[] = []
  let dx = 0, dy = 0
  if (v) { dx = v.dx; guides.push(...v.guides) }
  if (h) { dy = h.dy; guides.push(...h.guides) }
  return { dx, dy, guides }
}

/* ---------------- 内联文本编辑 ---------------- */
function TableCellEditor({ table, cell, cam, onClose }: {
  table: TableNode; cell: { r: number; c: number }; cam: { x: number; y: number; zoom: number }; onClose: () => void
}) {
  const initial = table.data[cell.r]?.[cell.c]?.text || ''
  const [text, setText] = useState(initial)
  const done = useRef(false)
  const hh = table.rows === 1 ? table.h : Math.min(34, table.h * .22)
  const rh = (table.h - hh) / Math.max(1, table.rows - 1)
  const cw = table.w / table.cols
  const local = { x: table.x + (cell.c + .5) * cw, y: table.y + (cell.r === 0 ? hh / 2 : hh + (cell.r - .5) * rh) }
  const center = rotatePoint(local, nodeCenter(table), table.rot)
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save && text !== initial) useStore.getState().updateNodes([table.id], node => {
      const t = node as TableNode
      t.data[cell.r][cell.c].text = text
    }, '编辑表格单元格')
    onClose()
  }
  return <textarea autoFocus className="inline-editor" value={text}
    onFocus={e => e.currentTarget.select()} onChange={e => setText(e.target.value)} onBlur={() => finish(true)}
    onPointerDown={e => e.stopPropagation()} onKeyDown={e => {
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); finish(false) }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true) }
    }} aria-label={`编辑第 ${cell.r + 1} 行第 ${cell.c + 1} 列`}
    style={{ left: center.x * cam.zoom + cam.x, top: center.y * cam.zoom + cam.y,
      width: Math.max(70, cw * cam.zoom), height: Math.max(30, (cell.r === 0 ? hh : rh) * cam.zoom),
      transform: `translate(-50%, -50%) rotate(${table.rot}deg)`, fontSize: (table.fontSize || 13) * cam.zoom,
      color: '#1a1c22', background: '#fff' }} />
}

function InlineEditor({ node, cam, hostRef }: { node: AnyNode; cam: { x: number; y: number; zoom: number }; hostRef: React.RefObject<HTMLDivElement> }) {
  const [text, setText] = useState((node as ShapeNode).text || '')
  const ref = useRef<HTMLTextAreaElement>(null)
  const st = useStore()

  useEffect(() => { setText((node as ShapeNode).text || '') }, [node.id])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
    const host = hostRef.current
    if (host) {
      // 让输入框覆盖在图形上
      const r = host.getBoundingClientRect()
      const sx = node.x * cam.zoom + cam.x
      const sy = node.y * cam.zoom + cam.y
      el.style.left = `${sx}px`
      el.style.top = `${sy}px`
      el.style.width = `${Math.max(60, node.w * cam.zoom)}px`
      el.style.height = `${Math.max(28, node.h * cam.zoom)}px`
      el.style.fontSize = `${(node as ShapeNode).fontSize ? (node as ShapeNode).fontSize! * cam.zoom : 14 * cam.zoom}px`
    }
  }, [node.id, cam, hostRef])

  const canceled = useRef(false)
  const commit = () => {
    st.setEditing(null)
    if (canceled.current) return
    if (text !== (node as ShapeNode).text) {
      st.updateNode(node.id, { text } as any, '编辑文本')
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { canceled.current = true; st.setEditing(null) }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit()
  }

  return (
    <textarea
      ref={ref}
      className="inline-editor"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      style={{
        fontFamily: (node as ShapeNode).fontFamily || 'inherit',
        fontWeight: (node as ShapeNode).bold ? 600 : 400,
        textAlign: (node as ShapeNode).align || 'center',
        color: (node as ShapeNode).color || '#1a1c22',
        background: (node as ShapeNode).fill === 'transparent' ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.92)'
      }}
      placeholder="输入文字…"
    />
  )
}

/* 全局保存函数（供快捷键调用） */
export async function doSave() {
  return saveDocument()
}
