import type { AnyNode, LineNode, ShapeNode, TableNode, ImageNode, Camera } from '../types'
import { shapePoly, nodePoly, type Poly } from './shapes'
import { DEFAULT_FONT } from '../types'
import { pathData } from './paths'
import { drawProfessional, drawMarker, effectiveMarkers, lineLabels, connectorPath } from './engineering-visual'

export interface RenderCtx {
  ctx: CanvasRenderingContext2D
  cam: Camera
  dpr: number
  /** 仅绘制选中态（导出时关闭） */
  interactive: boolean
}

export function applyCam(ctx: CanvasRenderingContext2D, cam: Camera) {
  // 保留绘制阶段设置的 DPR 变换，避免高分屏错位和模糊。
  ctx.translate(cam.x, cam.y)
  ctx.scale(cam.zoom, cam.zoom)
}

export function toScreen(cam: Camera, x: number, y: number) {
  return { x: x * cam.zoom + cam.x, y: y * cam.zoom + cam.y }
}
export function toWorld(cam: Camera, x: number, y: number) {
  return { x: (x - cam.x) / cam.zoom, y: (y - cam.y) / cam.zoom }
}

function setLineDash(ctx: CanvasRenderingContext2D, style?: string) {
  if (style === 'dashed') ctx.setLineDash([8, 6])
  else if (style === 'dotted') ctx.setLineDash([2, 5])
  else ctx.setLineDash([])
}

function tracePoly(ctx: CanvasRenderingContext2D, poly: Poly) {
  if (!poly.length) return
  ctx.beginPath()
  ctx.moveTo(poly[0].x, poly[0].y)
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y)
  ctx.closePath()
}

function paintFill(ctx: CanvasRenderingContext2D, n: ShapeNode, poly: Poly, x: number, y: number, w: number, h: number) {
  const fill = n.fill || 'transparent'
  if (n.gradient && n.fill2) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h)
    g.addColorStop(0, n.fill || '#4C8DFF')
    g.addColorStop(1, n.fill2)
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = fill
  }
  if (n.kind === 'sticky') {
    // 便签底部折角阴影
    const f = Math.min(18, Math.min(w, h) * 0.2)
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w - f, y)
    ctx.lineTo(x + w, y + f)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    ctx.beginPath()
    ctx.moveTo(x + w - f, y)
    ctx.lineTo(x + w, y + f)
    ctx.lineTo(x + w - f, y + f)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    return
  }
  ctx.fill()
  if (n.kind === 'cylinder') {
    // 圆柱顶盖
    const ry = Math.min(h * 0.18, 18)
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = n.fill2 || shade(n.fill || '#8EA9FF', 0.22)
    ctx.fill()
    ctx.strokeStyle = n.stroke || '#2b3550'
    ctx.lineWidth = n.strokeWidth || 2
    setLineDash(ctx, n.lineStyle)
    ctx.stroke()
  }
}

