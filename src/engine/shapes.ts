import type { ShapeKind, ShapeNode, AnyNode } from '../types'
import type { Pt, Rect } from './geometry'

/** 归一化到 0..1 的多边形路径（相对 x,y,w,h） */
export type Poly = Pt[]

export function shapePoly(kind: ShapeKind, w: number, h: number, radius = 8): Poly {
  const x = 0, y = 0
  switch (kind) {
    case 'roundRect': {
      const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2))
      const pts: Poly = []
      const corner = (cx: number, cy: number, a0: number, a1: number) => {
        const steps = 5
        for (let i = 0; i <= steps; i++) {
          const a = a0 + ((a1 - a0) * i) / steps
          pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
        }
      }
      corner(x + w - r, y + r, -Math.PI / 2, 0)
      corner(x + w - r, y + h - r, 0, Math.PI / 2)
      corner(x + r, y + h - r, Math.PI / 2, Math.PI)
      corner(x + r, y + r, Math.PI, Math.PI * 1.5)
      return pts
    }
    case 'ellipse':
    case 'useCase':
    case 'erAttribute':
    case 'dfdProcess':
      return ellipsePoly(w, h, 40)
    case 'triangle':
      return [{ x: w / 2, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
    case 'diamond':
    case 'erRelationship':
    case 'decision':
    case 'bpmnGateway':
      return [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }]
    case 'pentagon': {
      const p: Poly = []
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
        p.push({ x: w / 2 + Math.cos(a) * (w / 2), y: h / 2 + Math.sin(a) * (h / 2) })
      }
      return p
    }
    case 'hexagon': {
      const q = Math.min(w * 0.25, h * 0.5)
      return [
        { x: q, y: 0 }, { x: w - q, y: 0 }, { x: w, y: h / 2 },
        { x: w - q, y: h }, { x: q, y: h }, { x: 0, y: h / 2 }
      ]
    }
    case 'star': {
      const p: Poly = []
      const cx = w / 2, cy = h / 2
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? 0.5 : 0.21
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        p.push({ x: cx + Math.cos(a) * rr * w, y: cy + Math.sin(a) * rr * h })
      }
      return p
    }
    case 'cylinder': {
      const ry = Math.min(h * 0.18, 18)
      return [
        { x: 0, y: ry }, { x: w, y: ry },
        { x: w, y: h - ry }, { x: w / 2, y: h },
        { x: 0, y: h - ry }
      ]
    }
    case 'cloud': {
      const p: Poly = []
      const bumps: [number, number, number][] = [
        [0.28, 0.28, 0.26], [0.62, 0.2, 0.24], [0.8, 0.5, 0.22],
        [0.55, 0.8, 0.26], [0.22, 0.72, 0.24]
      ]
      for (const [bx, by, br] of bumps) {
        const steps = 10
        const cx = bx * w, cy = by * h, r = br * Math.min(w, h)
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2
          p.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.9 })
        }
      }
      return p
    }
    case 'arrow': {
      const t = Math.min(w * 0.35, h * 0.5)
      return [
        { x: 0, y: 0 }, { x: w - t, y: 0 }, { x: w, y: h / 2 },
        { x: w - t, y: h }, { x: 0, y: h }
      ]
    }
    case 'chevron': {
      const t = Math.min(w * 0.3, h * 0.5)
      return [
        { x: 0, y: 0 }, { x: w - t, y: 0 }, { x: w, y: h / 2 },
        { x: w - t, y: h }, { x: 0, y: h }, { x: t, y: h / 2 }
      ]
    }
    case 'parallelogram': {
      const t = Math.min(w * 0.2, h * 0.5)
      return [{ x: t, y: 0 }, { x: w, y: 0 }, { x: w - t, y: h }, { x: 0, y: h }]
    }
    case 'trapezoid': {
      const t = Math.min(w * 0.25, h * 0.5)
      return [{ x: t, y: 0 }, { x: w - t, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
    }
    case 'rect':
    case 'sticky':
    case 'text':
    case 'image':
    case 'table':
    case 'frame':
      return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
    case 'document': {
      const f = Math.min(h * 0.22, 22)
      return [
        { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h - f },
        { x: w - f, y: h }, { x: 0, y: h }
      ]
    }
    default:
      return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
  }
}

export function ellipsePoly(w: number, h: number, steps = 48): Poly {
  const p: Poly = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    p.push({ x: w / 2 + Math.cos(a) * (w / 2), y: h / 2 + Math.sin(a) * (h / 2) })
  }
  return p
}

/** 取得节点的世界坐标多边形（未旋转则直接平移） */
export function nodePoly(n: AnyNode): Poly | null {
  if(n.kind==='dfdProcess'&&n.semantic?.notation==='gane') return shapePoly('rect',n.w,n.h).map(p=>({x:p.x+n.x,y:p.y+n.y}))
  const k = n.kind as string
  if (k === 'cylinder' || k === 'cloud' || k === 'roundRect' || k === 'document') {
    const base = shapePoly(k as any, n.w, n.h, (n as ShapeNode).radius ?? 8)
    return base.map((p) => ({ x: p.x + n.x, y: p.y + n.y }))
  }
  if (k === 'ellipse' || k === 'image' || k === 'table' || k === 'text' || k === 'frame') return null
  if (k === 'line' || k === 'pencil' || k === 'connector' || k === 'path') return null
  const base = shapePoly(k as any, n.w, n.h, (n as ShapeNode).radius ?? 8)
  return base.map((p) => ({ x: p.x + n.x, y: p.y + n.y }))
}

/* ---------------- 连线路由 ---------------- */

export interface RouteResult {
  points: Pt[]
  fromSide: string
  toSide: string
}

/** 正交折线路由：水平优先，生成标准的三段式折线 */
export function routeOrthogonal(a: Pt, b: Pt, bendFirst: 'h' | 'v' = 'h'): Pt[] {
  if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) return [a, b]
  const pts = bendFirst === 'h'
    ? [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b]
    : [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b]
  return simplify(pts)
}

export function routeCurve(a: Pt, b: Pt, bias = 0.4): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y
  const cx = (a.x + b.x) / 2 - dy * bias, cy = (a.y + b.y) / 2 + dx * bias
  return [a, { x: cx, y: cy }, b]
}

export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.8 && Math.abs(last.y - p.y) < 0.8) continue
    out.push(p)
  }
  // 去掉共线的中间点
  const res: Pt[] = []
  for (let i = 0; i < out.length; i++) {
    const p = out[i]
    const prev = res[res.length - 1]
    const next = out[i + 1]
    if (prev && next) {
      const collinear =
        (Math.abs(prev.x - p.x) < 0.8 && Math.abs(p.x - next.x) < 0.8) ||
        (Math.abs(prev.y - p.y) < 0.8 && Math.abs(p.y - next.y) < 0.8)
      if (collinear) continue
    }
    res.push(p)
  }
  return res
}

export function boundsOfPts(pts: Pt[], pad = 6): Rect {
  if (!pts.length) return { x: 0, y: 0, w: 1, h: 1 }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const p of pts) {
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y)
    x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y)
  }
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 }
}
