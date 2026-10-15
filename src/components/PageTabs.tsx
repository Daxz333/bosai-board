import { useEffect, useRef } from 'react'
import { useStore } from '../store/board'

export default function PageTabs() {
  const s = useStore()
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => { active.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [s.doc.activePageId])
  return <nav className="page-strip" aria-label="白板页面">
    <span className="page-strip-label">页面 <b>{s.doc.pages.length}</b></span>
    <div className="page-strip-list">
      {s.doc.pages.map((p, i) => <button key={p.id} ref={p.id === s.doc.activePageId ? active : undefined}
        aria-current={p.id === s.doc.activePageId ? 'page' : undefined}
        className={p.id === s.doc.activePageId ? 'active' : ''} title={p.name}
        onClick={() => s.setActivePage(p.id)}><span>{String(i + 1).padStart(2, '0')}</span>{p.name}</button>)}
    </div>
    <button className="page-strip-add" onClick={() => s.addPage()} aria-label="新增空白页面" title="新增空白页面">＋</button>
  </nav>
}
