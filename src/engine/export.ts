import type { AnyNode, Doc, LineNode, ShapeNode, TableNode } from '../types'
import { shapePoly, nodePoly, ellipsePoly } from './shapes'
import { DEFAULT_FONT } from '../types'
import { getImage } from './render'
import { computeConnectorPoints, expandNodeIds } from '../store/board'
import { nodeRect, rotatedBounds, unionRect } from './geometry'
import { pathData } from './paths'
import { inheritedFlag } from './hierarchy'
import { isProfessional } from './engineering'
import { professionalSvg, markersSvg, labelsSvg, lineLabels, connectorPath } from './engineering-visual'

/** 把一个页面的全部节点导出为独立 SVG 字符串 */
export function exportPageSvg(doc: Doc, pageId: string, opts: RasterOptions = {}): { svg: string; w: number; h: number } {
  const page = doc.pages.find((p) => p.id === pageId) || doc.pages[0]
  const list = page.order.map((id) => page.nodes[id]).filter(Boolean) as AnyNode[]
  const selected = opts.onlySelection ? new Set(expandNodeIds(page, opts.selection || [])) : null
  const visible = list.filter((n) => !inheritedFlag(n, page.nodes, 'hidden') && (!selected || selected.has(n.id)) && n.kind !== 'group')

  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  const bounds = contentBounds(visible, opts.padding ?? 40)
  x1 = bounds.x1; y1 = bounds.y1; x2 = x1 + bounds.w; y2 = y1 + bounds.h
  if (!visible.length) { x1 = 0; y1 = 0; x2 = 800; y2 = 600 }
  const pad = 0
  const w = x2 - x1 + pad * 2
  const h = y2 - y1 + pad * 2

  const body = visible.map((n) => nodeToSvg(n, { ...doc, activePageId: page.id })).join('\n')
  const nativeNodes=structuredClone(visible),ids=new Set(nativeNodes.map(n=>n.id))
  for(const n of nativeNodes){if(n.parent&&!ids.has(n.parent))n.parent=null;delete n.childPageId;for(const key of ['activationFor','activationStart','activationEnd'] as const)if(n[key]&&!ids.has(n[key]!))delete n[key];if(n.kind==='connector'){if(n.from&&!ids.has(n.from.nodeId))delete n.from;if(n.to&&!ids.has(n.to.nodeId))delete n.to;if(n.fragmentId&&!ids.has(n.fragmentId))delete n.fragmentId}}
  const nativePage={...page,nodes:Object.fromEntries(nativeNodes.map(n=>[n.id,n])),order:nativeNodes.map(n=>n.id),parentPageId:undefined,parentProcessId:undefined},models=Object.fromEntries(Object.entries(doc.models||{}).filter(([id])=>nativeNodes.some(n=>n.modelId===id)))
  const metadata=`<metadata id="bosai-native" data-version="2">${esc(JSON.stringify({...doc,version:2,pages:[nativePage],activePageId:page.id,models,dictionary:[]}))}</metadata>`
  const definitions = visible.map(n => {
    const shape = n as ShapeNode
    return (shape.gradient && shape.fill2 ? `<linearGradient id="grad_${esc(n.id)}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0" stop-color="${esc(shape.fill || '#fff')}"/><stop offset="1" stop-color="${esc(shape.fill2)}"/></linearGradient>` : '')
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="${x1 - pad} ${y1 - pad} ${w} ${h}">
<defs>${definitions}<filter id="shadow" x="-100%" y="-100%" width="300%" height="300%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-opacity=".28"/></filter></defs>
${opts.transparent ? '' : `<rect x="${x1 - pad}" y="${y1 - pad}" width="${w}" height="${h}" fill="${esc(opts.background || page.background)}"/>`}
${metadata}
${body}
</svg>`
  return { svg, w, h }
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function dashAttr(style?: string): string {
  if (style === 'dashed') return ' stroke-dasharray="8 6"'
  if (style === 'dotted') return ' stroke-dasharray="2 5"'
  return ''
}

function nodeToSvg(n: AnyNode, doc: Doc): string {
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2
  const rot = n.rot ? ` transform="rotate(${n.rot} ${cx} ${cy})"` : ''
  const op = n.opacity !== undefined && n.opacity < 1 ? ` opacity="${n.opacity}"` : ''

  if (n.kind === 'line' || n.kind === 'pencil' || n.kind === 'connector') {
    return lineToSvg(n as LineNode, doc, rot, op)
  }
  if (n.kind === 'image') {
    const im = n as AnyNode & { src: string; corner?: number }
    return `<image href="${esc(im.src)}" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" preserveAspectRatio="xMidYMid meet"${rot}${op}/>`
  }
  if (n.kind === 'table') {
    return tableToSvg(n as TableNode, rot, op)
  }
  if (n.kind === 'group') {
    return `<!-- group ${esc(n.id)} -->`
  }
  if (isProfessional(n)) return `<g${rot}${op}>${professionalSvg(n)}</g>`

  const s = n as ShapeNode
  const fill = s.gradient && s.fill2
    ? `url(#grad_${s.id})`
    : (s.fill || 'none')
  const stroke = s.stroke && s.stroke !== 'none' && (s.strokeWidth ?? 2) > 0
    ? ` stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth ?? 2}"${dashAttr(s.lineStyle)}` : ''
  const shadow = s.shadow ? ' filter="url(#shadow)"' : ''

  let shape = ''
  switch (s.kind) {
    case 'path':
      shape = `<path d="${pathData(s)}"/>`
      break
    case 'ellipse':
      shape = `<ellipse cx="${cx}" cy="${cy}" rx="${n.w / 2}" ry="${n.h / 2}"/>`
      break
    case 'roundRect':
      shape = `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${Math.min(s.radius ?? 10, Math.min(n.w, n.h) / 2)}"/>`
      break
    case 'cylinder': {
      const ry = Math.min(n.h * 0.18, 18)
      shape = `<path d="M${n.x} ${n.y + ry} L${n.x} ${n.y + n.h - ry} A${n.w / 2} ${ry} 0 0 0 ${n.x + n.w} ${n.y + n.h - ry} L${n.x + n.w} ${n.y + ry} Z"/>
<ellipse cx="${cx}" cy="${n.y + ry}" rx="${n.w / 2}" ry="${ry}" fill="${esc(s.fill2 || '#B7E7F0')}"${stroke}/>`
      break
    }
    case 'cloud':
    case 'star':
    case 'hexagon':
    case 'pentagon': {
      const poly = shapePoly(s.kind, n.w, n.h, s.radius ?? 10)
      const pts = poly.map((p) => `${(p.x + n.x).toFixed(1)},${(p.y + n.y).toFixed(1)}`).join(' ')
      shape = `<polygon points="${pts}"/>`
      break
    }
    case 'text': {
      const lines = String(s.text || '').split('\n')
      const fs = s.fontSize ?? 18
      const lh = fs * (s.lineHeight ?? 1.5)
      const startY = n.y + n.h / 2 - (lines.length - 1) * lh / 2 + fs * 0.35
      const tx = s.align === 'left' ? n.x : s.align === 'right' ? n.x + n.w : cx
      const anchor = s.align === 'left' ? 'start' : s.align === 'right' ? 'end' : 'middle'
      const tspans = lines.map((ln, i) => `<tspan x="${tx}" y="${startY + i * lh}">${esc(ln)}</tspan>`).join('')
      return `<g${rot}${op}>${textToSvg(s, n)}</g>`
    }
    default: {
      const poly = shapePoly(s.kind, n.w, n.h, s.radius ?? 10)
      const pts = poly.map((p) => `${(p.x + n.x).toFixed(1)},${(p.y + n.y).toFixed(1)}`).join(' ')
      shape = `<polygon points="${pts}"/>`
      break
    }
  }

  const textSvg = s.text ? textToSvg(s, n) : ''
  return `<g${rot}${op}>${shapeTag(shape, fill, stroke, shadow, '', '', s)}${textSvg}</g>`
}

function shapeTag(shape: string, fill: string, stroke: string, shadow: string, rot: string, op: string, s: ShapeNode): string {
  // 提取 <tag .../> 主体并注入属性
  const m = shape.match(/^<([a-zA-Z]+)([^>]*?)(\/?)>$/s)
  if (!m) return shape
  const [, tag, attrs, selfClose] = m
  return `<${tag}${attrs} fill="${esc(fill)}"${stroke}${shadow}${rot}${op}/>`
}

function padYOf(n: AnyNode): number {
  return Math.min(10, n.h * 0.1)
}

function textToSvg(s: ShapeNode, n: AnyNode): string {
  const lines = String(s.text || '').split('\n')
  const fs = s.fontSize ?? 14
  const lh = fs * (s.lineHeight ?? 1.5)
  const total = lines.length * lh
  const va = s.valign || 'middle'
  let y0 = n.y + n.h / 2 - total / 2 + lh / 2
  if (va === 'top') y0 = n.y + padYOf(n) + lh / 2
  if (va === 'bottom') y0 = n.y + n.h - padYOf(n) - total + lh / 2
  const padX = Math.min(12, n.w * 0.08)
  const padY = Math.min(10, n.h * 0.1)
  const tx = s.align === 'left' ? n.x + padX : s.align === 'right' ? n.x + n.w - padX : n.x + n.w / 2
  const anchor = s.align === 'left' ? 'start' : s.align === 'right' ? 'end' : 'middle'
  const weight = s.bold ? 600 : 400
  const style = s.italic ? 'italic' : 'normal'
  const deco = s.underline ? 'underline' : 'none'
  const tspans = lines.map((ln, i) =>
    `<tspan x="${tx}" y="${y0 + i * lh}">${esc(ln)}</tspan>`).join('')
  return `<text font-family="${esc(s.fontFamily || DEFAULT_FONT)}" font-size="${fs}" font-weight="${weight}" font-style="${style}" text-decoration="${deco}" fill="${esc(s.color || '#1a1c22')}" text-anchor="${anchor}" dominant-baseline="middle">${tspans}</text>`
}

function lineToSvg(n: LineNode, doc: Doc, rot: string, op: string): string {
  const getNode = (id: string) => {
    const page = doc.pages.find((p) => p.id === doc.activePageId)
    return page?.nodes[id]
  }
  const pts = n.kind === 'connector' ? computeConnectorPoints(n, getNode,Object.values(doc.pages.find(p=>p.id===doc.activePageId)?.nodes||{}))
    : (n.points || []).map((p) => ({ x: n.x + p.x, y: n.y + p.y }))
  if (pts.length < 2) return ''
  const d = connectorPath(n,pts)
  const stroke = n.stroke || '#2b3550'
  return `<g${rot}${op}><path d="${d}" fill="none" stroke="${esc(stroke)}" stroke-width="${n.strokeWidth ?? 2}" stroke-linecap="round" stroke-linejoin="round"${dashAttr(n.lineStyle)}/>${markersSvg(n,pts)}${labelsSvg(n,pts)}</g>`
}

function tableToSvg(t: TableNode, rot: string, op: string): string {
  const rows = t.rows, cols = t.cols
  const hh = rows === 1 ? t.h : rows > 0 ? Math.min(34, t.h * 0.22) : 0
  const rh = rows > 0 ? (t.h - hh) / Math.max(1, rows - 1) : 0
  const cw = t.w / cols
  let out = `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="${esc(t.fill || '#fff')}"/>`
  if (t.headerFill) out += `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${hh}" fill="${esc(t.headerFill)}"/>`
  let grid = `<path d="`
  for (let r = 0; r < rows; r++) {
    const yy = r === 0 ? t.y : t.y + hh + (r - 1) * rh
    grid += `M${t.x} ${yy} L${t.x + t.w} ${yy} `
  }
  grid += `M${t.x} ${t.y + t.h} L${t.x + t.w} ${t.y + t.h} `
  for (let c = 0; c <= cols; c++) {
    grid += `M${t.x + c * cw} ${t.y} L${t.x + c * cw} ${t.y + t.h} `
  }
  out += `${grid.trim()}" fill="none" stroke="${esc(t.stroke || '#8b93a3')}" stroke-width="${t.strokeWidth || 1}"/>`
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = t.data[r]?.[c]
      if (!cell?.text) continue
      const yy = r === 0 ? t.y + hh / 2 : t.y + hh + (r - 1) * rh + rh / 2
      out += `<text x="${t.x + c * cw + cw / 2}" y="${yy}" font-family="${esc(DEFAULT_FONT)}" font-size="${t.fontSize ?? 13}" font-weight="${cell.bold || r === 0 ? 600 : 400}" fill="${esc(r === 0 ? (t.headerColor || cell.color || '#1a1c22') : (cell.color || '#1a1c22'))}" text-anchor="middle" dominant-baseline="middle">${esc(cell.text)}</text>`
    }
  }
  return `<g${rot}${op}>${out}</g>`
}

