import { useStore } from '../store/board'
import { SHAPE_LIBRARY, SHAPE_GROUPS, type ShapeMeta } from '../engine/library'
import { ToolIcon } from './ToolBar'
import type { ShapeKind } from '../types'
import { useState } from 'react'
import { RELATIONS, isProfessional, symbolDefinition } from '../engine/engineering'
import { professionalSvg } from '../engine/engineering-visual'
import { makeShape, makeTable } from '../engine/factory'
import LocalSymbolLibrary from './LocalSymbolLibrary'

function ShapeThumb({ kind }: { kind: ShapeKind }) {
  if(isProfessional(kind)){const m=symbolDefinition(kind)!,n=makeShape(kind as any,0,0,m.w,m.h,1);return <svg className="professional-thumb" width="38" height="34" viewBox={`-4 -4 ${m.w+8} ${m.h+8}`} dangerouslySetInnerHTML={{__html:professionalSvg(n)}}/>}
  const common = { width: 30, height: 30, viewBox: '0 0 30 30' }
  const stroke = '#8fa0c0'
  const fill = 'rgba(91,140,255,0.16)'
  const p = (d: string, f = fill) => <path d={d} fill={f} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
  switch (kind) {
    case 'rect': return <svg {...common}><rect x="3" y="7" width="24" height="16" rx="1.5" fill={fill} stroke={stroke} strokeWidth={1.4} /></svg>
    case 'roundRect': return <svg {...common}><rect x="3" y="7" width="24" height="16" rx="5" fill={fill} stroke={stroke} strokeWidth={1.4} /></svg>
    case 'ellipse': return <svg {...common}><ellipse cx="15" cy="15" rx="12" ry="8" fill={fill} stroke={stroke} strokeWidth={1.4} /></svg>
    case 'triangle': return <svg {...common}>{p('M15 6 L26 24 L4 24 Z')}</svg>
    case 'diamond': return <svg {...common}>{p('M15 5 L26 15 L15 25 L4 15 Z')}</svg>
    case 'pentagon': return <svg {...common}>{p('M15 5 L25 12 L21 24 L9 24 L5 12 Z')}</svg>
    case 'hexagon': return <svg {...common}>{p('M9 6 L21 6 L26 15 L21 24 L9 24 L4 15 Z')}</svg>
    case 'star': return <svg {...common}>{p('M15 4 L18 12 L26 12.5 L20 18 L22 26 L15 21.5 L8 26 L10 18 L4 12.5 L12 12 Z')}</svg>
    case 'cylinder': return <svg {...common}><path d="M4 9a11 4 0 0122 0v12a11 4 0 01-22 0z" fill={fill} stroke={stroke} strokeWidth={1.4} /><ellipse cx="15" cy="9" rx="11" ry="4" fill="rgba(91,140,255,0.3)" stroke={stroke} strokeWidth={1.4} /></svg>
    case 'cloud': return <svg {...common}>{p('M8 21a5 5 0 01-1-9.9A6.5 6.5 0 0119 8.6 4.7 4.7 0 0122 18a4 4 0 01-3.9 4z')}</svg>
    case 'arrow': return <svg {...common}>{p('M3 10h13V6l11 9-11 9v-4H3z')}</svg>
    case 'chevron': return <svg {...common}>{p('M4 7h13V4l9 11-9 11v-3H4z')}</svg>
    case 'parallelogram': return <svg {...common}>{p('M8 8h19l-5 14H3z')}</svg>
    case 'trapezoid': return <svg {...common}>{p('M9 8h12l6 14H3z')}</svg>
    case 'document': return <svg {...common}>{p('M7 5h16v17l-4 4H7z')}<path d="M19 26v-4h4" fill="none" stroke={stroke} strokeWidth={1.2} /></svg>
    case 'sticky': return <svg {...common}><path d="M5 6h20v13l-5 5H5z" fill="#FFE066" stroke="#c9a227" strokeWidth={1.3} /><path d="M20 24v-5h5" fill="#F0D24A" stroke="#c9a227" strokeWidth={1.2} /></svg>
    case 'table': return <svg {...common}><rect x="3" y="6" width="24" height="18" rx="1" fill={fill} stroke={stroke} strokeWidth={1.4} /><path d="M3 12h24M11 6v18M19 6v18" stroke={stroke} strokeWidth={1.1} /></svg>
    case 'image': return <svg {...common}><rect x="3" y="6" width="24" height="18" rx="2" fill={fill} stroke={stroke} strokeWidth={1.4} /><circle cx="10" cy="12" r="2" fill={stroke} /><path d="M5 22l7-8 5 5 3-3 5 6z" fill="rgba(91,140,255,0.4)" stroke={stroke} strokeWidth={1.1} /></svg>
    case 'text': return <svg {...common}><path d="M6 8V6h18v2M15 6v18M11 24h8" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" /></svg>
    default: return <svg {...common}><rect x="5" y="8" width="20" height="14" fill={fill} stroke={stroke} strokeWidth={1.4} /></svg>
  }
}