export function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '')
  if (c.length < 6) return hex
  const num = parseInt(c, 16)
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255
  r = Math.round(Math.max(0, Math.min(255, r + 255 * amt)))
  g = Math.round(Math.max(0, Math.min(255, g + 255 * amt)))
  b = Math.round(Math.max(0, Math.min(255, b + 255 * amt)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function drawNode(rc: RenderCtx, n: AnyNode) {
  const { ctx } = rc
  ctx.save()
  if (n.opacity !== undefined && n.opacity < 1) ctx.globalAlpha = n.opacity

  if (n.kind === 'line' || n.kind === 'pencil' || n.kind === 'connector') {
    drawLine(rc, n as LineNode)
    ctx.restore()
    return
  }

  const cx = n.x + n.w / 2, cy = n.y + n.h / 2
  if (n.rot) {
    ctx.translate(cx, cy)
    ctx.rotate((n.rot * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }

  if (n.kind === 'image') { drawImage(rc, n as ImageNode); ctx.restore(); return }
  if (n.kind === 'table') { drawTable(rc, n as TableNode); ctx.restore(); return }
  if (n.kind === 'path') {
    const path = new Path2D(pathData(n))
    if (n.gradient && n.fill2) {
      const gradient = ctx.createLinearGradient(n.x, n.y, n.x + n.w, n.y + n.h)
      gradient.addColorStop(0, n.fill || '#fff'); gradient.addColorStop(1, n.fill2)
      ctx.fillStyle = gradient
    } else ctx.fillStyle = n.fill || 'transparent'
    ctx.shadowColor = n.shadow ? 'rgba(0,0,0,.28)' : 'transparent'
    ctx.shadowBlur = n.shadow ? 14 : 0; ctx.shadowOffsetY = n.shadow ? 5 : 0
    if (n.closed) ctx.fill(path)
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    if (n.stroke && n.stroke !== 'none' && (n.strokeWidth ?? 2) > 0) {
      ctx.strokeStyle = n.stroke; ctx.lineWidth = n.strokeWidth ?? 2
      setLineDash(ctx, n.lineStyle); ctx.stroke(path)
    }
    if (n.text) drawText(rc, n, n.x, n.y, n.w, n.h)
    ctx.restore(); return
  }
  if (n.kind === 'group') { ctx.restore(); return }
  if (drawProfessional(ctx,n)) { ctx.restore(); return }

  const s = n as ShapeNode
  const poly = shapePoly(s.kind as any, n.w, n.h, s.radius ?? 8)
  const localPoly = poly.map((p) => ({ x: p.x + n.x, y: p.y + n.y }))

  ctx.save()
  ctx.shadowColor = s.shadow ? 'rgba(0,0,0,0.28)' : 'transparent'
  ctx.shadowBlur = s.shadow ? 14 : 0
  ctx.shadowOffsetY = s.shadow ? 5 : 0
  tracePoly(ctx, localPoly)
  paintFill(ctx, s, localPoly, n.x, n.y, n.w, n.h)
  ctx.restore()

  if (n.kind === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(n.x + n.w / 2, n.y + n.h / 2, n.w / 2, n.h / 2, 0, 0, Math.PI * 2)
  } else {
    tracePoly(ctx, localPoly)
  }
  if (s.stroke && s.stroke !== 'none' && (s.strokeWidth ?? 2) > 0) {
    ctx.strokeStyle = s.stroke
    ctx.lineWidth = s.strokeWidth ?? 2
    setLineDash(ctx, s.lineStyle)
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
  setLineDash(ctx)

  if (s.text) drawText(rc, s, n.x, n.y, n.w, n.h)
  ctx.restore()
}

function drawText(rc: RenderCtx, s: ShapeNode, x: number, y: number, w: number, h: number) {
  const { ctx } = rc
  const fs = s.fontSize ?? 14
  const lh = s.lineHeight ?? 1.5
  const ls = s.letterSpacing ?? 0
  const font = `${s.italic ? 'italic ' : ''}${s.bold ? '600' : '400'} ${fs}px ${s.fontFamily || DEFAULT_FONT}`
  ctx.font = font
  ctx.fillStyle = s.color || '#1a1c22'
  ctx.textBaseline = 'middle'
  ctx.textAlign = s.align || 'center'
  if (ls) (ctx as any).letterSpacing = `${ls}px`

  const padX = Math.min(12, w * 0.08)
  const padY = Math.min(10, h * 0.1)
  const boxW = w - padX * 2
  const lines: string[] = []
  for (const para of String(s.text).split('\n')) {
    if (!para) { lines.push(''); continue }
    let cur = ''
    for (const ch of para) {
      const test = cur + ch
      if (ctx.measureText(test).width > boxW && cur) { lines.push(cur); cur = ch }
      else cur = test
    }
    lines.push(cur)
  }
  // lh 是行高倍数，需换算成像素行距
  const linePx = fs * lh
  const totalH = lines.length * linePx
  const va = s.valign || 'middle'
  let startY = y + h / 2 - totalH / 2 + linePx / 2
  if (va === 'top') startY = y + padY + linePx / 2
  if (va === 'bottom') startY = y + h - padY - totalH + linePx / 2

  for (const line of lines) {
    const tx = s.align === 'left' ? x + padX : s.align === 'right' ? x + w - padX : x + w / 2
    ctx.fillText(line, tx, startY)
    if (s.underline) {
      const tw = ctx.measureText(line).width
      const lx = s.align === 'left' ? tx : s.align === 'right' ? tx - tw : tx - tw / 2
      ctx.fillRect(lx, startY + fs * 0.55, tw, Math.max(1, fs / 16))
    }
    startY += linePx
  }
  if (ls) (ctx as any).letterSpacing = '0px'
}

const imgCache = new Map<string, HTMLImageElement>()
export function getImage(src: string): HTMLImageElement | null {
  if (imgCache.has(src)) return imgCache.get(src)!
  const img = new Image()
  img.onload = () => { /* 触发重绘由调用方处理 */ }
  img.src = src
  imgCache.set(src, img)
  return img
}

function drawImage(rc: RenderCtx, n: ImageNode) {
  const { ctx } = rc
  const img = getImage(n.src)
  ctx.save()
  const r = n.corner ?? 4
  if (r > 0) {
    ctx.beginPath()
    roundRectPath(ctx, n.x, n.y, n.w, n.h, r)
    ctx.clip()
  }
  if (img && img.complete && img.naturalWidth) {
    const ratio = Math.min(n.w / img.naturalWidth, n.h / img.naturalHeight)
    const dw = img.naturalWidth * ratio, dh = img.naturalHeight * ratio
    ctx.drawImage(img, n.x + (n.w - dw) / 2, n.y + (n.h - dh) / 2, dw, dh)
  } else {
    ctx.fillStyle = '#3a3f4b'
    ctx.fillRect(n.x, n.y, n.w, n.h)
    ctx.fillStyle = '#9aa3b2'
    ctx.font = `12px ${DEFAULT_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('图片加载中…', n.x + n.w / 2, n.y + n.h / 2)
  }
  ctx.restore()
  if (r > 0) {
    ctx.beginPath()
    roundRectPath(ctx, n.x, n.y, n.w, n.h, r)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function drawTable(rc: RenderCtx, t: TableNode) {
  const { ctx } = rc
  const rows = t.rows, cols = t.cols
  const hh = rows === 1 ? t.h : rows > 0 ? Math.min(34, t.h * 0.22) : 0
  const bodyH = t.h - hh
  const cw = t.w / cols
  const rh = rows > 0 ? bodyH / Math.max(1, rows - 1) : 0
  ctx.save()
  ctx.fillStyle = t.fill || '#ffffff'
  ctx.fillRect(t.x, t.y, t.w, t.h)
  if (t.headerFill) {
    ctx.fillStyle = t.headerFill
    ctx.fillRect(t.x, t.y, t.w, hh)
  }
  ctx.strokeStyle = t.stroke || '#8b93a3'
  ctx.lineWidth = t.strokeWidth || 1
  ctx.beginPath()
  for (let r = 0; r < rows; r++) {
    const yy = r === 0 ? t.y : t.y + hh + (r - 1) * rh
    ctx.moveTo(t.x, yy); ctx.lineTo(t.x + t.w, yy)
  }
  ctx.moveTo(t.x, t.y + t.h); ctx.lineTo(t.x + t.w, t.y + t.h)
  for (let c = 0; c <= cols; c++) {
    const xx = t.x + c * cw
    ctx.moveTo(xx, t.y); ctx.lineTo(xx, t.y + t.h)
  }
  ctx.stroke()

  ctx.textBaseline = 'middle'
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = t.data[r]?.[c]
      if (!cell) continue
      ctx.fillStyle = r === 0 ? (t.headerColor || cell.color || '#1a1c22') : (cell.color || '#1a1c22')
      ctx.font = `${cell.bold || r === 0 ? '600' : '400'} ${t.fontSize ?? 13}px ${DEFAULT_FONT}`
      ctx.textAlign = 'center'
      const yy = r === 0 ? t.y + hh / 2 : t.y + hh + (r - 1) * rh + rh / 2
      ctx.fillText(cell.text || '', t.x + c * cw + cw / 2, yy, cw - 8)
    }
  }
  ctx.restore()
}

export function drawLine(rc: RenderCtx, n: LineNode) {
  const { ctx } = rc
  const pts = n.points && n.points.length ? n.points.map((p) => ({ x: n.x + p.x, y: n.y + p.y })) : []
  ctx.save()
  ctx.strokeStyle = n.stroke || '#2b3550'
  ctx.lineWidth = n.strokeWidth || 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  setLineDash(ctx, n.lineStyle)

  let drawPts = pts
  if (n.kind === 'pencil' && n.pressure && pts.length === n.pressure.length && pts.length > 1) {
    // 变宽笔迹
    ctx.beginPath()
    const left: { x: number; y: number }[] = []
    const right: { x: number; y: number }[] = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const prev = pts[Math.max(0, i - 1)]
      const next = pts[Math.min(pts.length - 1, i + 1)]
      const ang = Math.atan2(next.y - prev.y, next.x - prev.x) + Math.PI / 2
      const pr = n.pressure[i] / 2
      left.push({ x: p.x + Math.cos(ang) * pr, y: p.y + Math.sin(ang) * pr })
      right.push({ x: p.x - Math.cos(ang) * pr, y: p.y - Math.sin(ang) * pr })
    }
    ctx.moveTo(left[0].x, left[0].y)
    for (const p of left) ctx.lineTo(p.x, p.y)
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
    ctx.closePath()
    ctx.fillStyle = n.stroke || '#1a1c22'
    ctx.fill()
  } else {
    if (drawPts.length < 2) {
      if (drawPts.length === 1) {
        ctx.beginPath()
        ctx.arc(drawPts[0].x, drawPts[0].y, (n.strokeWidth || 2) / 2, 0, Math.PI * 2)
        ctx.fillStyle = n.stroke || '#1a1c22'
        ctx.fill()
      }
      ctx.restore()
      return
    }
    ctx.beginPath()
    if (n.kind === 'connector' && n.route === 'curve') {
      const mid = drawPts[Math.floor(drawPts.length / 2)]
      ctx.moveTo(drawPts[0].x, drawPts[0].y)
      ctx.quadraticCurveTo(mid.x, mid.y, drawPts[drawPts.length - 1].x, drawPts[drawPts.length - 1].y)
    } else {
      ctx.moveTo(drawPts[0].x, drawPts[0].y)
      for (let i = 1; i < drawPts.length; i++) {
        if (n.kind === 'connector' && n.route === 'curve' && i === drawPts.length - 1) {
          const prev = drawPts[i - 1]
          ctx.quadraticCurveTo(prev.x, prev.y, drawPts[i].x, drawPts[i].y)
        } else ctx.lineTo(drawPts[i].x, drawPts[i].y)
      }
    }
    if(n.jumpLines&&n.jumpPoints?.length)ctx.stroke(new Path2D(connectorPath(n,drawPts)))
    else ctx.stroke()

    const [start,end]=effectiveMarkers(n)
    drawMarker(ctx,end,drawPts[drawPts.length-2],drawPts[drawPts.length-1],n.stroke||'#2b3550',n.strokeWidth||2)
    drawMarker(ctx,start,drawPts[1],drawPts[0],n.stroke||'#2b3550',n.strokeWidth||2)
  }
  setLineDash(ctx)
  for (const label of lineLabels(n,drawPts)) {
    ctx.font = `${n.fontSize || 13}px ${n.fontFamily || DEFAULT_FONT}`
    const width = ctx.measureText(label.text).width,fs=n.fontSize||13
    ctx.fillStyle = '#fff'; ctx.fillRect(label.x - width / 2 - 5, label.y - fs*.8, width + 10, fs*1.6)
    ctx.fillStyle = n.color || n.stroke || '#212529'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label.text, label.x, label.y)
  }
  ctx.restore()
}

function drawArrowHead(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, color: string, lw: number) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const size = Math.max(7, Math.min(13, lw * 3))
  const back = size * 0.82
  ctx.save()
  ctx.setLineDash([])
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - Math.cos(ang - 0.4) * back, b.y - Math.sin(ang - 0.4) * back)
  ctx.lineTo(b.x - Math.cos(ang) * size * 0.55, b.y - Math.sin(ang) * size * 0.55)
  ctx.lineTo(b.x - Math.cos(ang + 0.4) * back, b.y - Math.sin(ang + 0.4) * back)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

/** 计算连线世界坐标点集（考虑绑定的端点节点） */
export function connectorPoints(
  n: LineNode,
  getNode: (id: string) => AnyNode | undefined
): { x: number; y: number }[] {
  if (n.points && n.points.length) {
    return n.points.map((p) => ({ x: n.x + p.x, y: n.y + p.y }))
  }
  const fallback: { x: number; y: number }[] = [
    { x: n.x, y: n.y }, { x: n.x + n.w, y: n.y + n.h }
  ]
  return fallback
}
