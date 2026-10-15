import type { ShapeNode, PathAnchor } from '../types'
import { shapePoly } from './shapes'
import type { Pt } from './geometry'

export function pathData(n: ShapeNode): string {
  const anchors = n.anchors || []
  if (!anchors.length) return ''
  const p = (a: Pt) => `${n.x + a.x * n.w} ${n.y + a.y * n.h}`
  let d = `M ${p(anchors[0])}`
  const count = n.closed ? anchors.length : anchors.length - 1
  for (let i = 0; i < count; i++) {
    const a = anchors[i], b = anchors[(i + 1) % anchors.length]
    d += a.out || b.in ? ` C ${p(a.out || a)} ${p(b.in || b)} ${p(b)}` : ` L ${p(b)}`
  }
  return n.closed ? d + ' Z' : d
}

export function samplePath(n: ShapeNode, steps = 24): Pt[] {
  const anchors = n.anchors || []
  const pts: Pt[] = []
  const count = n.closed ? anchors.length : Math.max(0, anchors.length - 1)
  if (anchors.length) pts.push({ x: n.x + anchors[0].x * n.w, y: n.y + anchors[0].y * n.h })
  for (let i = 0; i < count; i++) {
    const a = anchors[i], b = anchors[(i + 1) % anchors.length]
    const c1 = a.out || a, c2 = b.in || b
    const length = a.out || b.in ? steps : 1
    for (let j = 1; j <= length; j++) {
      const t = j / length, u = 1 - t
      pts.push({
        x: n.x + (u*u*u*a.x + 3*u*u*t*c1.x + 3*u*t*t*c2.x + t*t*t*b.x) * n.w,
        y: n.y + (u*u*u*a.y + 3*u*u*t*c1.y + 3*u*t*t*c2.y + t*t*t*b.y) * n.h
      })
    }
  }
  return pts
}

/** 由世界坐标节点建立稳定的局部坐标框，包含控制点的保守范围。 */
export function pathFromWorld(anchors: PathAnchor[], closed: boolean, z: number): ShapeNode {
  const pts = anchors.flatMap(a => [a, ...(a.in ? [a.in] : []), ...(a.out ? [a.out] : [])])
  const x = Math.min(...pts.map(p => p.x)), y = Math.min(...pts.map(p => p.y))
  const w = Math.max(1, Math.max(...pts.map(p => p.x)) - x), h = Math.max(1, Math.max(...pts.map(p => p.y)) - y)
  const local = (p: Pt) => ({ x: (p.x - x) / w, y: (p.y - y) / h })
  return { id: '', kind: 'path', x, y, w, h, rot: 0, z, closed,
    fill: closed ? '#E8F0FF' : 'transparent', stroke: '#3B6FE0', strokeWidth: 2,
    anchors: anchors.map(a => ({ ...local(a), ...(a.in ? { in: local(a.in) } : {}), ...(a.out ? { out: local(a.out) } : {}) })) }
}

export function convertToPath(n: ShapeNode): ShapeNode {
  if (n.kind === 'path') return n
  let anchors: PathAnchor[]
  if (n.kind === 'ellipse') {
    const k = .5522847498307936 / 2
    anchors = [
      { x: .5, y: 0, in: { x: .5-k, y: 0 }, out: { x: .5+k, y: 0 } },
      { x: 1, y: .5, in: { x: 1, y: .5-k }, out: { x: 1, y: .5+k } },
      { x: .5, y: 1, in: { x: .5+k, y: 1 }, out: { x: .5-k, y: 1 } },
      { x: 0, y: .5, in: { x: 0, y: .5+k }, out: { x: 0, y: .5-k } }
    ]
  } else anchors = shapePoly(n.kind, n.w, n.h, n.radius).map(p => ({ x: p.x / n.w, y: p.y / n.h }))
  return { ...n, kind: 'path', anchors, closed: true }
}

/** De Casteljau 分割曲线，不改变原路径外观。 */
export function splitSegment(anchors: PathAnchor[], index: number): PathAnchor[] {
  const result = structuredClone(anchors)
  const a = result[index], b = result[(index + 1) % result.length]
  const mid = (p: Pt, q: Pt) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
  if (!a.out && !b.in) result.splice(index + 1, 0, mid(a, b))
  else {
    const c1 = a.out || a, c2 = b.in || b
    const ab = mid(a, c1), bc = mid(c1, c2), cd = mid(c2, b)
    const abc = mid(ab, bc), bcd = mid(bc, cd), center = mid(abc, bcd)
    a.out = ab; b.in = cd
    result.splice(index + 1, 0, { ...center, in: abc, out: bcd })
  }
  return result
}
