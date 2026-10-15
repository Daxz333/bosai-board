import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore, emptyDoc, reflowConnector } from './store/board'
import { newId } from './types'
import { makeShape, makeLine } from './engine/factory'
import Canvas, { doSave } from './components/Canvas'
import TopBar from './components/TopBar'
import ToolBar from './components/ToolBar'
import ShapePanel from './components/ShapePanel'
import PropertyPanel from './components/PropertyPanel'
import LayersPanel from './components/LayersPanel'
import ContextMenu from './components/ContextMenu'
import ExportDialog from './components/ExportDialog'
import ImportDialog from './components/ImportDialog'
import { importSvg, type ImportResult } from './engine/import-svg'
import { importVsdx } from './engine/import-vsdx'
import { parseDocument } from './engine/document-validation'
import { protectCurrentDocument } from './document-lifecycle'
import EngineeringWorkspace, { DiagramBar } from './components/EngineeringWorkspace'
import PrintAtlas from './components/PrintAtlas'
import PageTabs from './components/PageTabs'

export default function App() {
  const s = useStore()
  const [leftTab, setLeftTab] = useState<'shapes' | 'layers'>('shapes')
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [rightTab, setRightTab] = useState<'prop' | 'pages' | 'engineering'>('prop')
  const [atlasOpen,setAtlasOpen]=useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  useEffect(()=>{const open=()=>setAtlasOpen(true);window.addEventListener('bosai:print-atlas',open);return ()=>window.removeEventListener('bosai:print-atlas',open)},[])

  /* 初始化：恢复自动保存或创建示例 */
  useEffect(() => {
    const restored = useStore.getState().restore()
    if (!restored) {
      const recoveryError = useStore.getState().recoveryError
      useStore.getState().loadDoc(makeStarterDoc())
      if (recoveryError) { useStore.setState({ recoveryError }); alert(recoveryError + '\n原恢复数据已保留，未被覆盖。') }
    }
  }, [])

  /* 恢复快照采用固定周期，连续编辑不会无限推迟写入。 */
  useEffect(() => {
    let lastSession = ''
    let lastRevision = -1
    const flush = () => {
      const state = useStore.getState()
      if (!state.dirty || (state.sessionId === lastSession && state.revision === lastRevision && !state.recoveryError)) return
      state.autosave()
      if (!useStore.getState().recoveryError) { lastSession = state.sessionId; lastRevision = state.revision }
    }
    const interval = setInterval(flush, 2500)
    const onHidden = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHidden)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onHidden) }
  }, [])

  useEffect(() => {
    const api = (window as any).boardAPI
    if (!api?.onCloseRequested) return
    return api.onCloseRequested(async () => api.respondClose(await protectCurrentDocument('关闭窗口')))
  }, [])

  /* 关闭前提醒 */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if ((window as any).boardAPI?.onCloseRequested) return
      if (useStore.getState().dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  /* 全局快捷键：F5 演示、Ctrl+O 打开、Delete 双击连线 */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'F5') { e.preventDefault(); s.setPresentation(!s.presentation) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); void onNew() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); onOpen() }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setExportOpen((v) => !v)
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) setShowHelp(v => !v)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [s.presentation])

  const onOpen = useCallback(async () => {
    const api = (window as any).boardAPI
    if (!api) return
    const res = await api.openFile()
    if (!res?.ok) { if (res?.error) alert('打开失败：' + res.error); return }
    try {
      const doc = parseDocument(res.content)
      if (!await protectCurrentDocument('打开另一工程')) return
      useStore.getState().loadDoc(doc, res.path)
      useStore.getState().clearRecoverySnapshot()
    } catch (err) {
      alert('文件解析失败：' + (err as Error).message)
    }
  }, [])

  const onNew = useCallback(async () => {
    if (await protectCurrentDocument('新建白板')) { useStore.getState().newDoc(); useStore.getState().clearRecoverySnapshot() }
  }, [])

  const onImport = async () => {
    const api=(window as any).boardAPI
    if(!api?.importDrawing) { alert('请在桌面应用中使用文件导入'); return }
    const res=await api.importDrawing()
    if(!res.ok) { if(!res.canceled) alert('导入失败：'+res.error); return }
    try { setImportResult(res.format==='svg'?importSvg(res.content,res.name):importVsdx(res.parts,res.name)) }
    catch(error) { alert('绘图转换失败：'+(error as Error).message) }
  }

  if (s.presentation) {
    return <PresentationView />
  }

  return (
    <div className="app">
      <TopBar onNew={onNew} onOpen={onOpen} onExport={() => setExportOpen(true)} onImport={onImport} />
      <div className="body">
        <aside className="left" hidden={!leftOpen}>
          <div className="left-tabs">
            <button className={leftTab === 'shapes' ? 'active' : ''} onClick={() => setLeftTab('shapes')}>形状</button>
            <button className={leftTab === 'layers' ? 'active' : ''} onClick={() => setLeftTab('layers')}>图层</button>
          </div>
          {leftTab === 'shapes' ? <ShapePanel /> : <LayersPanel />}
        </aside>

        <div className="center">
          <DiagramBar
            startAction={<button className="panel-toggle" aria-label="切换形状面板" aria-expanded={leftOpen} onClick={() => setLeftOpen(!leftOpen)} title={leftOpen ? '收起形状面板' : '展开形状面板'}>◧</button>}
            endAction={<button className="panel-toggle" aria-label="切换属性面板" aria-expanded={rightOpen} onClick={() => setRightOpen(!rightOpen)} title={rightOpen ? '收起属性面板' : '展开属性面板'}>◨</button>}
          />
          <div className="canvas-stage"><ToolBar /><Canvas /></div>
          <PageTabs />
        </div>

        <aside className="right" hidden={!rightOpen}>
          <div className="right-tabs">
            <button className={rightTab === 'prop' ? 'active' : ''} onClick={() => setRightTab('prop')}>属性</button>
            <button className={rightTab === 'pages' ? 'active' : ''} onClick={() => setRightTab('pages')}>页面</button>
            <button className={rightTab === 'engineering' ? 'active' : ''} onClick={() => setRightTab('engineering')}>建模</button>
          </div>
          {rightTab === 'prop' ? <PropertyPanel /> : rightTab==='pages'?<LayersPanel mode="pages" />:<EngineeringWorkspace/>}
        </aside>
      </div>
      <ContextMenu />
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {importResult && <ImportDialog result={importResult} onClose={() => setImportResult(null)} />}
      {atlasOpen&&<PrintAtlas onClose={()=>setAtlasOpen(false)}/>}
    </div>
  )
}

