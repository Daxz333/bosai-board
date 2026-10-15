import type { AnyNode, DictionaryEntry, LineNode } from '../types';
import { newId } from '../types';
import { useStore } from '../store/board';
import { renumberMessages } from '../engine/engineering-commands';
export function MessageGrouping({ message }: {
    message: LineNode;
}) {
    const s = useStore(), frames = Object.values(s.page().nodes).filter(n => n.kind === 'sequenceFragment'), frame = message.fragmentId ? s.page().nodes[message.fragmentId] : undefined;
    const change = (patch: Partial<LineNode>) => s.editDoc('修改消息片段 / 分支', doc => { const page = doc.pages.find(p => p.id === s.page().id)!; Object.assign(page.nodes[message.id], patch); renumberMessages(page); });
    return <><select aria-label="消息组合片段" value={message.fragmentId || ''} onChange={e => change({ fragmentId: e.target.value || undefined, fragmentBranch: 0 })}><option value="">不属于组合片段</option>{frames.map(n => <option key={n.id} value={n.id}>{n.semantic?.fragment}: {n.semantic?.condition}</option>)}</select>{frame && <select aria-label="消息条件分支" value={message.fragmentBranch || 0} onChange={e => change({ fragmentBranch: Number(e.target.value) })}><option value={0}>[{frame.semantic?.condition || '条件'}]</option>{['alt', 'par'].includes(frame.semantic?.fragment || '') && <option value={1}>[{frame.semantic?.secondCondition || '其他'}]</option>}</select>}</>;
}
export function DictionaryFlowReferences({ entry }: {
    entry: DictionaryEntry;
}) {
    const s = useStore(), flows = s.doc.pages.flatMap(p => (Object.values(p.nodes).filter(n => n.kind === 'connector' && (n.relation === 'dataFlow' || p.diagramType === 'dfd')) as LineNode[]).map(n => ({ page: p, line: n })));
    return <label className="eng-field"><span>引用的数据流</span><select multiple aria-label="字典数据流引用" value={entry.flowIds || []} onChange={e => s.editDoc('修改字典数据流引用', doc => { doc.dictionary!.find(x => x.id === entry.id)!.flowIds = [...e.target.selectedOptions].map(o => o.value); })}>{flows.map(({ page, line }) => <option value={line.id} key={line.id}>{page.name}: {line.text || '未命名'}</option>)}</select></label>;
}
export function TimingEditor({ node }: {
    node: AnyNode;
}) {
    const s = useStore(), data = node.semantic || {}, states = data.timingStates || [], events = data.timeEvents || [];
    const patch = (next: typeof data, label?: string) => s.updateNode(node.id, { semantic: next }, label);
    return <div className="engineering-members"><strong>状态与时间事件</strong><label className="eng-field"><span>状态（每行一个）</span><textarea aria-label="时间线状态" rows={3} value={states.join('\n')} onFocus={() => s.commit('编辑时间线状态')} onChange={e => patch({ ...data, timingStates: e.target.value.split('\n').filter(v => v.trim()) })}/></label>{events.map((event, index) => <div className="member-card" key={event.id}><div className="member-row"><input aria-label={`时间事件${index + 1}时刻`} type="number" min={0} value={event.time} onFocus={() => s.commit('编辑时间事件')} onChange={e => patch({ ...data, timeEvents: events.map((v, i) => i === index ? { ...v, time: Math.max(0, Number(e.target.value) || 0) } : v) })}/><select aria-label={`时间事件${index + 1}状态`} value={event.state} onChange={e => patch({ ...data, timeEvents: events.map((v, i) => i === index ? { ...v, state: e.target.value } : v) }, '修改时间事件状态')}>{states.map(state => <option key={state}>{state}</option>)}</select><button onClick={() => patch({ ...data, timeEvents: events.filter((_, i) => i !== index) }, '删除时间事件')}>×</button></div><input aria-label={`时间事件${index + 1}标签`} value={event.label} placeholder="触发 / 消息" onFocus={() => s.commit('编辑事件标签')} onChange={e => patch({ ...data, timeEvents: events.map((v, i) => i === index ? { ...v, label: e.target.value } : v) })}/></div>)}<button className="wide-btn" onClick={() => patch({ ...data, timeEvents: [...events, { id: newId('event'), time: Math.max(0, ...events.map(e => e.time)) + 10, state: states[0] || '空闲', label: '' }] }, '添加时间事件')}>＋ 时间事件</button></div>;
}
