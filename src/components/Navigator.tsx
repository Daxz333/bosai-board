import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store/board'
import type { AnyNode } from '../types'
import { nodeRect, rotatedBounds, unionRect, type Rect } from '../engine/geometry'

const MAP_W = 176
const MAP_H = 112
const PAD = 10

/** 小地图：同时展示内容范围和当前视口，可点击或拖动快速导航。 */
export default function Navigator({ viewport }: { viewport: { w: number; h: number } }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const s = useStore()
  const page = s.page()
  const visible = page.order.map((id) => page.nodes[id]).filter((n): n is AnyNode => !!n && !n.hidden)
  const viewRect: Rect = {
    x: -s.camera.x / s.camera.zoom,
    y: -s.camera.y / s.camera.zoom,
    w: viewport.w / s.camera.zoom,
    h: viewport.h / s.camera.zoom
  }
  const bounds = useMemo(() => {
    const rects = visible.map((n) => rotatedBounds(nodeRect(n), n.rot))
    rects.push(viewRect)
    const b = unionRect(rects)
    const margin = Math.max(80, Math.max(b.w, b.h) * 0.08)
    return { x: b.x - margin, y: b.y - margin, w: b.w + margin * 2, h: b.h + margin * 2 }
  }, [page.nodes, page.order, s.camera, viewport.w, viewport.h])

  const scale = Math.min((MAP_W - PAD * 2) / Math.max(1, bounds.w), (MAP_H - PAD * 2) / Math.max(1, bounds.h))
  const ox = (MAP_W - bounds.w * scale) / 2 - bounds.x * scale
  const oy = (MAP_H - bounds.h * scale) / 2 - bounds.y * scale

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = MAP_W * dpr
    canvas.height = MAP_H * dpr
    canvas.style.width = `${MAP_W}px`
    canvas.style.height = `${MAP_H}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, MAP_W, MAP_H)

    for (const n of visible) {
      const r = rotatedBounds(nodeRect(n), n.rot)
      const x = r.x * scale + ox, y = r.y * scale + oy
      const w = Math.max(1.5, r.w * scale), h = Math.max(1.5, r.h * scale)
      const isLine = n.kind === 'line' || n.kind === 'pencil' || n.kind === 'connector'
      ctx.fillStyle = isLine ? 'rgba(126,166,255,.7)' : 'rgba(203,213,225,.62)'
      if (isLine) ctx.fillRect(x, y, Math.max(1.5, w), Math.max(1.5, h))
      else {
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, Math.min(2.5, w / 4, h / 4))
        ctx.fill()
      }
    }

    ctx.fillStyle = 'rgba(91,140,255,.12)'
    ctx.strokeStyle = '#7EA6FF'
    ctx.lineWidth = 1.2
    ctx.fillRect(viewRect.x * scale + ox, viewRect.y * scale + oy, viewRect.w * scale, viewRect.h * scale)
    ctx.strokeRect(viewRect.x * scale + ox, viewRect.y * scale + oy, viewRect.w * scale, viewRect.h * scale)
  }, [visible, viewRect.x, viewRect.y, viewRect.w, viewRect.h, scale, ox, oy])

  const navigate = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const worldX = (clientX - rect.left - ox) / scale
    const worldY = (clientY - rect.top - oy) / scale
    const st = useStore.getState()
    st.setCamera({
      x: viewport.w / 2 - worldX * st.camera.zoom,
      y: viewport.h / 2 - worldY * st.camera.zoom
    })
  }

  if (!visible.length) return null
  return (
    <div className="navigator" title="导航器 · 点击或拖动以移动视口">
      <canvas
        ref={ref}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          navigate(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => { if (e.buttons === 1) navigate(e.clientX, e.clientY) }}
      />
      <span className="navigator-label">导航器</span>
    </div>
  )
}