/** 位图导出格式 */
export type RasterFormat = 'png' | 'jpg' | 'jpeg' | 'webp' | 'bmp'

export interface RasterOptions {
  /** 输出倍率，1 = 原始尺寸 */
  scale?: number
  /** 是否导出透明背景（仅 PNG / WebP 支持；JPEG 会自动按背景色合成） */
  transparent?: boolean
  /** 不透明时的底色，默认白色 */
  background?: string
  /** JPEG / WebP 质量 0~1 */
  quality?: number
  /** 留白边距（世界坐标），0 表示无留白 */
  padding?: number
  /** 只导出选中的元素 */
  onlySelection?: boolean
  selection?: string[]
}

/** 该格式是否支持透明通道 */
export function supportsTransparency(fmt: RasterFormat): boolean {
  return fmt === 'png' || fmt === 'webp'
}

/** 把颜色转成 rgba，便于在不透明导出时合成 */
function toRgba(color: string, alpha = 1): string {
  const c = String(color || '#ffffff').trim()
  if (c === 'transparent') return `rgba(255,255,255,0)`
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    const full = hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex
    if (full.length >= 6) {
      const num = parseInt(full.slice(0, 6), 16)
      const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255
      const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : alpha
      return `rgba(${r},${g},${b},${a})`
    }
  }
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
    if (parts.length >= 3) return `rgba(${parts[0]},${parts[1]},${parts[2]},${parts[3] ?? alpha})`
  }
  return c
}