/* 演示模式 */
function PresentationView() {
  const s = useStore()
  const idx = Math.max(0, s.doc.pages.findIndex((p) => p.id === s.doc.activePageId))

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const st = useStore.getState()
      if (e.key === 'Escape' || e.key === 'F5') st.setPresentation(false)
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        const next = st.doc.pages[Math.min(st.doc.pages.length - 1, st.doc.pages.findIndex((p) => p.id === st.doc.activePageId) + 1)]
        if (next) st.setActivePage(next.id)
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        const cur = st.doc.pages.findIndex((p) => p.id === st.doc.activePageId)
        const prev = st.doc.pages[Math.max(0, cur - 1)]
        if (prev) st.setActivePage(prev.id)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="presentation">
      <div className="pres-bar">
        <span className="pres-title">{s.doc.title}</span>
        <span className="pres-page">{idx + 1} / {s.doc.pages.length}</span>
        <button className="btn-ghost" onClick={() => s.setPresentation(false)}>退出演示 (Esc)</button>
      </div>
      <div className="pres-stage">
        <PresentationCanvas />
      </div>
      <div className="pres-foot">
        <button disabled={idx === 0} onClick={() => s.setActivePage(s.doc.pages[idx - 1].id)}>‹ 上一页</button>
        <button disabled={idx === s.doc.pages.length - 1} onClick={() => s.setActivePage(s.doc.pages[idx + 1].id)}>下一页 ›</button>
      </div>
    </div>
  )
}

function PresentationCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (ref.current) renderPres(ref.current)
  })
  return <canvas ref={ref} className="pres-canvas" />
}

function renderPres(el: HTMLCanvasElement) {
  const st = useStore.getState()
  const page = st.page()
  const host = el.parentElement
  if (!host) return
  const dpr = window.devicePixelRatio || 1
  const W = host.clientWidth, H = host.clientHeight
  el.width = W * dpr; el.height = H * dpr
  el.style.width = W + 'px'; el.style.height = H + 'px'
  const ctx = el.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#111318'
  ctx.fillRect(0, 0, W, H)

  const nodes = page.order.map((id) => page.nodes[id]).filter((n) => n && !n.hidden) as any[]
  if (!nodes.length) {
    ctx.fillStyle = '#6b7280'
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('（本页为空）', W / 2, H / 2)
    return
  }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const n of nodes) { x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + n.w); y2 = Math.max(y2, n.y + n.h) }
  const pad = 60
  const zoom = Math.min((W - pad * 2) / Math.max(1, x2 - x1), (H - pad * 2) / Math.max(1, y2 - y1))
  ctx.translate(W / 2 - ((x1 + x2) / 2) * zoom, H / 2 - ((y1 + y2) / 2) * zoom)
  ctx.scale(zoom, zoom)
  import('./engine/render').then(({ drawNode }) => {
    const rc = { ctx, cam: { x: 0, y: 0, zoom: 1 }, dpr: 1, interactive: false }
    for (const n of nodes) drawNode(rc, n)
  })
}

