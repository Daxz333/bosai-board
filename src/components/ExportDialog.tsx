import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../store/board'
import {
  exportPageImage, exportPageSvg, supportsTransparency,
  estimateDataUrlBytes, type RasterFormat
} from '../engine/export'

interface Props {
  onClose: () => void
}

const FORMATS: { id: RasterFormat; label: string; hint: string }[] = [
  { id: 'png', label: 'PNG', hint: '支持透明背景，画质无损' },
  { id: 'jpg', label: 'JPG', hint: '体积小，不支持透明' },
  { id: 'jpeg', label: 'JPEG', hint: '同 JPG，不支持透明' },
  { id: 'webp', label: 'WebP', hint: '支持透明，压缩率高' },
  { id: 'bmp', label: 'BMP', hint: '位图，不支持透明' }
]

const BACKGROUNDS = [
  { value: '#FFFFFF', label: '白色' },
  { value: '#000000', label: '黑色' },
  { value: '#F1F3F5', label: '浅灰' },
  { value: '#FFE066', label: '米黄' },
  { value: '#3B6FE0', label: '蓝色' }
]

const SCALES = [
  { value: 1, label: '1x 原始' },
  { value: 2, label: '2x 高清' },
  { value: 3, label: '3x 超清' },
  { value: 4, label: '4x 打印' }
]