/** 计算导出区域 */
function contentBounds(visible: AnyNode[], padding: number) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const n of visible) {
    if (n.kind === 'group') continue
    let rect = nodeRect(n)
    if(n.kind==='connector'||n.kind==='line'){
      const labels=lineLabels(n,(n.points||[]).map(p=>({x:n.x+p.x,y:n.y+p.y}))),fs=n.fontSize||13
      const boxes=labels.map(l=>{const width=[...l.text].reduce((sum,c)=>sum+(/[^\x00-\xff]/.test(c)?fs:fs*.65),0)+12;return {x:l.x-width/2,y:l.y-fs,w:width,h:fs*2}})
      rect=unionRect([{x:rect.x-28,y:rect.y-28,w:rect.w+56,h:rect.h+56},...boxes])
    }
    if (n.kind === 'path' && n.anchors?.length) {
      const points = n.anchors.flatMap(a => [a, ...(a.in ? [a.in] : []), ...(a.out ? [a.out] : [])])
      const b = unionRect(points.map(p => ({ x: n.x + p.x * n.w, y: n.y + p.y * n.h, w: 0, h: 0 })))
      rect = unionRect([rect, b])
    }
    const r = rotatedBounds(rect, n.rot)
    const extra = ((n as ShapeNode).strokeWidth ?? 0) / 2 + ((n as ShapeNode).shadow ? 20 : 0)
    x1 = Math.min(x1, r.x - extra); y1 = Math.min(y1, r.y - extra)
    x2 = Math.max(x2, r.x + r.w + extra); y2 = Math.max(y2, r.y + r.h + extra)
  }
  if (!Number.isFinite(x1)) return { x1: 0, y1: 0, w: 100, h: 100, pad: 0 }
  const pad = Math.max(0, padding)
  return {
    x1: x1 - pad, y1: y1 - pad,
    w: Math.max(1, Math.ceil(x2 - x1 + pad * 2)),
    h: Math.max(1, Math.ceil(y2 - y1 + pad * 2)),
    pad
  }
}

