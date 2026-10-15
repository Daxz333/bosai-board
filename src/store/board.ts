import { create } from 'zustand'
import type {
  AnyNode, Camera, Doc, Page, ShapeKind, ToolId, LineNode, ShapeNode, TableNode, RelationKind, DiagramType
} from '../types'
import { newId } from '../types'
import { makeShape, makeTable, makePencil, makeLine, makeImage } from '../engine/factory'
import {
  unionRect, rectCenter, nodeRect, autoSide, sideAnchor, rotatedBounds, rotatePoint, rotateLineGeometry,
  type Rect, type Pt
} from '../engine/geometry'
import { routeOrthogonal, routeCurve, simplify, boundsOfPts } from '../engine/shapes'
import { inheritedFlag } from '../engine/hierarchy'
import { validateDocument } from '../engine/document-validation'
import { reconcileEngineering, insertContainment } from '../engine/engineering'
import { routeAvoiding, decorateConnections } from '../engine/engineering-layout'

const STORAGE_KEY = 'bosai-board:autosave'
const HISTORY_LIMIT = 80

function emptyPage(name: string): Page {
  return { id: newId('p'), name, background: '#FFFFFF', nodes: {}, order: [], diagramType:'free' }
}

/** 展开组合到所有后代，供移动、缩放、复制与删除保持组合语义。 */
export function expandNodeIds(page: Page, ids: string[]): string[] {
  const out = Array.from(new Set(ids.filter((id) => !!page.nodes[id])))
  const seen = new Set(out)
  let changed = true
  while (changed) {
    changed = false
    for (const id of page.order) {
      const n = page.nodes[id]
      const line=n as LineNode
      if(line.fragmentId&&seen.has(line.fragmentId)&&!seen.has(id)){seen.add(id);out.push(id);changed=true}
      if(line.kind==='connector'&&line.from&&line.to&&seen.has(line.from.nodeId)&&seen.has(line.to.nodeId)&&!seen.has(id)){seen.add(id);out.push(id);changed=true}
      if (n?.parent && seen.has(n.parent) && !seen.has(id)) {
        seen.add(id); out.push(id); changed = true
      }
    }
  }
  return out
}