export default function ShapePanel() {
  const setCurrentShape = useStore((s) => s.setCurrentShape)
  const currentShape = useStore((s) => s.currentShape)
  const tool = useStore((s) => s.tool)
  const s=useStore(),type=s.page().diagramType||'free'
  const [search,setSearch]=useState(''),[all,setAll]=useState(false),[onlyFavorites,setOnlyFavorites]=useState(false)
  const [favorites,setFavorites]=useState<string[]>(()=>{try {const v=JSON.parse(localStorage.getItem('bosai:symbol-favorites')||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[]}catch{return []}})
  const toggleFavorite=(kind:string)=>{const next=favorites.includes(kind)?favorites.filter(k=>k!==kind):[...favorites,kind];setFavorites(next);try{localStorage.setItem('bosai:symbol-favorites',JSON.stringify(next))}catch{}}
  const query = search.trim().toLowerCase()
  const matches = SHAPE_LIBRARY.filter(m => (query || all || type === 'free' || m.group === type || ['basic', 'note'].includes(m.group) || ['state', 'bpmn', 'interaction'].includes(type) && m.group === 'activity' || type === 'communication' && m.group === 'object') && (!onlyFavorites || favorites.includes(m.kind)) && `${m.label} ${m.description || ''}`.toLowerCase().includes(query))
  const groups = [...SHAPE_GROUPS].sort((a, b) => Number(b.key === type) - Number(a.key === type))
  const insertAtCenter = (m: ShapeMeta) => {
    if (m.kind === 'image') return // Image placement opens the file picker on the canvas.
    const st = useStore.getState(), host = document.querySelector('.canvas-host') as HTMLElement | null
    if (!host) return
    const x = (host.clientWidth / 2 - st.camera.x) / st.camera.zoom - m.w / 2
    const y = (host.clientHeight / 2 - st.camera.y) / st.camera.zoom - m.h / 2
    const node = m.kind === 'table' ? makeTable(x, y, st.maxZ() + 1) : makeShape(m.kind as any, x, y, m.w, m.h, st.maxZ() + 1)
    const id = st.addNode(node, '添加' + m.label)
    st.setTool('select'); st.select([id])
    if (st.camera.zoom < .3) st.zoomToSelection()
  }

  return (
    <div className="shape-panel">
      <div className="shape-search"><div className="panel-title">形状库 <span>{matches.length} 个</span></div><input aria-label="搜索专业符号" placeholder="搜索全部形状…" value={search} onChange={e=>setSearch(e.target.value)}/><div className="member-row"><button className={!all?'active':''} aria-pressed={!all} onClick={()=>setAll(false)}>当前图</button><button className={all?'active':''} aria-pressed={all} onClick={()=>setAll(true)}>全部</button><button className={onlyFavorites?'active':''} aria-pressed={onlyFavorites} onClick={()=>setOnlyFavorites(!onlyFavorites)}>★ 收藏</button></div><p className="shape-instruction">单击后在画布放置 · 双击直接添加</p></div>
      {!matches.length && <div className="search-empty"><strong>{onlyFavorites ? '暂无匹配的收藏' : '没有找到形状'}</strong><span>试试其他名称，或清除筛选。</span><button onClick={() => { setSearch(''); setOnlyFavorites(false) }}>清除筛选</button></div>}
      {groups.map((g) => {
        const list = matches.filter(m => m.group === g.key)
        if (!list.length) return null
        return (
          <div key={g.key} className="shape-group">
            <div className="group-label">{g.label}</div>
            <div className="shape-grid">
              {list.map((m, i) => (
                <div className="shape-item" key={`${m.kind}-${i}`}><button
                  key={`${m.kind}-${i}`}
                  className={`shape-cell ${tool === 'shape' && currentShape === m.kind ? 'active' : ''}`}
                  onClick={() => setCurrentShape(m.kind)}
                  onDoubleClick={() => insertAtCenter(m)}
                  title={`${m.label}\n${m.description || ''}\n${m.kind === 'image' ? '点击后在画布上选择位置并导入图片' : '单击后在画布放置；双击添加到画布中央'}`}
                >
                  <ShapeThumb kind={m.kind} />
                  <span>{m.label}</span>
                </button><button className={`favorite-symbol ${favorites.includes(m.kind)?'saved':''}`} aria-label={`收藏${m.label}`} onClick={()=>toggleFavorite(m.kind)}>★</button></div>
              ))}
            </div>
          </div>
        )
      })}
      <LocalSymbolLibrary/>
      <div className="shape-group"><div className="group-label">关系预设</div><div className="relationship-grid">{RELATIONS.filter(r=>all||type==='free'||!r.diagrams||r.diagrams.includes(type)).map(r=><button key={r.id} title={r.hint} className={tool==='connector'&&s.currentRelation===r.id?'active':''} onClick={()=>s.setCurrentRelation(r.id)}>{r.label}</button>)}</div><button className="wide-btn" onClick={()=>{const names=SHAPE_LIBRARY.filter(m=>m.group===type).map(m=>`${m.label}：${m.description||''}`);const n=makeShape('umlNote',40,40,440,Math.max(100,names.length*45),s.maxZ()+1);n.text=names.join('\n');s.addNode(n,'插入符号说明')}}>插入本图符号说明</button></div>
      <div className="panel-tip">
        <ToolIcon name="link" />
        <div>
          <b>连接线</b>：选中「连接线」后从一个图形拖到另一个图形，自动吸附边缘并带箭头。
        </div>
      </div>
    </div>
  )
}
