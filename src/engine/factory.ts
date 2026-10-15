import type { AnyNode, ShapeNode, VectorShapeKind, TableNode, ImageNode, LineNode, StyleProps, TextProps } from '../types'
import { professionalDefaults } from './engineering'

export function makeShape(kind: VectorShapeKind, x: number, y: number, w: number, h: number, z: number): ShapeNode {
  const base: ShapeNode = {
    id: '', kind, x, y, w, h, rot: 0, z,
    fill: '#E8F0FF', stroke: '#3B6FE0', strokeWidth: 2, lineStyle: 'solid',
    text: '', fontSize: 14, color: '#1A1C22', align: 'center', valign: 'middle',
    lineHeight: 1.5, letterSpacing: 0, radius: 10, ...professionalDefaults(kind)
  }
  switch (kind) {
    case 'sticky':
      return { ...base, fill: '#FFE066', stroke: 'none', strokeWidth: 0, w, h, radius: 2, valign: 'top', color: '#5a4a00' }
    case 'ellipse':
      return { ...base, fill: '#E8F0FF' }
    case 'diamond':
    case 'hexagon':
    case 'pentagon':
      return { ...base, fill: '#FFF3D6', stroke: '#E8A317' }
    case 'cylinder':
      return { ...base, fill: '#DFF3F8', stroke: '#0CA678', fill2: '#B7E7F0' }
    case 'cloud':
      return { ...base, fill: '#EAF7EE', stroke: '#2F9E44' }
    case 'arrow':
    case 'chevron':
      return { ...base, fill: '#F0E8FF', stroke: '#7048E8' }
    case 'parallelogram':
      return { ...base, fill: '#E6F6F9', stroke: '#1098AD' }
    case 'trapezoid':
      return { ...base, fill: '#FDECEC', stroke: '#E03131' }
    case 'document':
      return { ...base, fill: '#F8F9FA', stroke: '#868E96' }
    case 'text':
      return { ...base, fill: 'transparent', stroke: 'none', strokeWidth: 0, align: 'left', valign: 'top', fontSize: 18, color: '#1A1C22' }
    default:
      return base
  }
}

export function makeTable(x: number, y: number, z: number): TableNode {
  const rows = 3, cols = 3
  const data = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      text: r === 0 ? `标题${c + 1}` : c === 0 ? `列${r}` : ''
    }))
  )
  return {
    id: '', kind: 'table', x, y, w: 240, h: 150, rot: 0, z,
    rows, cols, data,
    stroke: '#8B93A3', strokeWidth: 1, fill: '#FFFFFF',
    headerFill: '#E8F0FF', headerColor: '#1A1C22', fontSize: 13
  }
}

export function makeImage(x: number, y: number, w: number, h: number, src: string, z: number): ImageNode {
  return { id: '', kind: 'image', x, y, w, h, rot: 0, z, src, corner: 4 }
}

export function makeLine(
  x: number, y: number, w: number, h: number, z: number,
  opts: Partial<LineNode> = {}
): LineNode {
  return {
    id: '', kind: 'line', x, y, w, h, rot: 0, z,
    points: [{ x: 0, y: 0 }, { x: w, y: h }],
    stroke: '#2B3550', strokeWidth: 2, lineStyle: 'solid',
    arrow: 'end', route: 'straight',
    ...opts
  }
}

export function makePencil(x: number, y: number, z: number, stroke: string): LineNode {
  return {
    id: '', kind: 'pencil', x, y, w: 1, h: 1, rot: 0, z,
    points: [{ x: 0, y: 0 }], pressure: [1],
    stroke, strokeWidth: 3, lineStyle: 'solid'
  }
}

export function applyStyle(n: AnyNode, s: StyleProps) {
  Object.assign(n, s)
}
export function applyText(n: AnyNode, t: TextProps) {
  Object.assign(n, t)
}
