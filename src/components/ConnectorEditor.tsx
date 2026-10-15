import { useEffect, useRef } from 'react'
import { computeConnectorPoints, reflowConnector, useStore } from '../store/board'
import type { Camera, LineNode } from '../types'
import { hitTestNode, type Pt } from '../engine/geometry'
import { nodePoly } from '../engine/shapes'
import { inheritedFlag } from '../engine/hierarchy'
import { lineLabels } from '../engine/engineering-visual'

export default function ConnectorEditor({ cam }: { cam: Camera }) {
  const s = useStore()
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ index: number; original: LineNode; points: Pt[] } | null>(null)
  const labelDrag=useRef<{slot:'start'|'middle'|'end';original:LineNode;start:Pt}|null>(null)
  const node = s.selection.length === 1 ? s.page().nodes[s.selection[0]] : null
  const active=s.tool==='select' && node?.kind==='connector' && !inheritedFlag(node,s.page().nodes,'locked') && !inheritedFlag(node,s.page().nodes,'hidden')
  const points = node?.kind==='connector' ? computeConnectorPoints(node, id => s.page().nodes[id]) : []
  const world = (e: {clientX:number;clientY:number}): Pt => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left - cam.x) / cam.zoom, y: (e.clientY - rect.top - cam.y) / cam.zoom }
  }
  const update = (e: {clientX:number;clientY:number}) => {
    const label=labelDrag.current
    if(label){const p=world(e),old=label.original.labelOffsets?.[label.slot]||{x:0,y:0};useStore.getState().updateNode(label.original.id,{labelOffsets:{...label.original.labelOffsets,[label.slot]:{x:old.x+p.x-label.start.x,y:old.y+p.y-label.start.y}}});return}
    const d = drag.current
    if (!d) return
    const p = world(e), st = useStore.getState(), page = st.page()
    const ln = structuredClone(d.original)
    const pts = structuredClone(d.points)
    if (d.index === 0 || d.index === pts.length - 1) {
      const target = [...page.order].reverse().map(id => page.nodes[id]).find(n => n &&
        !['connector', 'line', 'pencil', 'group'].includes(n.kind) &&
        !inheritedFlag(n, page.nodes, 'locked') && !inheritedFlag(n, page.nodes, 'hidden') && hitTestNode(n, p, nodePoly(n), 5 / cam.zoom))
      pts[d.index] = p
      if (d.index === 0) ln.from = target ? { nodeId: target.id, side: 'auto' } : undefined
      else ln.to = target ? { nodeId: target.id, side: 'auto' } : undefined
      const x = Math.min(...pts.map(q => q.x)), y = Math.min(...pts.map(q => q.y))
      ln.x = x; ln.y = y; ln.w = Math.max(1, Math.max(...pts.map(q => q.x)) - x); ln.h = Math.max(1, Math.max(...pts.map(q => q.y)) - y)
      ln.points = pts.map(q => ({ x: q.x - x, y: q.y - y }))
      if (!ln.from || !ln.to) {
        st.updateNode(ln.id, ln)
        return
      }
    } else {
      pts[d.index] = p
      if (ln.route === 'orthogonal') {
        const prev = d.points[d.index - 1], orig = d.points[d.index], next = d.points[d.index + 1]
        if (d.index > 1) {
          if (Math.abs(prev.x - orig.x) < .01) pts[d.index - 1].x = p.x
          else pts[d.index - 1].y = p.y
        }
        if (d.index < pts.length - 2) {
          if (Math.abs(next.x - orig.x) < .01) pts[d.index + 1].x = p.x
          else pts[d.index + 1].y = p.y
        }
      }
      ln.bends = pts.slice(1, -1)
    }
    st.updateNode(ln.id, reflowConnector(ln, id => page.nodes[id]))
  }
  useEffect(() => {
    const end=()=>{drag.current=null;labelDrag.current=null}
    window.addEventListener('pointermove',update); window.addEventListener('pointerup',end); window.addEventListener('pointercancel',end)
    return ()=>{window.removeEventListener('pointermove',update);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end)}
  },[cam])
  if(!active || node?.kind!=='connector') return null
  return <svg ref={svgRef} className="vector-editor" style={{ pointerEvents: 'none' }}>
    {lineLabels(node,points).map(l=><rect key={l.slot} x={l.x*cam.zoom+cam.x-4} y={l.y*cam.zoom+cam.y-18} width={8} height={8} fill="#5B8CFF" stroke="#fff" style={{pointerEvents:'all',cursor:'move'}} onPointerDown={e=>{e.preventDefault();e.stopPropagation();e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId);s.commit('拖动关系标签');labelDrag.current={slot:l.slot,original:structuredClone(node),start:world(e)}}}><title>{l.slot==='start'?'起点':l.slot==='end'?'终点':'中间'}标签：拖动调整位置</title></rect>)}
    {points.map((p, index) => <circle key={index} cx={p.x * cam.zoom + cam.x} cy={p.y * cam.zoom + cam.y}
      r={index === 0 || index === points.length - 1 ? 6 : 4.5} fill="#fff" stroke="#5B8CFF" strokeWidth={1.5}
      style={{ pointerEvents: 'all', cursor: 'move' }}
      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId);
        s.commit('编辑连线端点或折点'); drag.current = { index, original: structuredClone(node), points } }}
      >
      <title>{index === 0 || index === points.length - 1 ? '拖动端点以重新绑定图形' : '拖动折点；属性面板可恢复自动路由'}</title>
    </circle>)}
  </svg>
}
