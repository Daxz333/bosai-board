import { useStore } from '../store/board'
import type { ToolId } from '../types'

interface ToolDef { id: ToolId; label: string; icon: string; key: string }

const TOOLS: ToolDef[] = [
  { id: 'select', label: '选择', icon: 'cursor', key: 'V' },
  { id: 'node', label: '锚点编辑', icon: 'node', key: 'A' },
  { id: 'hand', label: '抓手 / 画布', icon: 'hand', key: 'H' },
  { id: 'shape', label: '形状', icon: 'shape', key: 'R' },
  { id: 'text', label: '文本', icon: 'text', key: 'T' },
  { id: 'connector', label: '连接线', icon: 'link', key: 'L' },
  { id: 'pen', label: '画笔', icon: 'pen', key: 'P' },
  { id: 'bezier', label: '钢笔路径', icon: 'bezier', key: 'B' },
  { id: 'eraser', label: '橡皮', icon: 'eraser', key: 'E' },
  { id: 'frame', label: '框架', icon: 'frame', key: 'F' }
]

export function ToolIcon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'cursor':
      return <svg {...common}><path d="M5 3l14 8-6 1.6L10.5 19z" /></svg>
    case 'hand':
      return <svg {...common}><path d="M8 12V5.5a1.5 1.5 0 013 0V11m0-1V4.5a1.5 1.5 0 013 0V11m0-.5V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7s-6-2.5-7-6l-1-3a1.6 1.6 0 012.9-1.2L8 13" /></svg>
    case 'shape':
      return <svg {...common}><rect x="3" y="3" width="9" height="9" rx="1.5" /><circle cx="16.5" cy="16.5" r="4.5" /></svg>
    case 'text':
      return <svg {...common}><path d="M5 6V4.5h14V6M12 4.5V20M9 20h6" /></svg>
    case 'link':
      return <svg {...common}><path d="M10 13a4 4 0 005.7.4l2.6-2.6a4 4 0 00-5.7-5.7l-1.5 1.5" /><path d="M14 11a4 4 0 00-5.7-.4l-2.6 2.6a4 4 0 005.7 5.7l1.5-1.5" /></svg>
    case 'pen':
      return <svg {...common}><path d="M15.5 4.5l4 4L8 20H4v-4z" /><path d="M13.5 6.5l4 4" /></svg>
    case 'bezier':
      return <svg {...common}><path d="M12 3l7 12-7 6-7-6zM12 3v10" /><circle cx="12" cy="15" r="2" /></svg>
    case 'node':
      return <svg {...common}><path d="M5 19C5 5 19 19 19 5M5 5v14M19 5v14" /><rect x="3" y="3" width="4" height="4" /><rect x="17" y="17" width="4" height="4" /></svg>
    case 'eraser':
      return <svg {...common}><path d="M8 20H20" /><path d="M15.5 4.5l4 4-8 8H7l-3-3z" /></svg>
    case 'frame':
      return <svg {...common}><path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3" /></svg>
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
    case 'minus':
      return <svg {...common}><path d="M5 12h14" /></svg>
    case 'fit':
      return <svg {...common}><path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4" /></svg>
    case 'play':
      return <svg {...common}><path d="M7 4.5l12 7.5-12 7.5z" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>
  }
}

export default function ToolBar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const zoomBy = useStore((s) => s.zoomBy)
  const fitView = useStore((s) => s.fitView)
  const zoomLabel = useStore((s) => s.zoomLabel)
  const presentation = useStore((s) => s.presentation)
  const setPresentation = useStore((s) => s.setPresentation)

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="绘图工具">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.key})`}
            aria-label={`${t.label} (${t.key})`}
            aria-pressed={tool === t.id}
          >
            <ToolIcon name={t.icon} />
            <span className="tool-tooltip">{t.label}<kbd>{t.key}</kbd></span>
          </button>
        ))}
        <div className="tool-sep" />
        <button className="tool-btn" onClick={() => setPresentation(!presentation)} title="演示模式 (F5)">
          <ToolIcon name="play" />
        </button>
      </div>
      <div className="zoombar">
        <button className="tool-btn sm" onClick={() => zoomBy(1 / 1.2)} title="缩小"><ToolIcon name="minus" /></button>
        <button className="zoom-label" onClick={() => useStore.getState().zoomTo(1)} title="重置为 100%">{zoomLabel}%</button>
        <button className="tool-btn sm" onClick={() => zoomBy(1.2)} title="放大"><ToolIcon name="plus" /></button>
        <button className="tool-btn fit-button" onClick={() => fitView()} title="适应画布 (Ctrl+1)"><ToolIcon name="fit" /><span>适应</span></button>
      </div>
    </>
  )
}
