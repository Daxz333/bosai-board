import type { AnyNode, Side, TableNode, LineNode, ImageNode, ShapeNode } from '../types'
import { samplePath } from './paths'

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const round = (v: number, n = 2) => Math.round(v * 10 ** n) / 10 ** n
/** Line geometry is stored in world coordinates, so exports never apply a second rotation. */
export function rotateLineGeometry(n:LineNode,center:Pt,degrees:number):Partial<LineNode> {
  const points=(n.points||[]).map(p=>rotatePoint({x:n.x+p.x,y:n.y+p.y},center,degrees))
  if(!points.length)return {rot:0}
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y))
  return {x,y,w:Math.max(1,Math.max(...points.map(p=>p.x))-x),h:Math.max(1,Math.max(...points.map(p=>p.y))-y),points:points.map(p=>({x:p.x-x,y:p.y-y})),bends:n.bends?.map(p=>rotatePoint(p,center,degrees)),rot:0}
}

export function nodeRect(n: AnyNode): Rect {
  return { x: n.x, y: n.y, w: n.w, h: n.h }
}

export function rectCenter(r: Rect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

export function unionRect(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y)
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = clamp(t, 0, 1)
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > p.y) !== (b.y > p.y) &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 节点四个边的中心点 */
export function sideAnchor(r: Rect, side: Side): Pt {
  const c = rectCenter(r)
  switch (side) {
    case 'top': return { x: c.x, y: r.y }
    case 'bottom': return { x: c.x, y: r.y + r.h }
    case 'left': return { x: r.x, y: c.y }
    case 'right': return { x: r.x + r.w, y: c.y }
    default: return c
  }
}

/** 从矩形中心朝 (tx,ty) 方向求边界交点所在边 */
export function autoSide(r: Rect, from: Pt, to: Pt): Side {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  const dx = to.x - from.x, dy = to.y - from.y
  if (dx === 0 && dy === 0) return 'top'
  const sx = dx === 0 ? Infinity : (r.w / 2) / Math.abs(dx)
  const sy = dy === 0 ? Infinity : (r.h / 2) / Math.abs(dy)
  const s = Math.min(sx, sy)
  const px = cx + dx * s, py = cy + dy * s
  const onX = Math.abs(px - r.x) < 0.6 || Math.abs(px - (r.x + r.w)) < 0.6
  if (onX) return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top')
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top')
}

/** 节点上距离给定点最近的边（用于连线吸附） */
export function nearestSide(r: Rect, p: Pt): Side {
  const cands: { s: Side; d: number }[] = [
    { s: 'top', d: Math.abs(p.y - r.y) },
    { s: 'bottom', d: Math.abs(p.y - (r.y + r.h)) },
    { s: 'left', d: Math.abs(p.x - r.x) },
    { s: 'right', d: Math.abs(p.x - (r.x + r.w)) }
  ]
  cands.sort((a, b) => a.d - b.d)
  return cands[0].s
}

/** 旋转后的轴对齐包围盒 */
export function rotatedBounds(r: Rect, deg: number): Rect {
  if (!deg) return r
  const rad = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad))
  const w = r.w * c + r.h * s
  const h = r.w * s + r.h * c
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

export function rotatePoint(p: Pt, c: Pt, deg: number): Pt {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  const dx = p.x - c.x, dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

/** 取得节点渲染用中心点（考虑旋转不影响中心） */
export function nodeCenter(n: AnyNode): Pt {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 }
}

/** 判断点是否在节点内（含旋转） */
export function hitTestNode(n: AnyNode, p: Pt, poly: Pt[] | null, pad = 0): boolean {
  if (n.locked || n.hidden) return false
  const c = nodeCenter(n)
  const local = n.rot ? rotatePoint(p, c, -n.rot) : p
  const r: Rect = { x: n.x, y: n.y, w: n.w, h: n.h }
  const lp = { x: local.x, y: local.y }
  if (n.kind === 'path') {
    const pts = samplePath(n)
    if (n.closed && n.fill && n.fill !== 'transparent' && n.fill !== 'none' && pointInPolygon(lp, pts)) return true
    return pts.some((q, i) => i > 0 && distToSegment(lp, pts[i - 1], q) <= (n.strokeWidth || 2) / 2 + pad + 4)
  }
  if (n.kind === 'line' || n.kind === 'pencil' || n.kind === 'connector') {
    const ln = n as LineNode
    if (ln.points && ln.points.length > 1) {
      const pts = ln.points.map((q) => ({ x: n.x + q.x, y: n.y + q.y }))
      const tol = (ln.strokeWidth || 2) / 2 + pad + 4
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(p, pts[i], pts[i + 1]) <= tol) return true
      }
      return false
    }
    return rectContains(inflate(r, pad + 4), p.x, p.y)
  }
  if (poly) return pointInPolygon(lp, poly)
  if (n.kind === 'ellipse' || n.kind === 'cylinder' || n.kind === 'cloud') {
    const rx = n.w / 2 + pad, ry = n.h / 2 + pad
    if (rx <= 0 || ry <= 0) return false
    const nx = (local.x - c.x) / rx, ny = (local.y - c.y) / ry
    return nx * nx + ny * ny <= 1
  }
  return rectContains(inflate(r, pad), local.x, local.y)
}

export function isTextNode(n: AnyNode): n is ShapeNode {
  return n.kind === 'text' || (n as ShapeNode).text !== undefined
}

export function isTable(n: AnyNode): n is TableNode {
  return n.kind === 'table'
}
export function isImage(n: AnyNode): n is ImageNode {
  return n.kind === 'image'
}
export function isLine(n: AnyNode): n is LineNode {
  return n.kind === 'line' || n.kind === 'pencil' || n.kind === 'connector'
}
