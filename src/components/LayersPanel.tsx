import { useState } from 'react'
import { useStore, reflowConnector } from '../store/board'
import type { AnyNode, LineNode } from '../types'

export default function LayersPanel({ mode = 'layers' }: { mode?: 'layers' | 'pages' }) {
  const s = useStore()
  const page = s.page()
  const [renaming, setRenaming] = useState<string | null>(null)

  const list = [...page.order].reverse().map((id) => page.nodes[id]).filter(Boolean) as AnyNode[]

  const toggleHidden = (id: string) => {
    s.updateNode(id, { hidden: !page.nodes[id].hidden }, '显示/隐藏')
  }
  const toggleLock = (id: string) => {
    s.updateNode(id, { locked: !page.nodes[id].locked }, '锁定/解锁')
  }
  const remove = (id: string) => s.removeNodes([id])

  return (
    <div className="layers-panel">
      {mode === 'layers' ? (
        <div className="layer-list">
          {list.length === 0 && <div className="empty-hint sm">画布还是空的<br /><span>选择形状后点击画布，或双击形状直接添加</span></div>}
          {list.map((n) => (
            <div
              key={n.id}
              className={`layer-item ${s.selection.includes(n.id) ? 'active' : ''} ${n.hidden ? 'hidden-layer' : ''}`}
              onClick={(e) => s.select([n.id], e.shiftKey)}
              onDoubleClick={() => { if (!n.locked && n.kind !== 'table') s.setEditing(n.id) }}
            >
              <span className="layer-ico">{kindIcon(n.kind as string)}</span>
              <span className="layer-name" onDoubleClick={(e) => { e.stopPropagation(); setRenaming(n.id) }}>
                {renaming === n.id ? (
                  <input
                    autoFocus
                    defaultValue={n.name || kindLabel(n)}
                    onBlur={(e) => { s.updateNode(n.id, { name: e.target.value }, '重命名对象'); setRenaming(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (n.name || (n as any).text?.slice(0, 12) || kindLabel(n))}
              </span>
              <button className="layer-act" title={n.hidden ? '显示' : '隐藏'} onClick={(e) => { e.stopPropagation(); toggleHidden(n.id) }}>
                {n.hidden ? '◌' : '◉'}
              </button>
              <button className="layer-act" title={n.locked ? '解锁' : '锁定'} onClick={(e) => { e.stopPropagation(); toggleLock(n.id) }}>
                {n.locked ? '🔒' : '🔓'}
              </button>
              <button className="layer-act danger" title="删除" onClick={(e) => { e.stopPropagation(); remove(n.id) }}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="page-list">
          {s.doc.pages.map((p, i) => (
            <div
              key={p.id}
              className={`page-item ${p.id === s.doc.activePageId ? 'active' : ''}`}
              onClick={() => s.setActivePage(p.id)}
            >
              <span className="page-idx">{i + 1}</span>
              <span className="page-name" onDoubleClick={() => setRenaming(p.id)}>
                {renaming === p.id ? <input autoFocus defaultValue={p.name} aria-label="页面名称"
                  onClick={e => e.stopPropagation()} onBlur={e => { s.renamePage(p.id, e.target.value.trim() || p.name); setRenaming(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }} /> : p.name}
              </span>
              <button className="layer-act" disabled={i === 0} title="页面前移" onClick={e => { e.stopPropagation(); s.movePage(p.id, -1) }}>↑</button>
              <button className="layer-act" disabled={i === s.doc.pages.length - 1} title="页面后移" onClick={e => { e.stopPropagation(); s.movePage(p.id, 1) }}>↓</button>
              <span className="page-count">{p.order.length} 元素</span>
              {s.doc.pages.length > 1 && (
                <button className="layer-act danger" onClick={(e) => { e.stopPropagation(); s.removePage(p.id) }}>✕</button>
              )}
            </div>
          ))}
          <button className="add-page" onClick={() => s.addPage()}>+ 新增页面</button>
          <div className="page-tools">
            <button className="wide-btn" onClick={() => s.fitView()}>适应内容</button>
          </div>
        </div>
      )}
    </div>
  )
}

function kindLabel(n: AnyNode): string {
  const map: Record<string, string> = {
    rect: '矩形', roundRect: '圆角矩形', ellipse: '椭圆', triangle: '三角形', diamond: '菱形',
    pentagon: '五边形', hexagon: '六边形', star: '五角星', cylinder: '数据库', cloud: '云形状',
    arrow: '箭头块', chevron: '流程箭头', parallelogram: '平行四边形', trapezoid: '梯形',
    document: '文档', sticky: '便签', text: '文本', table: '表格', image: '图片',
    line: '直线', pencil: '画笔', connector: '连接线', group: '组合', frame: '框架'
  }
  return map[n.kind] || n.kind
}

function kindIcon(kind: string): string {
  const map: Record<string, string> = {
    rect: '▭', roundRect: '▢', ellipse: '◯', triangle: '△', diamond: '◇', pentagon: '⬠',
    hexagon: '⬡', star: '★', cylinder: '▤', cloud: '☁', arrow: '➜', chevron: '»',
    parallelogram: '▱', trapezoid: '▽', document: '▥', sticky: '📝', text: 'T',
    table: '▦', image: '🖼', line: '╱', pencil: '✎', connector: '⇢', group: '⊞', frame: '▣'
  }
  return map[kind] || '▭'
}