/* 帮助弹窗 */
function HelpModal({ onClose }: { onClose: () => void }) {
  const groups: [string, [string, string][]][] = [
    ['选择与编辑', [
      ['框选 / 多选', '空白处拖拽；Shift + 点击多选'],
      ['方向框选', '左→右：完全包含；右→左：碰到即选中'],
      ['移动', '拖拽；方向键微调，Shift+方向键 10px'],
      ['快速复制', '按住 Alt 拖动对象或组合'],
      ['缩放 / 旋转', '拖控制点；Shift 等比，Alt 中心缩放；Shift 旋转按 15°'],
      ['双击文字', '直接编辑文本内容'],
      ['删除', 'Delete 或 Backspace'],
      ['复制 / 粘贴 / 再制', 'Ctrl+C / Ctrl+V / Ctrl+D'],
      ['组合 / 取消组合', 'Ctrl+G / Ctrl+Shift+G']
    ]],
    ['工具', [
      ['选择 V', '选择与变换'],
      ['抓手 H', '平移画布（也可按住空格拖拽）'],
      ['形状 R', '绘制流程图形状'],
      ['文本 T', '插入文本'],
      ['连接线 L', '连接两个图形，自动吸附'],
      ['画笔 P', '自由手绘'],
      ['橡皮 E', '点击删除元素'],
      ['框架 F', '绘制框架容器']
    ]],
    ['视图', [
      ['缩放', 'Ctrl+滚轮，或 Ctrl + / - / 0'],
      ['平移', '滚轮 / Shift+滚轮 / 空格拖拽'],
      ['导航器', '左下角小地图点击或拖动快速定位'],
      ['适应画布', 'Ctrl+1'],
      ['缩放到选中', 'Ctrl+2'],
      ['演示模式', 'F5'],
      ['显示网格', '右侧「属性」面板中设置']
    ]],
    ['文件', [
      ['保存', 'Ctrl+S'],
      ['打开', 'Ctrl+O'],
      ['新建', 'Ctrl+N'],
      ['导出图片', 'Ctrl+Shift+E'],
      ['导出选项', 'PNG / JPG / JPEG / WebP / BMP / SVG'],
      ['透明背景', 'PNG 与 WebP 支持；JPG 会填充底色'],
      ['导出范围', '当前页 / 选中元素 / 全部页面'],
      ['其它导出', '文件菜单 → 工程文件 / 打印 PDF']
    ]]
  ]
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>快捷键与使用说明</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {groups.map(([title, items]) => (
            <div key={title} className="help-group">
              <div className="help-title">{title}</div>
              {items.map(([k, v]) => (
                <div key={k} className="help-row"><kbd>{k}</kbd><span>{v}</span></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* 初始示例：一张流程图 */
function makeStarterDoc() {
  const doc = emptyDoc()
  const page = doc.pages[0]
  const nodes: Record<string, any> = {}
  const order: string[] = []
  const add = (n: any) => { n.id = newId('n'); nodes[n.id] = n; order.push(n.id); return n }

  const start = add(makeShape('roundRect', 120, 340, 150, 70, 1))
  start.text = '开始'; start.fill = '#D3F9D8'; start.stroke = '#2F9E44'

  const p1 = add(makeShape('rect', 360, 330, 160, 90, 2))
  p1.text = '接收需求'; p1.fill = '#E8F0FF'; p1.stroke = '#3B6FE0'

  const p2 = add(makeShape('rect', 620, 330, 160, 90, 3))
  p2.text = '评审需求'; p2.fill = '#FFF3D6'; p2.stroke = '#E8A317'

  const d1 = add(makeShape('diamond', 890, 300, 170, 150, 4))
  d1.text = '需求明确？'; d1.fill = '#FDECEC'; d1.stroke = '#E03131'

  const e1 = add(makeShape('roundRect', 620, 520, 160, 70, 5))
  e1.text = '补充材料'; e1.fill = '#FFE8CC'; e1.stroke = '#F76707'

  const end = add(makeShape('roundRect', 360, 520, 160, 70, 6))
  end.text = '结束'; end.fill = '#F1F3F5'; end.stroke = '#868E96'

  const note = add(makeShape('sticky', 1150, 330, 180, 190, 7))
  note.text = '操作提示\n\n双击图形改文字\n拖动时连线跟随\n右键打开菜单'
  note.fill = '#FFE066'; note.valign = 'top'; note.fontSize = 13; note.lineHeight = 1.75

  const yesLbl = add(makeShape('text', 800, 470, 60, 24, 8))
  yesLbl.text = '是'; yesLbl.fontSize = 13; yesLbl.color = '#2F9E44'

  const noLbl = add(makeShape('text', 900, 300, 60, 24, 8))
  noLbl.text = '否'; noLbl.fontSize = 13; noLbl.color = '#E03131'

  const link = (a: any, b: any, opts: any = {}) => {
    const c = makeLine(0, 0, 1, 1, 10 + order.length, {
      kind: 'connector', arrow: 'end', route: 'orthogonal',
      from: { nodeId: a.id, side: 'auto' }, to: { nodeId: b.id, side: 'auto' }, ...opts
    })
    add(c)
  }
  link(start, p1)
  link(p1, p2)
  link(p2, d1)
  // 评审需求 → 补充材料（否：需要补充）
  link(p2, e1, { from: { nodeId: p2.id, side: 'bottom' }, to: { nodeId: e1.id, side: 'top' } })
  // 补充材料 → 评审需求（补完再评审）
  link(e1, p2, {
    stroke: '#F76707',
    from: { nodeId: e1.id, side: 'right' }, to: { nodeId: p2.id, side: 'bottom' }
  })
  // 需求明确？ → 结束（是）
  link(d1, end, {
    stroke: '#2F9E44',
    from: { nodeId: d1.id, side: 'left' }, to: { nodeId: end.id, side: 'top' }
  })

  // 重算连线几何
  const getNode = (id: string) => nodes[id]
  for (const n of Object.values(nodes)) {
    if (n.kind === 'connector') Object.assign(n, reflowConnector(n, getNode))
  }

  page.nodes = nodes
  page.order = order
  doc.title = '产品流程图示例'
  return doc
}