/**
 * 位图导出：支持 PNG / JPEG / WebP / BMP，可选透明背景。
 * JPEG 不支持 alpha，会自动合成到指定底色上。
 */
export async function exportPageImage(
  doc: Doc,
  pageId: string,
  format: RasterFormat = 'png',
  opts: RasterOptions = {}
): Promise<string> {
  const page = doc.pages.find((p) => p.id === pageId) || doc.pages[0]
  const scale = Math.max(0.1, opts.scale ?? 2)
  const canTransparent = supportsTransparency(format)
  const transparent = canTransparent && !!opts.transparent
  const background = opts.background || page.background || '#FFFFFF'
  const quality = Math.max(0.01, Math.min(1, opts.quality ?? 0.92))

  const map = page.nodes
  const sel = opts.onlySelection ? new Set(expandNodeIds(page, opts.selection || [])) : null
  const visible = (page.order.map((id) => map[id]).filter(Boolean) as AnyNode[])
    .filter((n) => n.kind !== 'group' && !inheritedFlag(n, map, 'hidden') && (!sel || sel.has(n.id)))
  if (!visible.length) return ''

  const b = contentBounds(visible, opts.padding ?? 40)

  // 预加载图片资源，避免导出时出现空白
  await Promise.all(visible.filter((n) => n.kind === 'image').map(async (n) => {
    const im = getImage((n as any).src)
    if (im && !im.complete) {
      await new Promise<void>((r) => { im.onload = () => r(); im.onerror = () => r() })
    }
  }))

  const cvs = document.createElement('canvas')
  const width=Math.max(1,Math.round(b.w*scale)), height=Math.max(1,Math.round(b.h*scale))
  if (!Number.isFinite(width*height) || width > 16384 || height > 16384 || width * height > 64_000_000) throw new Error('导出图片过大，请降低倍率或缩小范围')
  cvs.width=width; cvs.height=height
  const ctx = cvs.getContext('2d')!

  ctx.scale(scale, scale)
  // 底色：透明导出时留空（PNG/WebP），否则铺指定背景
  if (!transparent) {
    ctx.fillStyle = toRgba(background, 1)
    ctx.fillRect(0, 0, b.w, b.h)
  }
  ctx.translate(-b.x1, -b.y1)

  const { drawNode } = await import('./render')
  const rc = { ctx, cam: { x: 0, y: 0, zoom: 1 }, dpr: 1, interactive: false }
  for (const n of visible) drawNode(rc, n)

  // JPEG 不支持透明通道：把透明像素合成到背景色上，避免出现黑块
  if (format === 'jpg' || format === 'jpeg') {
    return flattenToJpeg(cvs, background, quality)
  }
  if (format === 'bmp') return encodeBmp(cvs)
  const mime = format === 'webp' ? 'image/webp' : 'image/png'
  return cvs.toDataURL(mime, quality)
}