export function emptyDoc(): Doc {
  const p = emptyPage('页面 1')
  return {
    version: 2, models:{}, dictionary:[],
    documentId: newId('doc'),
    title: '未命名白板',
    pages: [p],
    activePageId: p.id,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

export interface HistoryEntry {
  doc: Doc
  label: string
}

interface State {
  doc: Doc
  past: HistoryEntry[]
  future: HistoryEntry[]
  tool: ToolId
  currentShape: ShapeKind
  currentRelation: RelationKind | null
  selection: string[]
  camera: Camera
  gridVisible: boolean
  snapEnabled: boolean
  gridSize: number
  zoomLabel: number
  editingId: string | null
  dirty: boolean
  filePath: string | null
  documentId: string
  sessionId: string
  revision: number
  savedRevision: number
  recoveryError: string | null
  showGridMenu: boolean
  presentation: boolean

  // 派生
  page: () => Page
  nodes: () => Record<string, AnyNode>
  selected: () => AnyNode[]
  selectionRect: () => Rect | null
  maxZ: () => number

  // 文档
  newDoc: () => void
  editDoc: (label:string, mutate:(doc:Doc)=>void) => void
  setCurrentRelation: (relation:RelationKind) => void
  addDiagram: (type:DiagramType) => void
  loadDoc: (doc: Doc, path?: string | null) => void
  setTitle: (t: string) => void
  setDirty: (d: boolean) => void
  confirmSaved: (documentId: string, sessionId: string, revision: number, path: string) => boolean
  clearRecoverySnapshot: () => void

  // 页面
  addPage: () => void
  removePage: (id: string) => void
  setActivePage: (id: string) => void
  renamePage: (id: string, name: string) => void
  setPageBg: (color: string) => void
  movePage: (id: string, dir: -1 | 1) => void

  // 工具 / 视图
  setTool: (t: ToolId) => void
  setCurrentShape: (k: ShapeKind) => void
  setCamera: (c: Partial<Camera>) => void
  zoomTo: (z: number, anchor?: Pt) => void
  zoomBy: (f: number, anchorScreen?: Pt) => void
  fitView: () => void
  zoomToSelection: () => void
  toggleGrid: () => void
  setGridSize: (n: number) => void
  toggleSnap: () => void
  setEditing: (id: string | null) => void
  setPresentation: (v: boolean) => void
  setFilePath: (p: string | null) => void

  // 节点
  addNode: (n: AnyNode, label?: string) => string
  addNodes: (ns: AnyNode[], label?: string) => void
  updateNode: (id: string, patch: Partial<AnyNode>, label?: string) => void
  updateNodes: (ids: string[], fn: (n: AnyNode) => void, label?: string) => void
  removeNodes: (ids: string[]) => void
  duplicate: (ids: string[], offset?: Pt) => void
  copy: (ids: string[]) => void
  paste: (at?: Pt) => void
  clipboard: () => AnyNode[]

  // 选择
  select: (ids: string[], additive?: boolean) => void
  selectAll: () => void
  clearSelection: () => void
  selectTopAt: (p: Pt) => void

  // 变换
  moveNodes: (ids: string[], dx: number, dy: number, label?: string) => void
  scaleNodes: (ids: string[], box0: Rect, box1: Rect, label?: string) => void
  rotateNodes: (ids: string[], cx: number, cy: number, deg: number) => void

  // 层级
  bringToFront: (ids: string[]) => void
  sendToBack: (ids: string[]) => void
  bringForward: (ids: string[]) => void
  sendBackward: (ids: string[]) => void

  // 组合
  group: (ids: string[]) => void
  ungroup: () => void

  // 对齐
  align: (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => void
  distribute: (axis: 'h' | 'v') => void

  // 历史
  commit: (label: string) => void
  undo: () => void
  redo: () => void

  // 持久化
  autosave: () => void
  restore: () => boolean
}

let idSeed = 0
function assignId<T extends AnyNode>(n: T): T {
  ;(n as AnyNode).id = newId(`n${idSeed++}`)
  return n
}

const initialDoc = emptyDoc()
let replacingDocument = false
export const useStore = create<State>((set, get) => ({
  doc: initialDoc,
  past: [],
  future: [],
  tool: 'select',
  currentShape: 'rect',
  currentRelation: null,
  selection: [],
  camera: { x: 0, y: 0, zoom: 1 },
  gridVisible: true,
  snapEnabled: true,
  gridSize: 20,
  zoomLabel: 100,
  editingId: null,
  dirty: false,
  filePath: null,
  documentId: initialDoc.documentId!,
  sessionId: newId('session'),
  revision: 0,
  savedRevision: 0,
  recoveryError: null,
  showGridMenu: false,
  presentation: false,

  page: () => {
    const d = get().doc
    return d.pages.find((p) => p.id === d.activePageId) || d.pages[0]
  },
  nodes: () => get().page().nodes,
  selected: () => {
    const s = get()
    const map = s.page().nodes
    return s.selection.map((id) => map[id]).filter(Boolean) as AnyNode[]
  },
  selectionRect: () => {
    const s = get().selected()
    if (!s.length) return null
    return unionRect(s.map((n) => rotatedBounds(nodeRect(n), n.rot)))
  },
  maxZ: () => {
    const nodes = Object.values(get().page().nodes)
    return nodes.reduce((m, n) => Math.max(m, n.z), 0)
  },

  newDoc: () => {
    const doc = emptyDoc()
    replacingDocument = true
    try { set({ doc, documentId: doc.documentId!, sessionId: newId('session'), revision: 0, savedRevision: 0, selection: [], editingId: null, tool: 'select', currentRelation: null, presentation: false, past: [], future: [], filePath: null, dirty: false, recoveryError: null }) }
    finally { replacingDocument = false }
    get().fitView()
  },

  editDoc: (label,mutate) => {
    const doc=structuredClone(get().doc)
    mutate(doc)
    doc.updatedAt=Date.now()
    const ready=reconcileEngineering(doc,get().doc)
    validateDocument(ready)
    get().commit(label)
    const changedPage=ready.activePageId!==get().doc.activePageId
    set({doc:ready,selection:changedPage?[]:get().selection.filter(id=>ready.pages.find(p=>p.id===ready.activePageId)?.nodes[id]),editingId:changedPage?null:get().editingId})
    if (changedPage) { get().setTool('select'); get().fitView() }
  },
  setCurrentRelation: relation=>set({currentRelation:relation,tool:'connector',selection:[],editingId:null}),
  addDiagram: type=>get().editDoc('新增专业图',doc=>{const p=emptyPage(`页面 ${doc.pages.length+1}`);p.diagramType=type;p.name=type==='free'?p.name:type+' 图';doc.pages.push(p);doc.activePageId=p.id}),

  loadDoc: (doc, path) => {
    doc = reconcileEngineering(validateDocument(doc))
    for(const p of doc.pages){for(const n of Object.values(p.nodes))if(n.kind==='connector')Object.assign(n,reflowConnector(n,id=>p.nodes[id],Object.values(p.nodes)));decorateConnections(p)}
    const d: Doc = {
      ...doc,
      documentId: doc.documentId || newId('doc')
    }
    const sessionId = newId('session')
    replacingDocument = true
    try { set({ doc: d, documentId: d.documentId!, sessionId, revision: 0, savedRevision: 0, selection: [], editingId: null, past: [], future: [], filePath: path ?? null, dirty: false, recoveryError: null }) }
    finally { replacingDocument = false }
    setTimeout(() => { if (get().sessionId === sessionId) get().fitView() }, 30)
  },

  setTitle: (t) => set((s) => ({ doc: { ...s.doc, title: t }, dirty: true })),
  setDirty: (d) => set((s) => d ? { dirty: true, revision: s.revision + 1 } : { dirty: false, savedRevision: s.revision }),
  confirmSaved: (documentId, sessionId, revision, path) => {
    const s = get()
    if (s.documentId !== documentId || s.sessionId !== sessionId) return false
    set({ filePath: path, savedRevision: revision, dirty: s.revision !== revision })
    if (s.revision === revision) get().clearRecoverySnapshot()
    return true
  },
  clearRecoverySnapshot: () => {
    try { localStorage.removeItem(STORAGE_KEY); set({ recoveryError: null }) }
    catch (error) { set({ recoveryError: '清理恢复快照失败：' + String(error) }) }
  },

  addPage: () => {
    get().commit('新增页面')
    const p = emptyPage(`页面 ${get().doc.pages.length + 1}`)
    set((s) => ({ doc: { ...s.doc, pages: [...s.doc.pages, p], activePageId: p.id }, selection: [] }))
    get().setTool('select')
    get().fitView()
  },
  removePage: (id) => {
    const s = get()
    if (s.doc.pages.length <= 1) return
    s.commit('删除页面')
    const pages = structuredClone(s.doc.pages.filter((p) => p.id !== id))
    const removed=new Set(Object.keys(s.doc.pages.find(p=>p.id===id)?.nodes||{}))
    for(const p of pages){if(p.parentPageId===id){delete p.parentPageId;delete p.parentProcessId}for(const n of Object.values(p.nodes))if(n.childPageId===id)delete n.childPageId}
    set((st) => ({
      doc: { ...st.doc, pages,dictionary:st.doc.dictionary?.map(e=>({...e,flowIds:e.flowIds?.filter(ref=>!removed.has(ref))})),activePageId: st.doc.activePageId === id ? pages[0].id : st.doc.activePageId },
      selection: []
    }))
  },
  setActivePage: (id) => {
    if (id === get().doc.activePageId || !get().doc.pages.some(p => p.id === id)) return
    set((s) => ({ doc: { ...s.doc, activePageId: id }, selection: [], editingId: null, tool: 'select' }))
    get().fitView()
  },
  renamePage: (id, name) => set((s) => ({
    doc: { ...s.doc, pages: s.doc.pages.map((p) => (p.id === id ? { ...p, name } : p)) }, dirty: true
  })),
  setPageBg: (color) => set((s) => ({
    doc: { ...s.doc, pages: s.doc.pages.map((p) => (p.id === s.doc.activePageId ? { ...p, background: color } : p)) },
    dirty: true
  })),
  movePage: (id, dir) => set((s) => {
    const i = s.doc.pages.findIndex((p) => p.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= s.doc.pages.length) return {}
    const pages = [...s.doc.pages]
    ;[pages[i], pages[j]] = [pages[j], pages[i]]
    return { doc: { ...s.doc, pages }, dirty: true }
  }),

  setTool: (t) => set({ tool: t, ...(t==='connector'?{currentRelation:null}:{}), editingId: null, selection: t === 'select' || t === 'node' ? get().selection : [] }),
  setCurrentShape: (k) => set({ currentShape: k, tool: 'shape' }),
  setCamera: (c) => set((s) => ({ camera: { ...s.camera, ...c }, zoomLabel: Math.round((c.zoom ?? s.camera.zoom) * 100) })),
  zoomTo: (z, anchor) => {
    const s = get()
    const next = Math.max(0.05, Math.min(8, z))
    const host = typeof document !== 'undefined' ? document.querySelector('.canvas-host') as HTMLElement | null : null
    const zoomAnchor = anchor || (host ? { x: host.clientWidth / 2, y: host.clientHeight / 2 } : undefined)
    if (zoomAnchor) {
      const wx = (zoomAnchor.x - s.camera.x) / s.camera.zoom
      const wy = (zoomAnchor.y - s.camera.y) / s.camera.zoom
      set({ camera: { x: zoomAnchor.x - wx * next, y: zoomAnchor.y - wy * next, zoom: next }, zoomLabel: Math.round(next * 100) })
    } else {
      set({ camera: { ...s.camera, zoom: next }, zoomLabel: Math.round(next * 100) })
    }
  },
  zoomBy: (f, anchor) => {
    const s = get()
    s.zoomTo(s.camera.zoom * f, anchor)
  },
  fitView: () => {
    const s = get()
    const nodes = Object.values(s.page().nodes).filter((n) => !inheritedFlag(n, s.page().nodes, 'hidden'))
    const host = typeof window !== 'undefined' ? document.querySelector('.canvas-host') as HTMLElement : null
    const W = host?.clientWidth || window.innerWidth
    const H = host?.clientHeight || window.innerHeight
    if (!nodes.length) { set({ camera: { x: W / 2, y: H / 2, zoom: 1 }, zoomLabel: 100 }); return }
    const b = unionRect(nodes.map((n) => rotatedBounds(nodeRect(n), n.rot)))
    const pad = 80
    const zoom = Math.max(0.05, Math.min(3, Math.min((W - pad * 2) / Math.max(1, b.w), (H - pad * 2) / Math.max(1, b.h))))
    set({
      camera: { x: W / 2 - (b.x + b.w / 2) * zoom, y: H / 2 - (b.y + b.h / 2) * zoom, zoom },
      zoomLabel: Math.round(zoom * 100)
    })
  },
  zoomToSelection: () => {
    const s = get()
    const r = s.selectionRect()
    const host = document.querySelector('.canvas-host') as HTMLElement | null
    const W = host?.clientWidth || window.innerWidth
    const H = host?.clientHeight || window.innerHeight
    if (!r) { s.fitView(); return }
    const pad = 100
    const zoom = Math.max(0.05, Math.min(3, Math.min((W - pad * 2) / Math.max(1, r.w), (H - pad * 2) / Math.max(1, r.h))))
    set({
      camera: { x: W / 2 - (r.x + r.w / 2) * zoom, y: H / 2 - (r.y + r.h / 2) * zoom, zoom },
      zoomLabel: Math.round(zoom * 100)
    })
  },
  toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),
  setGridSize: (n) => set({ gridSize: n }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setEditing: (id) => set({ editingId: id }),
  setPresentation: (v) => set({ presentation: v, selection: [], tool: v ? 'hand' : 'select' }),
  setFilePath: (p) => set({ filePath: p }),

  addNode: (n, label = '添加元素') => {
    get().commit(label)
    const node = assignId(n)
    set((s) => {
      const p = s.page()
      const nodes=structuredClone(p.nodes)
      insertContainment({...p,nodes},node)
      return {
        doc: { ...s.doc, updatedAt: Date.now(), pages: s.doc.pages.map((pp) => pp.id !== p.id ? pp : {
          ...pp, nodes: { ...nodes, [node.id]: node }, order: node.container?[node.id,...pp.order]:[...pp.order, node.id]
        }) },
        dirty: true
      }
    })
    return node.id
  },

  addNodes: (ns, label = '添加元素') => {
    if (!ns.length) return
    get().commit(label)
    // 批量插入时保留节点之间的关系（组合父级、连线端点）。这对复制整组
    // 流程图尤其重要：副本应该连接到副本，而不是继续指向原图形。
    const idMap = new Map<string, string>()
    const nodes = ns.map((source) => {
      const n = structuredClone(source) as AnyNode
      const nextId = newId(`n${idSeed++}`)
      idMap.set(source.id, nextId)
      n.id = nextId
      if(n.modelId) n.modelId=undefined
      n.childPageId=undefined
      return n
    })
    for (const n of nodes) {
      if (n.parent) n.parent = idMap.get(n.parent)||null
      const line = n as LineNode
      if (line.from && idMap.has(line.from.nodeId)) line.from = { ...line.from, nodeId: idMap.get(line.from.nodeId)! }
      if (line.to && idMap.has(line.to.nodeId)) line.to = { ...line.to, nodeId: idMap.get(line.to.nodeId)! }
      if(line.from&&!nodes.some(n=>n.id===line.from!.nodeId)&&!get().page().nodes[line.from.nodeId])line.from=undefined
      if(line.to&&!nodes.some(n=>n.id===line.to!.nodeId)&&!get().page().nodes[line.to.nodeId])line.to=undefined
      if(line.fragmentId)line.fragmentId=idMap.get(line.fragmentId)
      for(const key of ['activationFor','activationStart','activationEnd'] as const)if(n[key])n[key]=idMap.get(n[key]!)
    }
    const ids = nodes.map((n) => n.id)
    set((s) => {
      const p = s.page()
      const map = structuredClone(p.nodes)
      for (const n of nodes) map[n.id] = n
      return {
        doc: { ...s.doc, updatedAt: Date.now(), pages: s.doc.pages.map((pp) => pp.id !== p.id ? pp : {
          ...pp, nodes: map, order: [...pp.order, ...ids]
        }) },
        dirty: true
      }
    })
    const copied = new Set(ids)
    set({ selection: nodes.filter(n => !n.parent || !copied.has(n.parent)).map(n => n.id) })
  },

  updateNode: (id, patch, label) => {
    if (label) get().commit(label)
    set((s) => {
      const p = s.page()
      const old = p.nodes[id]
      if (!old) return {}
      return {
        doc: { ...s.doc, updatedAt: Date.now(), pages: s.doc.pages.map((pp) => pp.id !== p.id ? pp : {
          ...pp, nodes: { ...pp.nodes, [id]: { ...old, ...patch } as AnyNode }
        }) },
        dirty: true
      }
    })
  },

  updateNodes: (ids, fn, label) => {
    if (!ids.length) return
    if (label) get().commit(label)
    set((s) => {
      const p = s.page()
      const map = { ...p.nodes }
      let changed = false
      for (const id of ids) {
        const n = map[id]
        if (!n) continue
        const draft = structuredClone(n) as AnyNode
        fn(draft)
        map[id] = draft
        changed = true
      }
      if (!changed) return {}
      return {
        doc: { ...s.doc, updatedAt: Date.now(), pages: s.doc.pages.map((pp) => pp.id !== p.id ? pp : { ...pp, nodes: map }) },
        dirty: true
      }
    })
  },

  removeNodes: (ids) => {
    if (!ids.length) return
    ids = expandNodeIds(get().page(), ids)
    get().commit('删除元素')
    set((s) => {
      const p = s.page()
      const map = structuredClone(p.nodes)
      for (const id of ids) delete map[id]
      // 顺带删除绑定到这些节点的连线
      for (const n of Object.values(map)) {
        if(n.activationFor&&ids.includes(n.activationFor))delete n.activationFor
        if(n.activationStart&&ids.includes(n.activationStart))delete n.activationStart
        if(n.activationEnd&&ids.includes(n.activationEnd))delete n.activationEnd
        const ln = n as LineNode
        if(ln.fragmentId&&ids.includes(ln.fragmentId))delete ln.fragmentId
        if (ln.kind === 'connector' && (ln.from || ln.to)) {
          const fromDead = ln.from && ids.includes(ln.from.nodeId)
          const toDead = ln.to && ids.includes(ln.to.nodeId)
          if(fromDead)ln.from=undefined
          if(toDead)ln.to=undefined
        }
      }
      return {
        doc: { ...s.doc, dictionary:s.doc.dictionary?.map(e=>({...e,flowIds:e.flowIds?.filter(id=>!ids.includes(id))})),pages: s.doc.pages.map((pp) => pp.id !== p.id ? pp.parentPageId===p.id&&ids.includes(pp.parentProcessId||'')?{...pp,parentPageId:undefined,parentProcessId:undefined}:pp : { ...pp, nodes: map, order: pp.order.filter((i) => !ids.includes(i)) }) },
        selection: s.selection.filter((i) => !ids.includes(i)),
        dirty: true
      }
    })
  },

  duplicate: (ids, offset = { x: 24, y: 24 }) => {
    const s = get()
    const map = s.page().nodes
    ids = expandNodeIds(s.page(), ids)
    const maxZ = s.maxZ()
    const clones: AnyNode[] = []
    let z = maxZ
    for (const id of ids) {
      const n = map[id]
      if (!n) continue
      const c = structuredClone(n) as AnyNode
      c.x += offset.x; c.y += offset.y; c.z = ++z
      if((c as LineNode).bends)(c as LineNode).bends=(c as LineNode).bends!.map(p=>({x:p.x+offset.x,y:p.y+offset.y}))
      if((c as LineNode).messageY!==undefined)(c as LineNode).messageY!+=offset.y
      clones.push(c)
    }
    const selected=new Set(ids)
    for(const n of Object.values(map))if(n.kind==='connector'&&!selected.has(n.id)&&n.from&&n.to&&selected.has(n.from.nodeId)&&selected.has(n.to.nodeId)){const c=structuredClone(n);c.x+=offset.x;c.y+=offset.y;c.z=++z;clones.push(c)}
    s.addNodes(clones, '复制元素')
  },

  copy: (ids) => {
    const page = get().page()
    ids = expandNodeIds(page, ids)
    const map = page.nodes
    const list = ids.map((id) => map[id]).filter(Boolean).map((n) => structuredClone(n) as AnyNode)
    ;(window as any).__boardClip = list
  },

  paste: (at) => {
    const list: AnyNode[] = (window as any).__boardClip || []
    if (!list.length) return
    const s = get()
    const map = s.page().nodes
    const bounds = unionRect(list.map(nodeRect))
    const target = at || { x: bounds.x + 40, y: bounds.y + 40 }
    const dx = target.x - bounds.x
    const dy = target.y - bounds.y
    const maxZ = s.maxZ()
    const clones = list.map((n, i) => {
      const c = structuredClone(n) as AnyNode
      c.x += dx; c.y += dy; c.z = maxZ + i + 1
      if((c as LineNode).bends)(c as LineNode).bends=(c as LineNode).bends!.map(p=>({x:p.x+dx,y:p.y+dy}))
      if((c as LineNode).messageY!==undefined)(c as LineNode).messageY!+=dy
      return c
    })
    s.addNodes(clones, '粘贴')
  },

  clipboard: () => ((window as any).__boardClip || []) as AnyNode[],

  select: (ids, additive) => set((s) => ({
    selection: additive ? Array.from(new Set([...s.selection, ...ids])) : ids,
    editingId: null
  })),
  selectAll: () => set((s) => ({
    selection: s.page().order.filter((id) => {
      const n = s.page().nodes[id]
      return n && !n.parent && !inheritedFlag(n, s.page().nodes, 'locked') && !inheritedFlag(n, s.page().nodes, 'hidden')
    })
  })),
  clearSelection: () => set({ selection: [], editingId: null }),

  selectTopAt: (p) => {
    const s = get()
    const page = s.page()
    const list = page.order
      .map((id) => page.nodes[id])
      .filter((n): n is AnyNode => !!n && !n.hidden && !n.locked)
    for (let i = list.length - 1; i >= 0; i--) {
      if (hitNodeSimple(list[i], p)) { set({ selection: [list[i].id] }); return }
    }
    set({ selection: [] })
  },

  moveNodes: (ids, dx, dy, label) => {
    ids = expandNodeIds(get().page(), ids)
    get().updateNodes(ids, (n) => { n.x += dx; n.y += dy;const l=n as LineNode;if(l.bends)l.bends=l.bends.map(p=>({x:p.x+dx,y:p.y+dy}));if(l.messageY!==undefined)l.messageY+=dy }, label)
    // 端点被移动后，重算绑定到它们的连线
    const page = get().page()
    const affected = page.order.filter((id) => {
      const n = page.nodes[id] as LineNode | undefined
      if (n?.kind !== 'connector') return false
      return !!((n.from && ids.includes(n.from.nodeId)) || (n.to && ids.includes(n.to.nodeId)))
    })
    if (!affected.length) return
    get().updateNodes(affected, (n) => {
      Object.assign(n, reflowConnector(n as LineNode, (id) => page.nodes[id]))
    })
  },

  scaleNodes: (ids, box0, box1) => {
    const containerOnly=ids.length===1&&get().page().nodes[ids[0]]?.container
    if(!containerOnly)
    ids = expandNodeIds(get().page(), ids)
    const sx = box0.w === 0 ? 1 : box1.w / box0.w
    const sy = box0.h === 0 ? 1 : box1.h / box0.h
    get().updateNodes(ids, (n) => {
      n.x = box1.x + (n.x - box0.x) * sx
      n.y = box1.y + (n.y - box0.y) * sy
      n.w = Math.max(4, n.w * sx)
      n.h = Math.max(4, n.h * sy)
      const ln = n as LineNode
      if (ln.kind === 'pencil' && ln.points) {
        ln.points = ln.points.map((pt) => ({ x: (pt.x) * sx, y: (pt.y) * sy }))
      }
    }, '缩放元素')
    const page = get().page()
    const affected = page.order.filter((id) => {
      const n = page.nodes[id] as LineNode | undefined
      if (n?.kind !== 'connector' || ids.includes(id)) return false
      return !!((n.from && ids.includes(n.from.nodeId)) || (n.to && ids.includes(n.to.nodeId)))
    })
    if (affected.length) get().updateNodes(affected, (n) => {
      Object.assign(n, reflowConnector(n as LineNode, (id) => page.nodes[id]))
    })
  },

  rotateNodes: (ids, cx, cy, deg) => {
    ids = expandNodeIds(get().page(), ids)
    const rad = deg * Math.PI / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    get().updateNodes(ids, (n) => {
      if(['line','pencil','connector'].includes(n.kind)){Object.assign(n,rotateLineGeometry(n as LineNode,{x:cx,y:cy},deg));return}
      const c = rectCenter(nodeRect(n))
      const vx = c.x - cx, vy = c.y - cy
      const nx = cx + vx * cos - vy * sin
      const ny = cy + vx * sin + vy * cos
      n.x = nx - n.w / 2
      n.y = ny - n.h / 2
      n.rot = ((n.rot + deg) % 360 + 360) % 360
    }, '旋转元素')
  },

  bringToFront: (ids) => {
    const s = get()
    let z = s.maxZ()
    s.updateNodes(ids, (n) => { n.z = ++z }, '置顶')
    set((st) => {
      const page = st.page()
      const rest = page.order.filter((i) => !ids.includes(i))
      return { doc: { ...st.doc, pages: st.doc.pages.map((p) => p.id !== page.id ? p : { ...p, order: [...rest, ...ids] }) } }
    })
  },
  sendToBack: (ids) => {
    const s = get()
    let z = Object.values(s.page().nodes).reduce((m, n) => Math.min(m, n.z), 0) - 1
    s.updateNodes(ids, (n) => { n.z = z-- }, '置底')
    set((st) => {
      const page = st.page()
      const rest = page.order.filter((i) => !ids.includes(i))
      return { doc: { ...st.doc, pages: st.doc.pages.map((p) => p.id !== page.id ? p : { ...p, order: [...ids, ...rest] }) } }
    })
  },
  bringForward: (ids) => {
    const s = get()
    const page = s.page()
    const order = [...page.order]
    const sel = new Set(ids)
    for (let i = order.length - 2; i >= 0; i--) {
      if (sel.has(order[i]) && !sel.has(order[i + 1])) {
        ;[order[i], order[i + 1]] = [order[i + 1], order[i]]
      }
    }
    const map = { ...page.nodes }
    order.forEach((id, i) => { if (map[id]) map[id].z = i + 1 })
    set((st) => ({
      doc: { ...st.doc, pages: st.doc.pages.map((p) => p.id !== page.id ? p : { ...p, order, nodes: map }) },
      dirty: true
    }))
  },
  sendBackward: (ids) => {
    const s = get()
    const page = s.page()
    const order = [...page.order]
    const sel = new Set(ids)
    for (let i = 1; i < order.length; i++) {
      if (sel.has(order[i]) && !sel.has(order[i - 1])) {
        ;[order[i], order[i - 1]] = [order[i - 1], order[i]]
      }
    }
    const map = { ...page.nodes }
    order.forEach((id, i) => { if (map[id]) map[id].z = i + 1 })
    set((st) => ({
      doc: { ...st.doc, pages: st.doc.pages.map((p) => p.id !== page.id ? p : { ...p, order, nodes: map }) },
      dirty: true
    }))
  },

  group: (ids) => {
    const s = get()
    if (ids.length < 2) return
    s.commit('组合')
    const map = s.page().nodes
    const ns = ids.map((i) => map[i]).filter(Boolean)
    const b = unionRect(ns.map(nodeRect))
    const gid = newId('g')
    const groupNode: AnyNode = {
      id: gid, kind: 'group', x: b.x, y: b.y, w: b.w, h: b.h, rot: 0,
      z: s.maxZ() + 1, name: '组合'
    }
    set((st) => {
      const page = st.page()
      const nm = { ...page.nodes, [gid]: groupNode }
      for (const id of ids) nm[id] = { ...nm[id], parent: gid }
      return {
        doc: { ...st.doc, pages: st.doc.pages.map((p) => p.id !== page.id ? p : { ...p, nodes: nm, order: [...page.order, gid] }) },
        selection: [gid], dirty: true
      }
    })
  },

  ungroup: () => {
    const s = get()
    const map = s.page().nodes
    const groups = s.selection.filter((id) => map[id]?.kind === 'group')
    if (!groups.length) return
    s.commit('取消组合')
    const released: string[] = []
    set((st) => {
      const page = st.page()
      const nm = { ...page.nodes }
      for (const gid of groups) {
        for (const n of Object.values(nm)) if (n.parent === gid) { nm[n.id] = { ...n, parent: null }; released.push(n.id) }
        delete nm[gid]
      }
      return {
        doc: { ...st.doc, pages: st.doc.pages.map((p) => p.id !== page.id ? p : {
          ...p, nodes: nm, order: page.order.filter((i) => !groups.includes(i))
        }) },
        selection: released, dirty: true
      }
    })
  },

  align: (mode) => {
    const s = get()
    const sel = s.selected()
    if (sel.length < 2 && !sel.length) return
    s.commit('对齐')
    let box: Rect
    if (sel.length === 1) {
      const page = s.page()
      const nodes = Object.values(page.nodes).filter((n) => !n.hidden && !n.locked)
      if (!nodes.length) return
      box = unionRect(nodes.map((n) => rotatedBounds(nodeRect(n), n.rot)))
    } else {
      box = unionRect(sel.map((n) => rotatedBounds(nodeRect(n), n.rot)))
    }
    s.updateNodes(sel.map((n) => n.id), (n) => {
      if (n.rot) return
      const r = nodeRect(n)
      if (mode === 'left') n.x = box.x
      else if (mode === 'right') n.x = box.x + box.w - r.w
      else if (mode === 'hcenter') n.x = box.x + box.w / 2 - r.w / 2
      else if (mode === 'top') n.y = box.y
      else if (mode === 'bottom') n.y = box.y + box.h - r.h
      else if (mode === 'vcenter') n.y = box.y + box.h / 2 - r.h / 2
    })
  },

  distribute: (axis) => {
    const s = get()
    const sel = s.selected()
    if (sel.length < 3) return
    s.commit('分布')
    const items = sel.map((n) => ({ n, r: nodeRect(n) }))
    if (axis === 'h') {
      items.sort((a, b) => a.r.x - b.r.x)
      const start = items[0].r.x
      const end = items[items.length - 1].r.x + items[items.length - 1].r.w
      const totalW = items.reduce((t, i) => t + i.r.w, 0)
      const gap = (end - start - totalW) / (items.length - 1)
      let x = start
      const shift = new Map<string, number>()
      for (const i of items) { shift.set(i.n.id, x - i.r.x); x += i.r.w + gap }
      s.updateNodes([...shift.keys()], (n) => { n.x += shift.get(n.id) || 0 })
    } else {
      items.sort((a, b) => a.r.y - b.r.y)
      const start = items[0].r.y
      const end = items[items.length - 1].r.y + items[items.length - 1].r.h
      const totalH = items.reduce((t, i) => t + i.r.h, 0)
      const gap = (end - start - totalH) / (items.length - 1)
      let y = start
      const shift = new Map<string, number>()
      for (const i of items) { shift.set(i.n.id, y - i.r.y); y += i.r.h + gap }
      s.updateNodes([...shift.keys()], (n) => { n.y += shift.get(n.id) || 0 })
    }
  },

  commit: (label) => {
    const s = get()
    const snap: HistoryEntry = { doc: structuredClone(s.doc), label }
    const past = [...s.past, snap]
    if (past.length > HISTORY_LIMIT) past.shift()
    set({ past, future: [] })
  },

  undo: () => {
    const s = get()
    if (!s.past.length) return
    const prev = s.past[s.past.length - 1]
    const cur: HistoryEntry = { doc: structuredClone(s.doc), label: prev.label }
    set({
      doc: prev.doc,
      past: s.past.slice(0, -1),
      future: [cur, ...s.future].slice(0, HISTORY_LIMIT),
      selection: s.selection.filter((id) => prev.doc.pages.find((p) => p.id === s.doc.activePageId)?.nodes[id]),
      dirty: true
    })
  },

  redo: () => {
    const s = get()
    if (!s.future.length) return
    const next = s.future[0]
    const cur: HistoryEntry = { doc: structuredClone(s.doc), label: next.label }
    set({
      doc: next.doc,
      past: [...s.past, cur].slice(-HISTORY_LIMIT),
      future: s.future.slice(1),
      dirty: true
    })
  },

  autosave: () => {
    try {
      const s = get()
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), documentId: s.documentId, revision: s.revision, filePath: s.filePath, dirty: s.dirty, doc: s.doc }))
      set({ recoveryError: null })
    } catch (e) { set({ recoveryError: '自动恢复快照写入失败：' + String(e) }) }
  },

  restore: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const saved = JSON.parse(raw)
      const legacy = !saved.doc
      const doc = validateDocument(legacy ? saved : saved.doc)
      if (!legacy && (saved.version !== 1 || !Number.isSafeInteger(saved.revision) || saved.revision < 0 || !Number.isFinite(saved.savedAt) || saved.documentId !== doc.documentId || (saved.filePath !== null && typeof saved.filePath !== 'string') || saved.dirty !== true)) throw new Error('恢复快照元数据无效')
      get().loadDoc(doc, legacy ? null : saved.filePath)
      set({ documentId: doc.documentId || get().documentId, revision: legacy ? 1 : saved.revision, savedRevision: -1, dirty: true, recoveryError: null })
      return true
    } catch (e) { set({ recoveryError: '恢复快照读取失败：' + String(e) }); return false }
  }
}))

