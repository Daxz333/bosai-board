import type { AnyNode, DiagramType, Doc, EngineeringData, LineNode, MarkerKind, Page, ProfessionalKind, RelationKind, ShapeNode } from '../types';
import { newId } from '../types';
export const DIAGRAMS: {
    id: DiagramType;
    label: string;
}[] = [
    ['communication', 'UML 通信图'], ['composite', 'UML 组合结构图'], ['timing', 'UML 定时图'], ['interaction', 'UML 交互概览图'],
    ['free', '自由绘图'], ['useCase', 'UML 用例图'], ['dfd', '数据流图 DFD'], ['class', 'UML 类图'], ['er', 'ER / 数据库表图'], ['sequence', 'UML 时序图'], ['activity', '活动图与泳道'], ['state', '状态机图'], ['component', '组件图'], ['deployment', '部署图'], ['package', '包图'], ['c4', 'C4 架构图'], ['bpmn', 'BPMN 常用子集'], ['module', '功能结构图'], ['network', '网络拓扑图'], ['requirements', '需求追踪'], ['object', 'UML 对象图']
].map(([id, label]) => ({ id: id as DiagramType, label }));
export interface SymbolDefinition {
    kind: ProfessionalKind;
    label: string;
    diagram: DiagramType;
    w: number;
    h: number;
    description: string;
    container?: boolean;
    data?: EngineeringData;
}
export const SYMBOLS: SymbolDefinition[] = [
    { kind: 'umlComposite', label: '结构化分类器', diagram: 'composite', w: 620, h: 360, container: true, description: '组合结构的分类器边界、内部部件与命名端口', data: { ports: [] } },
    { kind: 'umlPart', label: '内部部件', diagram: 'composite', w: 220, h: 140, data: { attributes: [] }, description: '部件名 : 类型；可以附加结构连接端口' },
    { kind: 'timingLifeline', label: '状态时间线', diagram: 'timing', w: 640, h: 220, data: { timingStates: ['空闲', '处理中', '完成'], timeEvents: [{ id: 'event0', time: 0, state: '空闲', label: '' }, { id: 'event1', time: 10, state: '处理中', label: '请求' }, { id: 'event2', time: 40, state: '完成', label: '响应' }] }, description: '结构化时间事件编辑；按时间和状态绘制阶梯轨迹' },
    { kind: 'interactionRef', label: '交互引用', diagram: 'interaction', w: 200, h: 100, description: 'ref 图框引用另一个交互页；属性中选择并导航' },
    { kind: 'bpmnDataObject', label: '数据对象', diagram: 'bpmn', w: 110, h: 130, description: 'BPMN 文档数据对象；常用绘制子集' },
    { kind: 'networkService', label: '服务', diagram: 'network', w: 200, h: 120, data: { ports: [] }, description: '服务职责、技术栈、协议与连接端口' },
    { kind: 'messageQueue', label: '消息队列', diagram: 'network', w: 200, h: 100, data: { ports: [] }, description: '消息中间件与协议' },
    { kind: 'networkDatabase', label: '网络数据库', diagram: 'network', w: 170, h: 120, data: { ports: [] }, description: '拓扑中的数据库及协议' },
    { kind: 'testCase', label: '测试用例', diagram: 'requirements', w: 240, h: 150, data: { code: 'TC-1' }, description: '前置条件、测试步骤、预期结果；可参与需求追踪' },
    { kind: 'actor', label: '参与者', diagram: 'useCase', w: 90, h: 130, description: '与系统交互的角色，可通过泛化表达继承' },
    { kind: 'useCase', label: '用例', diagram: 'useCase', w: 170, h: 80, description: '系统为参与者提供的目标；属性面板可编辑规约' },
    { kind: 'systemBoundary', label: '系统边界', diagram: 'useCase', w: 520, h: 380, container: true, description: '包含内部用例；移动带动子对象，缩放只改变边框' },
    { kind: 'umlNote', label: 'UML 注释', diagram: 'useCase', w: 200, h: 100, description: '折角注释；可用依赖线连接说明对象' },
    { kind: 'dfdExternal', label: '外部实体', diagram: 'dfd', w: 150, h: 80, description: '系统外部的数据来源或接收者' },
    { kind: 'dfdProcess', label: '处理过程', diagram: 'dfd', w: 160, h: 110, data: { code: '1' }, description: '处理数据；支持稳定编号与创建分解子图' },
    { kind: 'dfdStore', label: '数据存储', diagram: 'dfd', w: 190, h: 75, data: { code: 'D1' }, description: 'Yourdon 双线或 Gane-Sarson 开口矩形' },
    ...(['umlClass', 'umlInterface', 'umlEnum'] as const).map((kind, i) => ({ kind, label: ['类', '接口', '枚举'][i], diagram: 'class' as const, w: 240, h: 180, description: '名称、属性、操作分区；增删成员后自动扩展高度', data: { attributes: [], operations: [], stereotype: i === 1 ? 'interface' : i === 2 ? 'enumeration' : '' } })),
    { kind: 'erEntity', label: '概念实体', diagram: 'er', w: 160, h: 80, description: 'Chen 实体，独立于物理数据库表' },
    { kind: 'erWeakEntity', label: '弱实体', diagram: 'er', w: 160, h: 80, description: '双线实体边界' },
    { kind: 'erRelationship', label: '概念关系', diagram: 'er', w: 130, h: 90, description: 'Chen 菱形关系' },
    { kind: 'erAttribute', label: '概念属性', diagram: 'er', w: 140, h: 65, description: 'Chen 椭圆属性' },
    { kind: 'erTable', label: '数据库表', diagram: 'er', w: 260, h: 160, data: { fields: [{ id: 'id', name: 'id', type: 'INTEGER', primary: true, nullable: false }] }, description: '字段、类型、PK / FK、可空性；可绑定到字段连接点' },
    { kind: 'sequenceParticipant', label: '对象 / 生命线', diagram: 'sequence', w: 150, h: 420, description: '顶部对象和虚线生命线；消息列表统一调整顺序' },
    { kind: 'sequenceFragment', label: '组合片段', diagram: 'sequence', w: 520, h: 200, container: true, data: { fragment: 'alt', condition: '成功', secondCondition: '失败' }, description: 'alt / opt / loop / par；条件可编辑' },
    { kind: 'sequenceActivation', label: '激活', diagram: 'sequence', w: 14, h: 100, description: '对象执行期间的激活条' },
    { kind: 'activityAction', label: '动作', diagram: 'activity', w: 160, h: 70, description: '活动动作或对象流节点' },
    { kind: 'initialState', label: '初始节点', diagram: 'activity', w: 26, h: 26, description: '实心初始节点' },
    { kind: 'finalState', label: '终止节点', diagram: 'activity', w: 32, h: 32, description: '内实外空终止节点' },
    { kind: 'decision', label: '决策 / 合并', diagram: 'activity', w: 80, h: 80, description: '分支条件写在线上' },
    { kind: 'fork', label: '分叉 / 汇合', diagram: 'activity', w: 180, h: 12, description: '并行分叉或汇合条' },
    { kind: 'swimlane', label: '泳道', diagram: 'activity', w: 270, h: 500, container: true, description: '泳道归属独立于组合；通过容器收纳节点' },
    { kind: 'umlState', label: '状态', diagram: 'state', w: 230, h: 150, description: 'entry / exit / do 行为与迁移标签' },
    { kind: 'historyState', label: '历史状态', diagram: 'state', w: 42, h: 42, description: '浅历史状态 H' },
    { kind: 'umlComponent', label: '组件', diagram: 'component', w: 220, h: 130, data: { ports: [] }, description: '组件及命名端口；依赖与接口连接' },
    { kind: 'interfacePort', label: '接口', diagram: 'component', w: 55, h: 55, description: '提供接口圆形节点；所需接口可在关系端点表达' },
    { kind: 'deploymentDevice', label: '设备 / 执行环境', diagram: 'deployment', w: 280, h: 200, container: true, data: { stereotype: 'device' }, description: '设备包含执行环境或制品' },
    { kind: 'artifact', label: '制品', diagram: 'deployment', w: 180, h: 100, data: { stereotype: 'artifact' }, description: '部署制品与技术栈说明' },
    { kind: 'umlPackage', label: '包', diagram: 'package', w: 320, h: 220, container: true, description: '包包含设计对象，包间使用依赖关系' },
    ...(['c4System', 'c4Container', 'c4Component'] as const).map((kind, i) => ({ kind, label: ['软件系统', 'C4 容器', 'C4 组件'][i], diagram: 'c4' as const, w: 240, h: 150, description: '职责、技术栈、协议和下一级视图；容器指可运行应用或数据存储' })),
    { kind: 'bpmnEvent', label: '事件', diagram: 'bpmn', w: 48, h: 48, description: 'BPMN 绘制子集中的普通事件' },
    { kind: 'bpmnTask', label: '任务 / 子流程', diagram: 'bpmn', w: 180, h: 90, description: '任务；可用 stereotype 标记子流程' },
    { kind: 'bpmnGateway', label: '网关', diagram: 'bpmn', w: 60, h: 60, data: { stereotype: 'exclusive' }, description: 'exclusive 排他 / parallel 并行' },
    { kind: 'bpmnPool', label: '池', diagram: 'bpmn', w: 720, h: 250, container: true, description: '池内顺序流，跨池消息流；规则面板提示混用' },
    { kind: 'module', label: '功能模块', diagram: 'module', w: 180, h: 80, description: '功能分解树与模块依赖' },
    { kind: 'networkDevice', label: '网络设备', diagram: 'network', w: 180, h: 100, description: '设备、协议、技术栈和命名端口' },
    { kind: 'requirement', label: '需求', diagram: 'requirements', w: 240, h: 160, data: { code: 'REQ-1' }, description: '需求编号、文本与追踪关系（非完整 SysML 元模型）' },
    { kind: 'sysmlBlock', label: '块', diagram: 'requirements', w: 240, h: 160, data: { stereotype: 'block', attributes: [], operations: [] }, description: '块的绘制与字段编辑子集' },
    { kind: 'umlObject', label: '对象', diagram: 'object', w: 220, h: 140, data: { attributes: [] }, description: '对象名称与属性槽；名称下划线' }
];
export const isProfessional = (n: AnyNode | string): boolean => SYMBOLS.some(s => s.kind === (typeof n === 'string' ? n : n.kind));
export const symbolDefinition = (kind: string) => SYMBOLS.find(s => s.kind === kind);
export function professionalDefaults(kind: string): Partial<ShapeNode> {
    const d = symbolDefinition(kind);
    return d ? { text: d.label, container: d.container, semantic: structuredClone(d.data || {}), fill: d.container ? 'transparent' : '#FFFFFF', stroke: '#334155', fontSize: 14, valign: d.container ? 'top' : 'middle' } : {};
}
export interface RelationDefinition {
    id: RelationKind;
    label: string;
    start: MarkerKind;
    end: MarkerKind;
    dashed?: boolean;
    text?: string;
    hint: string;
    diagrams?: DiagramType[];
}
export const RELATIONS: RelationDefinition[] = [
    { id: 'communicationMessage', label: '通信消息', start: 'none', end: 'open', hint: '对象间的编号消息；可编辑 1、1.1 等消息编号', diagrams: ['communication'] },
    { id: 'association', label: '关联', start: 'none', end: 'none', hint: '参与者与用例、类或实体之间的关联' },
    { id: 'dependency', label: '依赖', start: 'none', end: 'open', dashed: true, hint: '依赖方 → 被依赖方' },
    { id: 'generalization', label: '泛化', start: 'none', end: 'triangle', hint: '子类型 → 父类型' },
    { id: 'realization', label: '实现', start: 'none', end: 'triangle', dashed: true, hint: '实现类 → 接口' },
    { id: 'aggregation', label: '聚合', start: 'diamond', end: 'none', hint: '空心菱形在整体端' },
    { id: 'composition', label: '组合', start: 'filledDiamond', end: 'none', hint: '实心菱形在整体端' },
    { id: 'include', label: '包含 include', start: 'none', end: 'open', dashed: true, text: '«include»', hint: '基础用例 → 被包含用例', diagrams: ['useCase'] },
    { id: 'extend', label: '扩展 extend', start: 'none', end: 'open', dashed: true, text: '«extend»', hint: '扩展用例 → 被扩展用例', diagrams: ['useCase'] },
    { id: 'dataFlow', label: '数据流', start: 'none', end: 'open', hint: '数据来源 → 数据接收者；请为数据流命名', diagrams: ['dfd'] },
    { id: 'oneMany', label: '一对多', start: 'one', end: 'many', hint: '一端 → 多端', diagrams: ['er'] },
    { id: 'optionalMany', label: '可选一对多', start: 'one', end: 'zeroMany', hint: '一端 → 零或多端', diagrams: ['er'] },
    { id: 'syncMessage', label: '同步消息', start: 'none', end: 'arrow', hint: '发送者 → 接收者', diagrams: ['sequence'] },
    { id: 'asyncMessage', label: '异步消息', start: 'none', end: 'open', hint: '发送者 → 接收者', diagrams: ['sequence'] },
    { id: 'returnMessage', label: '返回', start: 'none', end: 'open', dashed: true, hint: '接收者 → 调用者', diagrams: ['sequence'] },
    { id: 'createMessage', label: '创建', start: 'none', end: 'open', dashed: true, hint: '发送者 → 新对象', diagrams: ['sequence'] },
    { id: 'destroyMessage', label: '销毁', start: 'none', end: 'cross', hint: '发送者 → 被销毁对象', diagrams: ['sequence'] },
    { id: 'sequenceFlow', label: '顺序流', start: 'none', end: 'arrow', hint: '池内流程顺序', diagrams: ['bpmn', 'activity'] },
    { id: 'messageFlow', label: '消息流', start: 'circle', end: 'open', dashed: true, hint: '不同池之间的消息', diagrams: ['bpmn'] },
    { id: 'transition', label: '状态迁移', start: 'none', end: 'open', hint: '标签格式：事件 [条件] / 动作', diagrams: ['state'] },
    { id: 'trace', label: '追踪', start: 'none', end: 'open', dashed: true, text: '«trace»', hint: '需求 → 用例 / 设计 / 测试对象', diagrams: ['requirements'] }
];
export const MARKERS: {
    id: MarkerKind;
    label: string;
}[] = [['none', '无'], ['arrow', '实心箭头'], ['open', '开放箭头'], ['triangle', '空心三角'], ['diamond', '空心菱形'], ['filledDiamond', '实心菱形'], ['circle', '圆'], ['one', '一'], ['many', '多 / 乌鸦脚'], ['zeroOne', '零或一'], ['zeroMany', '零或多'], ['cross', '销毁 ×']].map(([id, label]) => ({ id: id as MarkerKind, label }));
export function relationPatch(id: RelationKind, previous?: LineNode): Partial<LineNode> {
    const r = RELATIONS.find(r => r.id === id)!;
    const previousPreset = RELATIONS.find(r => r.id === previous?.relation)?.text;
    return { relation: id, startMarker: r.start, endMarker: r.end, arrow: 'none', lineStyle: r.dashed ? 'dashed' : 'solid', ...(!previous?.text || previous.text === previousPreset ? { text: r.text || '' } : {}) };
}
export function memberHeight(n: AnyNode): number {
    const d = n.semantic || {}, row = Math.max(22, ((n as ShapeNode).fontSize || 14) * 1.6);
    if (['umlClass', 'umlInterface', 'umlEnum', 'sysmlBlock'].includes(n.kind))
        return 52 + Math.max(1, d.attributes?.length || 0) * row + Math.max(1, d.operations?.length || 0) * row + 12;
    if (n.kind === 'erTable')
        return 44 + Math.max(1, d.fields?.length || 0) * row + 8;
    if (n.kind === 'umlObject')
        return 44 + Math.max(1, d.attributes?.length || 0) * row + 8;
    if (n.kind === 'umlPart')
        return 44 + Math.max(1, d.attributes?.length || 0) * row + 8;
    if (n.kind === 'timingLifeline')
        return 90 + (d.timingStates?.length || 3) * row;
    return n.h;
}
export function memberWidth(n: AnyNode): number {
    if (!['umlClass', 'umlInterface', 'umlEnum', 'umlObject', 'umlPart', 'sysmlBlock', 'erTable'].includes(n.kind))
        return n.w;
    const d = n.semantic || {}, fs = (n as ShapeNode).fontSize || 14, lines = [(n as ShapeNode).text || '', ...(d.fields || d.attributes || []).map(f => `${f.name}: ${f.type}${f.primary ? ' PK ' : ''}${f.foreign ? ' FK ' : ''}${n.kind === 'erTable' && !f.nullable ? ' NOT NULL' : ''}`), ...(d.operations || []).map(f => `${f.name}(${f.parameters || ''}): ${f.type}`)];
    return Math.max(160, ...lines.map(l => [...l].reduce((w, c) => w + (/[^\x00-\xff]/.test(c) ? fs : fs * .63), 26)));
}
/** Reconcile shared model properties without copying view positions across diagrams. */
export function reconcileEngineering(doc: Doc, previous?: Doc): Doc {
    if (!doc.pages.some(p => p.diagramType || Object.values(p.nodes).some(n => isProfessional(n))))
        return doc;
    const next = structuredClone(doc), models = next.models || (next.models = {});
    const modelData = (n: AnyNode): EngineeringData => {
        const data = structuredClone(n.semantic || {});
        if (n.kind === 'dfdProcess' || n.kind === 'dfdStore')
            delete data.notation;
        return data;
    };
    for (const model of Object.values(models))
        if (model.kind === 'dfdProcess' || model.kind === 'dfdStore')
            delete model.data.notation;
    next.version = 2;
    const changes = new Map<string, {
        kind: ProfessionalKind;
        name: string;
        data: EngineeringData;
    }>();
    for (const p of next.pages)
        for (const n of Object.values(p.nodes)) {
            if (!isProfessional(n))
                continue;
            const old = previous?.pages.find(page => page.id === p.id)?.nodes[n.id];
            if (!n.modelId)
                n.modelId = newId('model');
            if (!models[n.modelId] || (old && ((old as ShapeNode).text !== (n as ShapeNode).text || JSON.stringify(modelData(old)) !== JSON.stringify(modelData(n))))) {
                changes.set(n.modelId, { kind: n.kind as ProfessionalKind, name: (n as ShapeNode).text || '', data: modelData(n) });
            }
        }
    for (const [id, m] of changes)
        models[id] = { id, ...m };
    for (const p of next.pages)
        for (const n of Object.values(p.nodes)) {
            if (n.modelId && models[n.modelId]) {
                n.semantic = structuredClone(models[n.modelId].data);
                if (n.kind === 'dfdProcess' || n.kind === 'dfdStore')
                    n.semantic.notation = p.notation || 'yourdon';
                (n as ShapeNode).text = models[n.modelId].name;
                const minimum = memberHeight(n);
                if (n.h < minimum)
                    n.h = minimum;
                n.w = Math.max(n.w, memberWidth(n));
            }
        }
    return next;
}
export interface DiagramIssue {
    pageId: string;
    nodeId?: string;
    message: string;
    severity: 'warning' | 'info';
}
export function diagramIssues(doc: Doc): DiagramIssue[] {
    const issues: DiagramIssue[] = [];
    for (const p of doc.pages) {
        const nodes = Object.values(p.nodes), lines = nodes.filter(n => n.kind === 'connector') as LineNode[], codes = new Map<string, string>();
        const add = (n: AnyNode | undefined, message: string, severity: 'warning' | 'info' = 'warning') => issues.push({ pageId: p.id, nodeId: n?.id, message, severity });
        for (const n of nodes) {
            if (n.semantic?.code) {
                const key = n.kind + ':' + n.semantic.code;
                if (codes.has(key) && (!n.modelId || p.nodes[codes.get(key)!]?.modelId !== n.modelId))
                    add(n, `重复编号：${n.semantic.code}`);
                codes.set(key, n.id);
            }
            if (n.kind === 'timingLifeline')
                for (const e of n.semantic?.timeEvents || [])
                    if (!n.semantic?.timingStates?.includes(e.state))
                        add(n, `时间事件「${e.label || e.time}」引用了不存在的状态「${e.state}」`);
            if (n.kind === 'dfdProcess') {
                if (!lines.some(l => l.to?.nodeId === n.id))
                    add(n, '处理过程无输入数据流');
                if (!lines.some(l => l.from?.nodeId === n.id))
                    add(n, '处理过程无输出数据流');
            }
        }
        const pool = (id?: string): string | undefined => {
            const seen = new Set<string>();
            let n = id ? p.nodes[id] : undefined;
            while (n && !seen.has(n.id)) {
                seen.add(n.id);
                if (n.kind === 'bpmnPool')
                    return n.id;
                n = n.parent ? p.nodes[n.parent] : undefined;
            }
            return undefined;
        };
        for (const l of lines) {
            const a = l.from ? p.nodes[l.from.nodeId] : undefined, b = l.to ? p.nodes[l.to.nodeId] : undefined;
            if (!a || !b)
                add(l, '关系存在未绑定端点');
            if (l.relation === 'dataFlow' || p.diagramType === 'dfd') {
                if (!l.text?.trim())
                    add(l, '未命名数据流');
                if (a && b && a.kind !== 'dfdProcess' && b.kind !== 'dfdProcess')
                    add(l, '数据流至少一端应为处理过程');
            }
            if (['include', 'extend'].includes(l.relation || '')) {
                if (a?.kind !== 'useCase' || b?.kind !== 'useCase')
                    add(l, 'include / extend 的两端应为用例');
                add(l, l.relation === 'include' ? '方向检查：基础用例 → 被包含用例' : '方向检查：扩展用例 → 被扩展用例', 'info');
            }
            if (l.relation === 'generalization' && p.diagramType === 'useCase' && a && b && (a.kind !== b.kind || !['actor', 'useCase'].includes(a.kind)))
                add(l, '用例图泛化应连接同类参与者或同类用例');
            if (l.relation === 'sequenceFlow' && pool(a?.id) && pool(b?.id) && pool(a?.id) !== pool(b?.id))
                add(l, '顺序流不能跨池，请使用消息流');
            if (l.relation === 'messageFlow' && pool(a?.id) && pool(a?.id) === pool(b?.id))
                add(l, '池内流程请使用顺序流');
            for (const ep of [l.from, l.to])
                if (ep?.portId) {
                    const n = p.nodes[ep.nodeId];
                    if (!(n?.semantic?.fields || []).some(f => f.id === ep.portId) && !(n?.semantic?.ports || []).some(f => f.id === ep.portId))
                        add(l, '命名端口或字段已移除，请重新绑定');
                }
        }
        if (p.parentPageId && p.parentProcessId && p.diagramType === 'dfd') {
            const parent = doc.pages.find(x => x.id === p.parentPageId), boundary = (Object.values(parent?.nodes || {}) as LineNode[]).filter(l => l.kind === 'connector' && (l.from?.nodeId === p.parentProcessId || l.to?.nodeId === p.parentProcessId)).map(l => (l.to?.nodeId === p.parentProcessId ? '输入:' : '输出:') + (l.text || '')).sort();
            const child = lines.filter(l => p.nodes[l.from?.nodeId || '']?.kind === 'dfdExternal' || p.nodes[l.to?.nodeId || '']?.kind === 'dfdExternal').map(l => (p.nodes[l.from?.nodeId || '']?.kind === 'dfdExternal' ? '输入:' : '输出:') + (l.text || '')).sort();
            if (JSON.stringify(boundary) !== JSON.stringify(child))
                issues.push({ pageId: p.id, message: `父子图边界数据流不一致。父图：${boundary.join('、')}；子图：${child.join('、')}`, severity: 'warning' });
        }
    }
    return issues;
}
export function insertContainment(page: Page, node: AnyNode): void {
    if (node.parent || node.kind === 'connector')
        return;
    const contains = (outer: AnyNode, inner: AnyNode) => inner.x >= outer.x && inner.y >= outer.y + 28 && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
    const containers = Object.values(page.nodes).filter(n => n.container && !n.locked && !n.hidden && n.id !== node.id && contains(n, node)).sort((a, b) => a.w * a.h - b.w * b.h);
    if (containers[0])
        node.parent = containers[0].id;
    if (node.container)
        for (const other of Object.values(page.nodes))
            if (other.id !== node.id && !other.parent && other.kind !== 'connector' && contains(node, other))
                other.parent = node.id;
}