/** 24-bit Windows BMP，包含真实 BM 文件头、行填充和自底向上的像素。 */
function encodeBmp(canvas: HTMLCanvasElement): string {
  const w = canvas.width, h = canvas.height
  const stride = Math.ceil(w * 3 / 4) * 4
  const bytes = new Uint8Array(54 + stride * h)
  const header = new DataView(bytes.buffer)
  bytes[0] = 66; bytes[1] = 77
  header.setUint32(2, bytes.length, true); header.setUint32(10, 54, true)
  header.setUint32(14, 40, true); header.setInt32(18, w, true); header.setInt32(22, h, true)
  header.setUint16(26, 1, true); header.setUint16(28, 24, true); header.setUint32(34, stride * h, true)
  const rgba = canvas.getContext('2d')!.getImageData(0, 0, w, h).data
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const source = (y * w + x) * 4, dest = 54 + (h - 1 - y) * stride + x * 3
    bytes[dest] = rgba[source + 2]; bytes[dest + 1] = rgba[source + 1]; bytes[dest + 2] = rgba[source]
  }
  let binary = ''
  for (let start = 0; start < bytes.length; start += 16384) binary += String.fromCharCode(...bytes.subarray(start, start + 16384))
  return 'data:image/bmp;base64,' + btoa(binary)
}

/** 将画布内容合成到纯色背景上并输出 JPEG */
function flattenToJpeg(src: HTMLCanvasElement, background: string, quality: number): string {
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = toRgba(background, 1)
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(src, 0, 0)
  return out.toDataURL('image/jpeg', quality)
}

/** 兼容旧调用：导出当前页为 PNG dataURL */
export async function exportPagePng(doc: Doc, pageId: string, scale = 2): Promise<string> {
  return exportPageImage(doc, pageId, 'png', { scale, transparent: false })
}

/** 估算导出文件的字节大小（用于导出面板预览） */
export function estimateDataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',')
  if (i < 0) return 0
  return Math.round((dataUrl.length - i - 1) * 0.75)
}