// Every document replacement through a domain operation advances one revision.
// View-only state updates do not. This also covers older commands that set doc directly.
let reconciling = false
useStore.subscribe((state, previous) => {
  if(reconciling)return
  if (!replacingDocument && state.doc !== previous.doc) {
    reconciling=true
    try {
      const doc=reconcileEngineering(state.doc,previous.doc)
      if(doc!==state.doc)for(const page of doc.pages){
        for(const n of Object.values(page.nodes))if(n.kind==='dfdProcess'||n.kind==='dfdStore')n.semantic={...n.semantic,notation:page.notation||'yourdon'}
        const messages=(Object.values(page.nodes).filter(n=>n.kind==='connector'&&n.messageY!==undefined) as LineNode[]).sort((a,b)=>a.messageY!-b.messageY!)
        messages.forEach((m,i)=>m.sequenceIndex=page.numberMessages===false?undefined:i+1)
        for(const n of Object.values(page.nodes)){
          if(n.kind==='sequenceParticipant'){n.lifeStart=messages.find(m=>m.relation==='createMessage'&&m.to?.nodeId===n.id)?.messageY;n.lifeEnd=messages.find(m=>m.relation==='destroyMessage'&&m.to?.nodeId===n.id)?.messageY;n.h=Math.max(n.h,...messages.filter(m=>m.from?.nodeId===n.id||m.to?.nodeId===n.id).map(m=>m.messageY!-n.y+40))}
          if(n.activationFor){const participant=page.nodes[n.activationFor];if(participant)n.x=participant.x+participant.w/2-n.w/2;const start=n.activationStart?page.nodes[n.activationStart] as LineNode:undefined,end=n.activationEnd?page.nodes[n.activationEnd] as LineNode:undefined;if(start?.messageY!==undefined)n.y=start.messageY;if(end?.messageY!==undefined)n.h=Math.max(8,end.messageY-n.y)}
          if(n.kind==='connector')Object.assign(n,reflowConnector(n,id=>page.nodes[id],Object.values(page.nodes)))
        }
        decorateConnections(page)
      }
    useStore.setState({doc,revision:state.revision+1,dirty:true})
    } finally {reconciling=false}
  }
})

