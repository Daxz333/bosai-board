import { useState } from 'react';
import { useStore } from '../store/board';
import { reachableModels, setTrace, traceCsv, traceLinks } from '../engine/traceability';
import { downloadText } from './EngineeringWorkspace';
export default function TracePanel() {
    const s = useStore(), [filter, setFilter] = useState(''), models = Object.values(s.doc.models || {}), requirements = models.filter(m => m.kind === 'requirement'), links = traceLinks(s.doc);
    return <><p className="eng-hint">需求—用例—设计—测试追踪。勾选创建 trace 关系；查询包含间接关联。需求和测试使用独立对象，SysML / ArchiMate 完整规范另行扩充。</p><input aria-label="追踪对象筛选" value={filter} placeholder="筛选目标模型名称" onChange={e => setFilter(e.target.value)}/><button className="wide-btn" onClick={() => downloadText(s.doc.title + '-需求追踪矩阵.csv', traceCsv(s.doc), 'text/csv')}>导出可查询追踪矩阵 CSV</button>{!requirements.length && <p className="eng-hint">先从“需求追踪”图形库放置需求，或插入需求追踪模板。</p>}{requirements.map(r => { const reached = new Set(reachableModels(s.doc, r.id)); return <div className="member-card" key={r.id}><strong>{r.data.code} · {r.name}</strong>{models.filter(m => m.id !== r.id && m.name.includes(filter)).slice(0, 200).map(target => { const direct = links.some(l => l.from === r.id && l.to === target.id); return <label className="trace-row" key={target.id}><input type="checkbox" checked={direct} onChange={e => s.editDoc('修改需求追踪', doc => setTrace(doc, r.id, target.id, e.target.checked))}/><span>{target.name}</span><small>{direct ? '直接' : reached.has(target.id) ? '间接' : '未关联'}</small></label>; })}</div>; })}</>;
}
