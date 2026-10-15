import { useState, type ReactNode } from 'react';
import type { DiagramType, LineNode, ShapeNode } from '../types';
import { newId } from '../types';
import { useStore } from '../store/board';
import { DIAGRAMS, RELATIONS, diagramIssues } from '../engine/engineering';
import { TEMPLATES, diagramPage, documentMarkdown, insertTemplate, putRelation, renumberMessages, deleteMessage, reuseModel } from '../engine/engineering-commands';
import { layoutDiagram } from '../engine/engineering-layout';
import TextModelDialog from './TextModelDialog';
import AiDraftDialog from './AiDraftDialog';
import TracePanel from './TracePanel';
import { MessageGrouping, DictionaryFlowReferences } from './EngineeringEditors';
export async function downloadText(name: string, text: string, type = 'text/plain') {
    const api = (window as any).boardAPI;
    if (api?.exportText) {
        try {
            const ext = name.split('.').pop() || 'txt', result = await api.exportText({ defaultName: name, content: text, ext, name: ext.toUpperCase() });
            if (!result.ok && !result.canceled)
                alert('导出失败：' + result.error);
        }
        catch (e) {
            alert('导出失败：' + (e as Error).message);
        }
        return;
    }
    const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function DiagramBar({ startAction, endAction }: { startAction?: ReactNode; endAction?: ReactNode }) {
    const s = useStore(), p = s.page(), [templates, setTemplates] = useState(false), [io, setIo] = useState(false), [ai, setAi] = useState(false), [newType, setNewType] = useState<DiagramType>('useCase');
    return <><div className="diagram-bar">
    {startAction}
    {p.parentPageId && <button onClick={() => { s.setActivePage(p.parentPageId!); s.fitView(); }}>← 父图</button>}
    <select aria-label="当前图类型" value={p.diagramType || 'free'} onChange={e => s.editDoc('修改图类型', doc => { doc.pages.find(x => x.id === p.id)!.diagramType = e.target.value as DiagramType; })}>{DIAGRAMS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
    {p.diagramType === 'dfd' && <><select aria-label="DFD 符号规范" value={p.notation || 'yourdon'} onChange={e => s.editDoc('切换 DFD 表示', doc => { doc.pages.find(x => x.id === p.id)!.notation = e.target.value as 'yourdon' | 'gane'; })}><option value="yourdon">Yourdon / DeMarco</option><option value="gane">Gane-Sarson</option></select><input aria-label="DFD 层级名称" title="层级名称可按教材自定义" value={p.levelLabel || ''} placeholder="层级名称" onFocus={() => s.commit('编辑层级名称')} onChange={e => { const doc = structuredClone(s.doc); doc.pages.find(x => x.id === p.id)!.levelLabel = e.target.value; useStore.setState({ doc }); }}/></>}
    <button onClick={() => setTemplates(true)}>＋ 新建图 / 模板</button><button onClick={() => setIo(true)}>文本 / SQL / drawio</button>
    <button onClick={() => setAi(true)}>AI 草稿</button>
    <span className="diagram-bar-spacer" />{endAction}
  </div>
  {templates && <div className="modal-mask" onClick={() => setTemplates(false)}><div className="engineering-dialog" role="dialog" aria-label="专业图模板" onClick={e => e.stopPropagation()}><div className="engineering-dialog-head"><h2>新建软件工程图</h2><button onClick={() => setTemplates(false)}>×</button></div><div className="member-row"><select aria-label="新建图类型" value={newType} onChange={e => setNewType(e.target.value as DiagramType)}>{DIAGRAMS.map(d => <option value={d.id} key={d.id}>{d.label}</option>)}</select><button className="wide-btn" onClick={() => { s.editDoc('新建专业图', doc => { const next = diagramPage(newType); doc.pages.push(next); doc.activePageId = next.id; }); s.fitView(); setTemplates(false); }}>新建空白图</button></div><p>模板插入为新页面，所有对象均可编辑和撤销。</p><div className="template-grid">{TEMPLATES.map(t => <button key={t.id} onClick={() => { s.editDoc('插入' + t.name, doc => insertTemplate(doc, t.id)); s.fitView(); setTemplates(false); }}><strong>{t.name}</strong><span>{t.description}</span></button>)}</div></div></div>}
  {io && <TextModelDialog onClose={() => setIo(false)}/>} {ai && <AiDraftDialog onClose={() => setAi(false)}/>}</>;
}
export default function EngineeringWorkspace() {
    const s = useStore(), p = s.page(), issues = diagramIssues(s.doc), [section, setSection] = useState('rules'), [filter, setFilter] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [message, setMessage] = useState('消息'), [relation, setRelation] = useState<NonNullable<LineNode['relation']>>('syncMessage');
    const locate = (pageId: string, id?: string) => {
        s.setActivePage(pageId);
        if (id) {
            s.select([id]);
            s.zoomToSelection();
        }
        else
            s.fitView();
    };
    const messages = (Object.values(p.nodes).filter(n => n.kind === 'connector' && n.messageY !== undefined) as LineNode[]).sort((a, b) => a.messageY! - b.messageY!), participants = Object.values(p.nodes).filter(n => n.kind === 'sequenceParticipant') as ShapeNode[];
    const updateDictionary = (id: string, patch: Record<string, unknown>) => { const doc = structuredClone(s.doc); doc.dictionary = doc.dictionary?.map(e => e.id === id ? { ...e, ...patch } : e); useStore.setState({ doc }); };
    return <div className="engineering-workspace"><div className="panel-title">软件工程建模</div><div className="engineering-tabs">{[['rules', '规则'], ['dictionary', '字典'], ['messages', '消息'], ['models', '模型'], ['delivery', '交付']].map(([key, label]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}>{label}</button>)}</div>
    <button className={`wide-btn ${section === 'trace' ? 'active' : ''}`} onClick={() => setSection('trace')}>需求追踪矩阵</button>
    {section === 'trace' && <TracePanel />}
    {section === 'rules' && <><p className="eng-hint">提示允许保留特殊表达；数据流是否在业务上合理仍需人工判断。</p>{issues.length === 0 ? <p className="eng-hint">当前工程未发现基础规则问题。</p> : issues.map((issue, i) => <button className={`issue-card ${issue.severity}`} key={i} onClick={() => locate(issue.pageId, issue.nodeId)}><span>{s.doc.pages.find(p => p.id === issue.pageId)?.name} · {issue.severity === 'info' ? '方向提示' : '检查提示'}</span>{issue.message}</button>)}</>}
    {section === 'dictionary' && <><p className="eng-hint">数据流、存储和数据项的定义。引用指向稳定模型。</p>{(s.doc.dictionary || []).map(e => <div className="member-card" key={e.id}><div className="member-row"><select aria-label="字典类型" value={e.kind} onChange={ev => s.editDoc('修改字典类型', doc => { doc.dictionary!.find(d => d.id === e.id)!.kind = ev.target.value as typeof e.kind; })}><option value="flow">数据流</option><option value="store">存储</option><option value="item">数据项</option></select><button onClick={() => s.editDoc('删除字典条目', doc => { doc.dictionary = doc.dictionary!.filter(d => d.id !== e.id); })}>×</button></div><input aria-label="字典名称" value={e.name} placeholder="名称" onFocus={() => s.commit('编辑字典')} onChange={ev => updateDictionary(e.id, { name: ev.target.value })}/><textarea aria-label="字典定义" rows={3} value={e.definition} placeholder="定义" onFocus={() => s.commit('编辑字典')} onChange={ev => updateDictionary(e.id, { definition: ev.target.value })}/><select multiple aria-label="字典模型引用" value={e.modelIds} onChange={ev => s.editDoc('修改字典引用', doc => { doc.dictionary!.find(d => d.id === e.id)!.modelIds = [...ev.target.selectedOptions].map(o => o.value); })}>{Object.values(s.doc.models || {}).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><DictionaryFlowReferences entry={e}/></div>)}<button className="wide-btn" onClick={() => s.editDoc('添加字典条目', doc => { (doc.dictionary || (doc.dictionary = [])).push({ id: newId('dict'), kind: 'item', name: '新数据项', definition: '', modelIds: [] }); })}>＋ 数据字典条目</button></>}
    {section === 'messages' && <>{p.diagramType !== 'sequence' ? <p className="eng-hint">切换到时序图后编辑消息列表。</p> : <><label className="member-flags"><input type="checkbox" checked={p.numberMessages !== false} onChange={e => s.editDoc('切换消息编号', doc => { const page = doc.pages.find(x => x.id === p.id)!; page.numberMessages = e.target.checked; renumberMessages(page); })}/>自动编号</label>{messages.map((m, i) => <div className="member-card" key={m.id}><div className="member-row"><button onClick={() => locate(p.id, m.id)}>{i + 1}</button><input aria-label={`消息${i + 1}内容`} value={m.text || ''} onFocus={() => s.commit('编辑时序消息')} onChange={e => s.updateNode(m.id, { text: e.target.value })}/></div><select aria-label={`消息${i + 1}发送者`} value={m.from?.nodeId || ''} onChange={e => s.updateNode(m.id, { from: { nodeId: e.target.value, side: 'auto' } }, '修改消息发送者')}>{participants.map(n => <option value={n.id} key={n.id}>{n.text}</option>)}</select><select aria-label={`消息${i + 1}接收者`} value={m.to?.nodeId || ''} onChange={e => s.updateNode(m.id, { to: { nodeId: e.target.value, side: 'auto' } }, '修改消息接收者')}>{participants.map(n => <option value={n.id} key={n.id}>{n.text}</option>)}</select><select aria-label={`消息${i + 1}类型`} value={m.relation || 'syncMessage'} onChange={e => s.editDoc('修改消息类型', doc => { Object.assign(doc.pages.find(x => x.id === p.id)!.nodes[m.id], relationPatchForMessage(e.target.value, m)); })}>{RELATIONS.filter(r => r.diagrams?.includes('sequence')).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select><MessageGrouping message={m}/><div className="member-row">{([-1, 1] as const).map(dir => <button key={dir} disabled={i + dir < 0 || i + dir >= messages.length} onClick={() => s.editDoc('重排时序消息', doc => { const ids = messages.map(m => m.id); [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]; renumberMessages(doc.pages.find(x => x.id === p.id)!, ids); })}>{dir < 0 ? '↑' : '↓'}</button>)}<button onClick={() => s.editDoc('删除时序消息', doc => { deleteMessage(doc, p.id, m.id); })}>删除</button></div></div>)}<div className="member-card"><strong>新增消息</strong><select aria-label="新消息发送者" value={from} onChange={e => setFrom(e.target.value)}><option value="">发送者</option>{participants.map(n => <option key={n.id} value={n.id}>{n.text}</option>)}</select><select aria-label="新消息接收者" value={to} onChange={e => setTo(e.target.value)}><option value="">接收者</option>{participants.map(n => <option key={n.id} value={n.id}>{n.text}</option>)}</select><select value={relation} onChange={e => setRelation(e.target.value as typeof relation)}>{RELATIONS.filter(r => r.diagrams?.includes('sequence')).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select><input value={message} onChange={e => setMessage(e.target.value)}/><button disabled={!from || !to} className="wide-btn" onClick={() => s.editDoc('添加时序消息', doc => { const page = doc.pages.find(x => x.id === p.id)!; putRelation(page, page.nodes[from], page.nodes[to], relation, message, { messageY: Math.max(100, ...messages.map(m => m.messageY!)) + 48 }); renumberMessages(page); })}>＋ 添加消息</button></div></>}</>}
    {section === 'models' && <><input aria-label="搜索模型引用" placeholder="搜索统一模型名称" value={filter} onChange={e => setFilter(e.target.value)}/>{Object.values(s.doc.models || {}).filter(m => m.name.includes(filter)).map(m => <div className="member-card" key={m.id}><strong>{m.name} · {m.kind}</strong>{s.doc.pages.flatMap(page => Object.values(page.nodes).filter(n => n.modelId === m.id).map(n => <button key={n.id} className="wide-btn" onClick={() => locate(page.id, n.id)}>定位：{page.name}</button>))}<button className="wide-btn" onClick={() => s.editDoc('复用模型视图', doc => { reuseModel(doc, m.id, p.id); })}>在当前图中复用</button></div>)}</>}
    {section === 'delivery' && <><div className="group-label">自动布局</div><p className="eng-hint">选中节点时只布局选区；保留锁定位置；操作可撤销。</p>{(['layered', 'tree', 'orthogonal'] as const).map((mode, i) => <button key={mode} className="wide-btn" onClick={() => { s.editDoc('自动布局', doc => layoutDiagram(doc.pages.find(x => x.id === p.id)!, mode, s.selection)); s.fitView(); }}>{['分层布局', '树形布局', '正交网格布局'][i]}</button>)}<div className="group-label">文档交付</div><button className="wide-btn" onClick={() => downloadText(s.doc.title + '-模型规约.md', documentMarkdown(s.doc), 'text/markdown')}>导出规约 / 字典 / 模型 / 关系</button><div className="eng-field"><span>打印页面（像素，96 DPI）</span><select value={p.print?.width || 794} onChange={e => s.editDoc('修改打印尺寸', doc => { doc.pages.find(x => x.id === p.id)!.print = { width: Number(e.target.value), height: Number(e.target.value) === 794 ? 1123 : 794, margin: p.print?.margin || 40 }; })}><option value={794}>A4 纵向</option><option value={1123}>A4 横向</option></select><label>页边距<input aria-label="打印页边距" type="number" min="0" max="300" value={p.print?.margin ?? 40} onChange={e => s.editDoc('修改页边距', doc => { doc.pages.find(x => x.id === p.id)!.print = { width: p.print?.width || 794, height: p.print?.height || 1123, margin: Math.max(0, Math.min(300, Number(e.target.value))) }; })}/></label></div><p className="eng-hint">图片 / SVG 使用现有导出；图册通过下方入口生成带页码的打印预览。</p><button className="wide-btn" onClick={() => window.dispatchEvent(new CustomEvent('bosai:print-atlas'))}>图册打印 / PDF</button></>}
  </div>;
}
import { relationPatch } from '../engine/engineering';
const relationPatchForMessage = (id: string, m: LineNode) => relationPatch(id as NonNullable<LineNode['relation']>, m);
