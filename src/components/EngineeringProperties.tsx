import type { AnyNode, EngineeringData, LineNode, ModelField, ShapeNode, Side } from '../types';
import { newId } from '../types';
import { useStore } from '../store/board';
import { MARKERS, RELATIONS, isProfessional, relationPatch, symbolDefinition } from '../engine/engineering';
import { childDiagram } from '../engine/engineering-commands';
import { TimingEditor } from './EngineeringEditors';
function Members({ node, field, title }: {
    node: AnyNode;
    field: 'attributes' | 'operations' | 'fields';
    title: string;
}) {
    const s = useStore(), members = node.semantic?.[field] || [], table = field === 'fields';
    const set = (items: ModelField[], label?: string) => s.updateNode(node.id, { semantic: { ...node.semantic, [field]: items } }, label);
    const update = (index: number, patch: Partial<ModelField>) => set(members.map((f, i) => i === index ? { ...f, ...patch } : f));
    return <div className="engineering-members"><strong>{title}</strong>
    {members.map((f, i) => <div className="member-card" key={f.id}>
      <div className="member-row">{!table && <select aria-label={`${title}${i + 1}可见性`} value={f.visibility || '+'} onChange={e => { s.commit('修改可见性'); update(i, { visibility: e.target.value as ModelField['visibility'] }); }}>{['+', '-', '#', '~'].map(v => <option key={v}>{v}</option>)}</select>}
        <input aria-label={`${title}${i + 1}名称`} value={f.name} onFocus={() => s.commit(`编辑${title}`)} onChange={e => update(i, { name: e.target.value })} placeholder="名称"/>
        <button title="删除成员" onClick={() => set(members.filter((_, index) => index !== i), '删除成员')}>×</button></div>
      <input aria-label={`${title}${i + 1}类型`} value={f.type} onFocus={() => s.commit('编辑类型')} onChange={e => update(i, { type: e.target.value })} placeholder={field === 'operations' ? '返回类型' : '类型'}/>
      {field === 'operations' && <input aria-label={`方法${i + 1}参数`} value={f.parameters || ''} onFocus={() => s.commit('编辑参数')} onChange={e => update(i, { parameters: e.target.value })} placeholder="参数，如 id: String"/>}
      {table && <div className="member-flags">{([['primary', 'PK'], ['foreign', 'FK'], ['nullable', '可空']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={!!f[key]} onChange={e => { s.commit('修改字段约束'); update(i, { [key]: e.target.checked }); }}/>{label}</label>)}</div>}
    </div>)}
    <button className="wide-btn" onClick={() => set([...members, { id: newId('field'), name: field === 'operations' ? 'operation' : 'field', type: field === 'operations' ? 'void' : table ? 'INTEGER' : 'String', visibility: '+', ...(field === 'operations' ? { parameters: '' } : {}), ...(table ? { nullable: false } : {}) }], `添加${title}`)}>＋ 添加{title}</button>
  </div>;
}
export default function EngineeringProperties({ node }: {
    node: AnyNode;
}) {
    const s = useStore(), d = node.semantic || {}, line = node.kind === 'connector' ? node as LineNode : null;
    const input = (key: keyof EngineeringData, label: string, multiline = false) => <label className="eng-field" key={key}><span>{label}</span>{multiline ? <textarea rows={3} aria-label={label} value={String(d[key] || '')} onFocus={() => s.commit(`编辑${label}`)} onChange={e => s.updateNode(node.id, { semantic: { ...d, [key]: e.target.value } })}/> : <input aria-label={label} value={String(d[key] || '')} onFocus={() => s.commit(`编辑${label}`)} onChange={e => s.updateNode(node.id, { semantic: { ...d, [key]: e.target.value } })}/>}</label>;
    if (line) {
        const patch = (p: Partial<LineNode>, label = '编辑专业关系') => s.updateNode(line.id, p, label);
        const endpoint = (key: 'from' | 'to') => { const ep = line[key], target = ep ? s.page().nodes[ep.nodeId] : undefined; return <div key={key} className="eng-field"><span>{key === 'from' ? '起点' : '终点'}连接点</span><select aria-label={key === 'from' ? '起点连接点' : '终点连接点'} value={ep?.portId || ''} disabled={!target} onChange={e => patch({ [key]: { ...ep, side: ep?.side || 'auto', portId: e.target.value || undefined } })}><option value="">自动边缘</option>{[...(target?.semantic?.fields || []), ...(target?.semantic?.ports || [])].map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select><select aria-label={`${key}连接边`} value={ep?.side || 'auto'} disabled={!target} onChange={e => patch({ [key]: { ...ep, side: e.target.value as Side } })}>{['auto', 'left', 'right', 'top', 'bottom'].map((v, i) => <option value={v} key={v}>{['自动', '左', '右', '上', '下'][i]}</option>)}</select></div>; };
        return <div className="engineering-props"><div className="group-label">专业关系</div>
      <select aria-label="关系类型" value={line.relation || ''} onChange={e => patch(relationPatch(e.target.value as NonNullable<LineNode['relation']>, line))}><option value="" disabled>选择语义关系</option>{RELATIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      <p className="eng-hint">{RELATIONS.find(r => r.id === line.relation)?.hint}</p>
      {(['startMarker', 'endMarker'] as const).map((key, i) => <label className="eng-field" key={key}><span>{i ? '终点标记' : '起点标记'}</span><select aria-label={i ? '终点标记' : '起点标记'} value={line[key] || 'none'} onChange={e => patch({ [key]: e.target.value })}>{MARKERS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>)}
      {([['startLabel', '起点标签'], ['startRole', '起点角色'], ['startMultiplicity', '起点多重性'], ['endLabel', '终点标签'], ['endRole', '终点角色'], ['endMultiplicity', '终点多重性']] as const).map(([key, label]) => <label className="eng-field" key={key}><span>{label}</span><input aria-label={label} value={line[key] || ''} onFocus={() => s.commit('编辑关系标签')} onChange={e => s.updateNode(line.id, { [key]: e.target.value })}/></label>)}
      {endpoint('from')}{endpoint('to')}
      {line.relation === 'communicationMessage' && <label className="eng-field"><span>消息编号，如 1.1</span><input aria-label="通信消息编号" value={line.messageNumber || ''} onFocus={() => s.commit('编辑通信消息编号')} onChange={e => s.updateNode(line.id, { messageNumber: e.target.value })}/></label>}
      <label className="member-flags"><input type="checkbox" checked={!!line.avoidObstacles} onChange={e => patch({ avoidObstacles: e.target.checked, route: 'orthogonal', bends: undefined }, '切换节点避让')}/>正交节点避让</label>
      <label className="member-flags"><input type="checkbox" checked={!!line.jumpLines} onChange={e => patch({ jumpLines: e.target.checked, route: 'orthogonal' }, '切换交叉跳线')}/>交叉跳线</label>
      <label className="member-flags"><input type="checkbox" checked={!!line.avoidLabels} onChange={e => patch({ avoidLabels: e.target.checked }, '切换标签避让')}/>中间标签避让节点</label>
      <button className="wide-btn" onClick={() => patch({ from: line.to, to: line.from, points: [...(line.points || [])].reverse(), bends: line.bends ? [...line.bends].reverse() : undefined, startLabel: line.endLabel, endLabel: line.startLabel, startRole: line.endRole, endRole: line.startRole, startMultiplicity: line.endMultiplicity, endMultiplicity: line.startMultiplicity, labelOffsets: { ...line.labelOffsets, start: line.labelOffsets?.end, end: line.labelOffsets?.start } }, '反向关系')}>⇄ 反向关系</button>
      <p className="eng-hint">选中连线后，可拖动三个标签的蓝色小方块。</p>
    </div>;
    }
    if (!isProfessional(node))
        return null;
    return <div className="engineering-props"><div className="group-label">{symbolDefinition(node.kind)?.label} · 模型属性</div>
    <label className="eng-field"><span>名称</span><input aria-label="模型名称" value={(node as ShapeNode).text || ''} onFocus={() => s.commit('编辑模型名称')} onChange={e => s.updateNode(node.id, { text: e.target.value } as Partial<ShapeNode>)}/></label>
    {input('code', '编号')}{input('stereotype', '构造型 stereotype')}
    {node.kind === 'timingLifeline' && <TimingEditor node={node}/>}
    {node.kind === 'interfacePort' && <label className="eng-field"><span>接口类型</span><select aria-label="接口类型" value={d.stereotype || 'provided'} onChange={e => s.updateNode(node.id, { semantic: { ...d, stereotype: e.target.value } }, '修改接口类型')}><option value="provided">提供接口</option><option value="required">所需接口</option></select></label>}
    {node.kind === 'historyState' && <label className="eng-field"><span>历史状态</span><select value={d.stereotype || 'shallow'} onChange={e => s.updateNode(node.id, { semantic: { ...d, stereotype: e.target.value } }, '修改历史状态')}><option value="shallow">浅历史 H</option><option value="deep">深历史 H*</option></select></label>}
    {node.kind === 'umlState' && <label className="member-flags"><input type="checkbox" checked={!!node.container} onChange={e => s.editDoc('切换复合状态', doc => {
                const page = doc.pages.find(p => p.id === s.page().id)!;
                page.nodes[node.id].container = e.target.checked;
                if (!e.target.checked)
                    for (const n of Object.values(page.nodes))
                        if (n.parent === node.id)
                            n.parent = null;
            })}/>复合状态容器</label>}
    {node.kind === 'bpmnEvent' && <label className="eng-field"><span>事件类型</span><select value={d.stereotype || 'start'} onChange={e => s.updateNode(node.id, { semantic: { ...d, stereotype: e.target.value } }, '修改 BPMN 事件')}><option value="start">开始事件</option><option value="intermediate">中间事件</option><option value="end">结束事件</option></select></label>}
    {node.kind === 'bpmnTask' && <label className="eng-field"><span>任务类型</span><select value={d.stereotype || 'task'} onChange={e => s.editDoc('切换 BPMN 子流程', doc => {
                const page = doc.pages.find(p => p.id === s.page().id)!;
                page.nodes[node.id].semantic = { ...d, stereotype: e.target.value };
                page.nodes[node.id].container = e.target.value === 'subprocess';
                if (e.target.value !== 'subprocess')
                    for (const n of Object.values(page.nodes))
                        if (n.parent === node.id)
                            n.parent = null;
            })}><option value="task">任务</option><option value="subprocess">子流程</option></select></label>}
    {node.kind === 'interactionRef' && <><label className="eng-field"><span>引用交互页</span><select aria-label="引用交互页" value={node.childPageId || ''} onChange={e => s.updateNode(node.id, { childPageId: e.target.value || undefined }, '修改交互页引用')}><option value="">请选择</option>{s.doc.pages.filter(p => p.id !== s.page().id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{node.childPageId && <button className="wide-btn" onClick={() => { s.setActivePage(node.childPageId!); s.fitView(); }}>打开引用交互页</button>}</>}
    {node.kind === 'useCase' && (['goal', 'precondition', 'postcondition', 'mainFlow', 'exceptionFlow'] as const).map((key, i) => input(key, ['目标', '前置条件', '后置条件', '主流程', '异常流程'][i], true))}
    {['umlClass', 'umlInterface', 'umlEnum', 'sysmlBlock', 'umlObject', 'umlPart'].includes(node.kind) && <><Members node={node} field="attributes" title="属性"/>{!['umlObject', 'umlPart'].includes(node.kind) && <Members node={node} field="operations" title="方法"/>}</>}
    {node.kind === 'erTable' && <Members node={node} field="fields" title="字段"/>}
    {node.kind === 'sequenceActivation' && <><label className="eng-field"><span>激活对象</span><select aria-label="激活对象" value={node.activationFor || ''} onChange={e => s.updateNode(node.id, { activationFor: e.target.value || undefined }, '绑定激活对象')}><option value="">自由放置</option>{Object.values(s.page().nodes).filter(n => n.kind === 'sequenceParticipant').map(n => <option key={n.id} value={n.id}>{(n as ShapeNode).text}</option>)}</select></label>{(['activationStart', 'activationEnd'] as const).map((key, i) => <label className="eng-field" key={key}><span>{i ? '结束消息' : '开始消息'}</span><select value={node[key] || ''} onChange={e => s.updateNode(node.id, { [key]: e.target.value || undefined }, '绑定激活消息')}><option value="">手工位置 / 长度</option>{(Object.values(s.page().nodes).filter(n => n.kind === 'connector' && n.messageY !== undefined) as LineNode[]).map(n => <option key={n.id} value={n.id}>{n.sequenceIndex}: {n.text}</option>)}</select></label>)}</>}
    {node.kind === 'sequenceFragment' && <><label className="eng-field"><span>组合片段</span><select aria-label="组合片段" value={d.fragment || 'alt'} onChange={e => s.updateNode(node.id, { semantic: { ...d, fragment: e.target.value as EngineeringData['fragment'] } }, '修改片段')}>{['alt', 'opt', 'loop', 'par'].map(v => <option key={v}>{v}</option>)}</select></label>{input('condition', '条件')}{input('secondCondition', '第二分支条件')}</>}
    {node.kind === 'umlState' && <>{input('entry', 'entry 行为')}{input('doActivity', 'do 行为')}{input('exit', 'exit 行为')}</>}
    {node.kind === 'bpmnGateway' && <label className="eng-field"><span>网关类型</span><select value={d.stereotype || 'exclusive'} onChange={e => s.updateNode(node.id, { semantic: { ...d, stereotype: e.target.value } }, '修改网关')}><option value="exclusive">排他 ×</option><option value="parallel">并行 +</option></select></label>}
    {node.kind === 'requirement' && input('requirementText', '需求文本', true)}
    {(['technology', 'responsibility', 'protocol'] as const).map((key, i) => input(key, ['技术栈', '职责', '协议'][i]))}{input('description', '说明', true)}
    {['umlComponent', 'networkDevice', 'c4Container', 'c4Component', 'umlComposite', 'umlPart', 'networkService', 'messageQueue', 'networkDatabase'].includes(node.kind) && <div className="engineering-members"><strong>命名端口</strong>{(d.ports || []).map((p, i) => <div className="member-card" key={p.id}><input aria-label={`端口${i + 1}名称`} value={p.name} onFocus={() => s.commit('编辑端口')} onChange={e => s.updateNode(node.id, { semantic: { ...d, ports: d.ports!.map((v, j) => j === i ? { ...v, name: e.target.value } : v) } })}/><div className="member-row"><select value={p.side} onChange={e => s.updateNode(node.id, { semantic: { ...d, ports: d.ports!.map((v, j) => j === i ? { ...v, side: e.target.value as Side } : v) } }, '修改端口边')}>{['left', 'right', 'top', 'bottom'].map(v => <option key={v}>{v}</option>)}</select><button onClick={() => s.updateNode(node.id, { semantic: { ...d, ports: d.ports!.filter((_, j) => j !== i) } }, '删除端口')}>删除</button></div></div>)}<button className="wide-btn" onClick={() => s.updateNode(node.id, { semantic: { ...d, ports: [...(d.ports || []), { id: newId('port'), name: 'port', side: 'right', offset: .5 }] } }, '新增端口')}>＋ 命名端口</button></div>}
    {['dfdProcess', 'c4System', 'c4Container', 'c4Component'].includes(node.kind) && <button className="wide-btn" onClick={() => { s.editDoc('创建 / 打开分解图', doc => childDiagram(doc, s.page().id, node.id)); s.fitView(); }}>{node.childPageId ? '打开子图' : '创建分解子图'}</button>}
    {node.parent && s.page().nodes[node.parent]?.container && <button className="wide-btn" onClick={() => s.updateNode(node.id, { parent: null }, '移出容器')}>移出当前容器</button>}
    {node.container && <><p className="eng-hint">移动带动内部对象；缩放只改变容器边框，保持子对象尺寸和位置。</p><button className="wide-btn" onClick={() => s.editDoc('收纳内部对象', doc => {
                const p = doc.pages.find(p => p.id === s.page().id)!;
                for (const n of Object.values(p.nodes))
                    if (n.id !== node.id && !n.parent && !n.container && n.kind !== 'connector' && n.x >= node.x && n.y >= node.y + 28 && n.x + n.w <= node.x + node.w && n.y + n.h <= node.y + node.h)
                        n.parent = node.id;
            })}>收纳边界内对象</button></>}
    <label className="member-flags"><input type="checkbox" checked={!!node.layoutLocked} onChange={e => s.updateNode(node.id, { layoutLocked: e.target.checked }, '锁定自动布局位置')}/>自动布局保留当前位置</label>
  </div>;
}