/* 轻量命中检测（供 store 内使用） */
function hitNodeSimple(n: AnyNode, p: Pt): boolean {
  if (n.kind === 'group') {
    const map = useStore.getState().page().nodes
    const children = Object.values(map).filter((c) => c.parent === n.id)
    if (!children.length) return false
    return p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h
  }
  if (n.kind === 'line' || n.kind === 'pencil' || n.kind === 'connector') {
    const ln = n as LineNode
    if (!ln.points?.length) return false
    const pts = ln.points.map((q) => ({ x: n.x + q.x, y: n.y + q.y }))
    const tol = (ln.strokeWidth || 2) / 2 + 6
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const dx = b.x - a.x, dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
      t = Math.max(0, Math.min(1, t))
      if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= tol) return true
    }
    return false
  }
  return p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h
}

/* 连线几何：计算世界坐标点 */
export function computeConnectorPoints(ln: LineNode, getNode: (id: string) => AnyNode | undefined, obstacles:AnyNode[]=[]): Pt[] {
  if (ln.kind !== 'connector') {
    return (ln.points || []).map((p) => ({ x: ln.x + p.x, y: ln.y + p.y }))
  }
  const fromNode = ln.from?.nodeId ? getNode(ln.from.nodeId) : undefined
  const toNode = ln.to?.nodeId ? getNode(ln.to.nodeId) : undefined

  // 先定出起终点（side 为 auto 时按几何自动选边）
  const a0 = fromNode ? nodeRect(fromNode) : null
  const b0 = toNode ? nodeRect(toNode) : null
  const first = ln.points?.[0], last = ln.points?.[ln.points.length - 1]
  const aRaw = a0 ? rectCenter(a0) : first ? { x: ln.x + first.x, y: ln.y + first.y } : { x: ln.x, y: ln.y }
  const bRaw = b0 ? rectCenter(b0) : last ? { x: ln.x + last.x, y: ln.y + last.y } : { x: ln.x + ln.w, y: ln.y + ln.h }
  const aSide = a0
    ? (ln.from!.side && ln.from!.side !== 'auto' ? ln.from!.side : autoSide(a0, aRaw, bRaw))
    : null
  const bSide = b0
    ? (ln.to!.side && ln.to!.side !== 'auto' ? ln.to!.side : autoSide(b0, bRaw, aRaw))
    : null

  const a = a0 && aSide ? sideAnchor(a0, aSide) : aRaw
  const b = b0 && bSide ? sideAnchor(b0, bSide) : bRaw
  const applyPort=(n:AnyNode|undefined,ep:LineNode['from'],p:Pt,side:string|null)=>{
    if(!n||!ep?.portId)return
    const field=n.semantic?.fields?.findIndex(f=>f.id===ep.portId)??-1
    if(field>=0){p.x=side==='left'?n.x:n.x+n.w;p.y=n.y+40+Math.max(22,((n as ShapeNode).fontSize||14)*1.6)*(field+.5);return}
    const port=n.semantic?.ports?.find(f=>f.id===ep.portId)
    if(port){const side=port.side==='auto'?'right':port.side;Object.assign(p,sideAnchor(nodeRect(n),side));if(side==='top'||side==='bottom')p.x=n.x+n.w*port.offset;else p.y=n.y+n.h*port.offset}
  }
  applyPort(fromNode,ln.from,a,aSide);applyPort(toNode,ln.to,b,bSide)
  if(fromNode?.rot)Object.assign(a,rotatePoint(a,rectCenter(nodeRect(fromNode)),fromNode.rot))
  if(toNode?.rot)Object.assign(b,rotatePoint(b,rectCenter(nodeRect(toNode)),toNode.rot))
  if(ln.messageY!==undefined&&fromNode&&toNode){a.x=fromNode.x+fromNode.w/2;b.x=toNode.x+toNode.w/2;a.y=b.y=ln.messageY;if(fromNode.id===toNode.id)return [a,{x:a.x+65,y:a.y},{x:a.x+65,y:a.y+22},{x:a.x,y:a.y+22}];return [a,b]}
  const route = ln.route || 'straight'
  if (ln.bends?.length) return [a, ...ln.bends, b]
  if (route === 'straight') return [a, b]
  if (route === 'curve') return routeCurve(a, b)
  const bias: 'h' | 'v' = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
  if(ln.avoidObstacles)return routeAvoiding(a,b,obstacles,ln.from?.nodeId,ln.to?.nodeId)
  return routeOrthogonal(a, b, bias)
}

/** 连线随端点重算 x/y/w/h + points */
export function reflowConnector(ln: LineNode, getNode: (id: string) => AnyNode | undefined, obstacles:AnyNode[]=[]): LineNode {
  const pts = computeConnectorPoints(ln, getNode,obstacles)
  const b = boundsOfPts(pts, 0)
  const minX = Math.min(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  return {
    ...ln,
    rot:0,
    x: minX, y: minY,
    w: Math.max(1, b.x + b.w - minX),
    h: Math.max(1, b.y + b.h - minY),
    points: pts.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  }
}