export default function ExportDialog({ onClose }: Props) {
  const s = useStore()
  const [format, setFormat] = useState<RasterFormat>('png')
  const [transparent, setTransparent] = useState(true)
  const [background, setBackground] = useState('#FFFFFF')
  const [scale, setScale] = useState(2)
  const [quality, setQuality] = useState(0.92)
  const [padding, setPadding] = useState(40)
  const [range, setRange] = useState<'page' | 'selection' | 'all'>('page')
  const [exportPages, setExportPages] = useState<string[]>([s.doc.activePageId])
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewSize, setPreviewSize] = useState(0)
  const [status, setStatus] = useState<string>('')

  const canTransparent = supportsTransparency(format)
  const hasSelection = s.selection.length > 0
  const isVector = false

  /* 切到 JPG 等格式时自动关掉透明 */
  useEffect(() => {
    if (!canTransparent) setTransparent(false)
  }, [canTransparent])

  /* 实时生成预览：1x 比例，反映当前背景/留白设置 */
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const url = await exportPageImage(s.doc, s.doc.activePageId, format, {
          scale: 1, transparent, background, quality, padding,
          onlySelection: range === 'selection', selection: s.selection
        })
        if (cancelled) return
        setPreview(url)
        setPreviewSize(estimateDataUrlBytes(url))
      } catch (e) {
        if (!cancelled) setStatus('预览生成失败：' + (e as Error).message)
      }
    }, 220)
    return () => { cancelled = true; clearTimeout(t) }
  }, [format, transparent, background, quality, padding, range, s.doc, s.selection])

  const pageName = useMemo(() => {
    const p = s.doc.pages.find((x) => x.id === s.doc.activePageId)
    return p?.name || '页面'
  }, [s.doc])

  const runExport = async () => {
    setBusy(true)
    setStatus('正在生成…')
    try {
      const api = (window as any).boardAPI
      if (range === 'all' && s.doc.pages.length > 1) {
        // 逐页导出：文件名加页码后缀
        for (const pid of s.doc.pages.map((p) => p.id)) {
          const name = pageFileName(pid)
          const url = await exportPageImage(s.doc, pid, format, {
            scale, transparent, background, quality, padding,
            onlySelection: false
          })
          if (!url) continue
          await saveDataUrl(api, url, name)
        }
        setStatus(`已导出 ${s.doc.pages.length} 个页面`)
      } else {
        const url = await exportPageImage(s.doc, s.doc.activePageId, format, {
          scale, transparent, background, quality, padding,
          onlySelection: range === 'selection', selection: s.selection
        })
        if (!url) { setStatus('当前范围没有可导出的内容'); setBusy(false); return }
        const ok = await saveDataUrl(api, url, pageFileName(s.doc.activePageId))
        setStatus(ok === false ? '已取消导出' : `已导出：${ok}`)
      }
    } catch (e) {
      setStatus('导出失败：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pageFileName = (pid: string) => {
    const p = s.doc.pages.find((x) => x.id === pid)
    const multi = range === 'all' && s.doc.pages.length > 1
    const safe = (s.doc.title || '白板').replace(/[\\/:*?"<>|]/g, '_')
    const suffix = multi ? `_${p?.name || pid.slice(-4)}` : ''
    return `${safe}${suffix}.${format}`
  }

  const doExportSvg = async () => {
    setBusy(true)
    try {
      const api = (window as any).boardAPI
      const pageIds = range === 'all' ? s.doc.pages.map(p => p.id) : [s.doc.activePageId]
      let completed = 0
      for (const pageId of pageIds) {
        const { svg } = exportPageSvg(s.doc, pageId, { transparent, background, padding,
          onlySelection: range === 'selection', selection: s.selection })
        const page = s.doc.pages.find(p => p.id === pageId)!
        const title = `${s.doc.title || '白板'}${pageIds.length > 1 ? '_' + page.name : ''}`.replace(/[\\/:*?"<>|]/g, '_')
        const name = title + '.svg'
        if (api) {
          const r = await api.exportText({ defaultName: name, content: svg, ext: 'svg', name: 'SVG 矢量图' })
          if (!r?.ok) { setStatus(`已导出 ${completed} 页；后续导出取消或失败`); return }
        } else {
          const b = new Blob([svg], { type: 'image/svg+xml' })
          const a = document.createElement('a')
          const url = URL.createObjectURL(b)
          a.href = url; a.download = name; a.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
        completed++
      }
      setStatus(`已导出 ${completed} 页 SVG`)
    } catch (error) {
      setStatus('导出失败：' + (error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>导出图片</h3>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="export-body">
          {/* 左侧：预览 */}
          <div className="export-preview">
            <div className={`preview-stage ${transparent && canTransparent ? 'checker' : ''}`}
              style={!transparent || !canTransparent ? { background } : undefined}>
              {preview ? <img src={preview} alt="预览" /> : <div className="preview-empty">预览生成中…</div>}
            </div>
            <div className="preview-meta">
              {preview ? (
                <>
                  <span>{previewSize > 1024 * 1024
                    ? (previewSize / 1024 / 1024).toFixed(2) + ' MB'
                    : (previewSize / 1024).toFixed(0) + ' KB'}</span>
                  <span className="dot">·</span>
                  <span>预览为 1x，实际导出 {scale}x</span>
                </>
              ) : <span>—</span>}
            </div>
            {status && <div className="export-status">{status}</div>}
          </div>

          {/* 右侧：选项 */}
          <div className="export-options">
            <div className="opt-block">
              <div className="opt-title">文件格式</div>
              <div className="format-grid">
                {FORMATS.map((f) => (
                  <button key={f.id} className={`format-cell ${format === f.id ? 'active' : ''}`}
                    onClick={() => setFormat(f.id)} title={f.hint}>
                    <b>{f.label}</b>
                    <span>{supportsTransparency(f.id) ? '透明' : '不透明'}</span>
                  </button>
                ))}
                <button className={`format-cell ${isVector ? 'active' : ''}`}
                  onClick={doExportSvg} title="矢量图，可无限放大">
                  <b>SVG</b><span>矢量</span>
                </button>
              </div>
              <div className="opt-hint">
                {FORMATS.find((f) => f.id === format)?.hint}
              </div>
            </div>

            <div className="opt-block">
              <div className="opt-title">背景</div>
              <label className={`opt-check ${!canTransparent ? 'disabled' : ''}`}>
                <input type="checkbox" checked={transparent && canTransparent}
                  disabled={!canTransparent}
                  onChange={(e) => setTransparent(e.target.checked)} />
                <span>透明背景</span>
              </label>
              {!canTransparent && (
                <div className="opt-note">
                  {format.toUpperCase()} 格式不支持透明通道，导出时会填充下方底色。
                </div>
              )}
              <div className="bg-row">
                <span className="bg-label">底色</span>
                {BACKGROUNDS.map((b) => (
                  <button key={b.value} className={`bg-sw ${background === b.value && !transparent ? 'active' : ''}`}
                    style={{ background: b.value }} title={b.label}
                    onClick={() => { setBackground(b.value); if (transparent && canTransparent) setTransparent(false) }} />
                ))}
                <input type="color" className="bg-custom" value={background}
                  onChange={(e) => setBackground(e.target.value)} title="自定义颜色" />
              </div>
            </div>

            <div className="opt-block">
              <div className="opt-title">画质与尺寸</div>
              <div className="opt-row">
                <span className="opt-label">倍率</span>
                <div className="seg">
                  {SCALES.map((sc) => (
                    <button key={sc.value} className={scale === sc.value ? 'active' : ''}
                      onClick={() => setScale(sc.value)}>{sc.label}</button>
                  ))}
                </div>
              </div>
              {(format === 'jpg' || format === 'jpeg' || format === 'webp') && (
                <div className="opt-row">
                  <span className="opt-label">质量</span>
                  <input type="range" min={10} max={100} value={Math.round(quality * 100)}
                    onChange={(e) => setQuality(Number(e.target.value) / 100)} />
                  <span className="opt-val">{Math.round(quality * 100)}%</span>
                </div>
              )}
              <div className="opt-row">
                <span className="opt-label">留白</span>
                <input type="range" min={0} max={120} step={4} value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))} />
                <span className="opt-val">{padding}px</span>
              </div>
            </div>

            <div className="opt-block">
              <div className="opt-title">导出范围</div>
              <div className="seg wide">
                <button className={range === 'page' ? 'active' : ''} onClick={() => setRange('page')}>
                  当前页（{pageName}）
                </button>
                <button className={range === 'selection' ? 'active' : ''} disabled={!hasSelection}
                  onClick={() => setRange('selection')}>
                  选中（{s.selection.length}）
                </button>
                <button className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>
                  全部页面（{s.doc.pages.length}）
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <div className="foot-info">
            将导出为 <b>{format.toUpperCase()}</b>
            {transparent && canTransparent && <span className="tag-alpha">含 Alpha 透明通道</span>}
            {!canTransparent && <span className="tag-opaque">无透明（{format.toUpperCase()} 限制）</span>}
          </div>
          <div className="foot-actions">
            <button className="btn-ghost" onClick={onClose}>取消</button>
            <button className="btn-primary" disabled={busy} onClick={runExport}>
              {busy ? '导出中…' : '导出图片'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

async function saveDataUrl(api: any, dataUrl: string, fileName: string) {
  if (api) {
    const r = await api.exportImage({ defaultName: fileName, dataUrl })
    return r?.ok ? (r.path || fileName) : false
  }
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  a.click()
  return fileName
}
