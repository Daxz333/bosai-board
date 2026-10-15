import type { AnyNode, DiagramType, Doc, EngineeringData, LineNode, Page, ProfessionalKind, RelationKind, ShapeNode } from '../types';
import { newId } from '../types';
import { makeLine, makeShape } from './factory';
import { DIAGRAMS, RELATIONS, SYMBOLS, memberHeight, relationPatch } from './engineering';
export function diagramPage(type: DiagramType, name?: string): Page { return { id: newId('p'), name: name || DIAGRAMS.find(d => d.id === type)!.label, background: '#FFFFFF', diagramType: type, nodes: {}, order: [], notation: 'yourdon', levelLabel: type === 'dfd' ? '上下文图' : undefined, numberMessages: true }; }
export function putSymbol(page: Page, kind: ProfessionalKind, text: string, x: number, y: number, data: EngineeringData = {}, parent?: string): ShapeNode {
    const meta = SYMBOLS.find(s => s.kind === kind)!, n = makeShape(kind, x, y, meta.w, meta.h, page.order.length + 1);
    n.id = newId('n');
    n.modelId = newId('model');
    n.text = text;
    n.semantic = { ...n.semantic, ...data };
    n.parent = parent;
    n.h = Math.max(n.h, memberHeight(n));
    page.nodes[n.id] = n;
    page.order.push(n.id);
    return n;
}
export function putRelation(page: Page, a: AnyNode, b: AnyNode, relation: RelationKind, text = '', extra: Partial<LineNode> = {}): LineNode {
    const line = makeLine(a.x + a.w, a.y + a.h / 2, b.x - a.x - a.w, b.y - a.y, page.order.length + 1, { kind: 'connector', from: { nodeId: a.id, side: 'auto' }, to: { nodeId: b.id, side: 'auto' }, route: 'straight', ...relationPatch(relation), text: text || RELATIONS.find(r => r.id === relation)?.text || '', ...extra });
    const start = { x: line.x, y: line.y }, end = { x: line.x + line.w, y: line.y + line.h };
    line.x = Math.min(start.x, end.x);
    line.y = Math.min(start.y, end.y);
    line.w = Math.max(1, Math.abs(end.x - start.x));
    line.h = Math.max(1, Math.abs(end.y - start.y));
    line.points = [start, end].map(p => ({ x: p.x - line.x, y: p.y - line.y }));
    line.id = newId('l');
    page.nodes[line.id] = line;
    page.order.push(line.id);
    return line;
}
export function childDiagram(doc: Doc, pageId: string, nodeId: string): string {
    const parent = doc.pages.find(p => p.id === pageId)!, process = parent.nodes[nodeId];
    if (process.childPageId && doc.pages.some(p => p.id === process.childPageId)) {
        doc.activePageId = process.childPageId;
        return process.childPageId;
    }
    const child = diagramPage(process.kind === 'dfdProcess' ? 'dfd' : 'c4', `${(process as ShapeNode).text || '对象'} · 分解图`);
    child.parentPageId = parent.id;
    child.parentProcessId = process.id;
    child.notation = parent.notation;
    child.levelLabel = process.kind === 'dfdProcess' ? `${process.semantic?.code || '1'} 层分解` : '组件视图';
    process.childPageId = child.id;
    if (process.kind === 'dfdProcess') {
        const inside = putSymbol(child, 'dfdProcess', '子处理', 370, 190, { code: `${process.semantic?.code || '1'}.1` });
        const boundaries = (Object.values(parent.nodes) as LineNode[]).filter(l => l.kind === 'connector' && (l.from?.nodeId === nodeId || l.to?.nodeId === nodeId));
        const external = new Map<string, ShapeNode>();
        let input = 0, output = 0;
        for (const l of boundaries) {
            const incoming = l.to?.nodeId === nodeId, otherId = incoming ? l.from?.nodeId : l.to?.nodeId, other = otherId ? parent.nodes[otherId] : undefined;
            if (!other)
                continue;
            const key = other.id + (incoming ? ':in' : ':out');
            let ext = external.get(key);
            if (!ext) {
                ext = putSymbol(child, 'dfdExternal', (other as ShapeNode).text || '外部边界', incoming ? 80 : 700, 80 + (incoming ? input++ : output++) * 130, { description: '上一级图中的数据来源或接收方' });
                external.set(key, ext);
            }
            putRelation(child, incoming ? ext : inside, incoming ? inside : ext, 'dataFlow', l.text || '');
        }
    }
    doc.pages.push(child);
    doc.activePageId = child.id;
    return child.id;
}
export function renumberMessages(page: Page, ids?: string[]): void {
    const messages = ids ? ids.map(id => page.nodes[id]).filter(n => n?.kind === 'connector') as LineNode[] : (Object.values(page.nodes).filter(n => n.kind === 'connector' && n.messageY !== undefined) as LineNode[]).sort((a, b) => a.messageY! - b.messageY!);
    const ordered: LineNode[] = [], seen = new Set<string>();
    for (const m of messages) {
        if (!m.fragmentId) {
            ordered.push(m);
            continue;
        }
        if (seen.has(m.fragmentId))
            continue;
        seen.add(m.fragmentId);
        ordered.push(...messages.filter(n => n.fragmentId === m.fragmentId).sort((a, b) => (a.fragmentBranch || 0) - (b.fragmentBranch || 0)));
    }
    const participants = Object.values(page.nodes).filter(n => n.kind === 'sequenceParticipant'), top = Math.max(0, ...participants.map(n => n.y)) + 85;
    ordered.forEach((n, i) => { n.messageY = top + i * 48; n.sequenceIndex = page.numberMessages === false ? undefined : i + 1; });
    for (const id of seen) {
        const frame = page.nodes[id], members = ordered.filter(m => m.fragmentId === id);
        if (!frame || !members.length)
            continue;
        frame.y = members[0].messageY! - 30;
        frame.h = Math.max(100, members[members.length - 1].messageY! - frame.y + 40);
        frame.fragmentSplit = members.find(m => m.fragmentBranch === 1)?.messageY;
        if (frame.fragmentSplit !== undefined)
            frame.fragmentSplit -= frame.y + 20;
    }
    for (const n of participants)
        n.h = Math.max(260, top + messages.length * 48 + 55 - n.y);
}
export function deleteMessage(doc: Doc, pageId: string, id: string): void {
    const page = doc.pages.find(p => p.id === pageId)!;
    delete page.nodes[id];
    page.order = page.order.filter(n => n !== id);
    for (const n of Object.values(page.nodes)) {
        if (n.activationStart === id)
            delete n.activationStart;
        if (n.activationEnd === id)
            delete n.activationEnd;
    }
    for (const entry of doc.dictionary || [])
        entry.flowIds = entry.flowIds?.filter(ref => ref !== id);
    renumberMessages(page);
}
export function reuseModel(doc: Doc, modelId: string, pageId: string, x = 40, y = 40): ShapeNode {
    const model = doc.models?.[modelId];
    if (!model)
        throw new Error('模型不存在');
    const page = doc.pages.find(p => p.id === pageId)!, definition = SYMBOLS.find(s => s.kind === model.kind)!, source = doc.pages.flatMap(p => Object.values(p.nodes)).find(n => n.modelId === modelId);
    const n = source ? structuredClone(source) as ShapeNode : makeShape(model.kind, x, y, definition.w, definition.h, page.order.length + 1);
    n.id = newId('view');
    n.modelId = modelId;
    n.semantic = structuredClone(model.data);
    n.text = model.name;
    n.x = x;
    n.y = y;
    n.z = page.order.length + 1;
    n.parent = null;
    delete n.childPageId;
    delete n.activationFor;
    delete n.activationStart;
    delete n.activationEnd;
    n.locked = false;
    n.hidden = false;
    n.layoutLocked = false;
    page.nodes[n.id] = n;
    page.order.push(n.id);
    return n;
}
export const TEMPLATES: {
    id: string;
    name: string;
    type: DiagramType;
    description: string;
}[] = [
    { id: 'business', name: '通用业务系统 · 用例 + 分层 DFD', type: 'useCase', description: '用户、业务请求、处理分解和数据字典，可按实际业务改名' },
    { id: 'shopping', name: '购物用例图', type: 'useCase', description: '顾客、下单、支付、优惠；包含与扩展方向' },
    { id: 'course', name: '选课用例图', type: 'useCase', description: '学生与教师角色、选课和校验名额' },
    { id: 'classes', name: '订单类图', type: 'class', description: '接口实现、组合、角色和多重性' },
    { id: 'database', name: '用户—订单—明细表图', type: 'er', description: 'PK / FK、可空性、字段绑定及可选一对多' },
    { id: 'chen', name: 'Chen 概念 ER', type: 'er', description: '实体、关系、属性与弱实体' },
    { id: 'login', name: '登录成功 / 失败时序', type: 'sequence', description: '同步、返回、激活和 alt 条件片段' },
    ...(['activity', 'state', 'component', 'deployment', 'package', 'c4', 'bpmn', 'module', 'network', 'requirements', 'object', 'communication', 'composite', 'timing', 'interaction'] as DiagramType[]).map(type => ({ id: type, name: DIAGRAMS.find(d => d.id === type)!.label + '示例', type, description: '原生可编辑对象、关系和属性' }))
];
function useCases(name: string, course = false): Page {
    const p = diagramPage('useCase', name), boundary = putSymbol(p, 'systemBoundary', name, 230, 60);
    boundary.w = 680;
    boundary.h = 420;
    const customer = putSymbol(p, 'actor', course ? '学生' : '顾客', 65, 160), vip = putSymbol(p, 'actor', course ? '教师' : '会员', 65, 340), order = putSymbol(p, 'useCase', course ? '选课' : '下单', 310, 135, { code: 'UC-01', goal: course ? '选择课程并获得选课结果' : '完成订单', precondition: '已登录', postcondition: '记录成功结果', mainFlow: '1. 提交请求\n2. 校验信息\n3. 保存记录', exceptionFlow: '信息无效时提示并返回' }, boundary.id), pay = putSymbol(p, 'useCase', course ? '校验名额' : '支付', 650, 140, { code: 'UC-02' }, boundary.id), coupon = putSymbol(p, 'useCase', course ? '退选' : '使用优惠', 650, 330, { code: 'UC-03' }, boundary.id);
    putRelation(p, customer, order, 'association');
    putRelation(p, vip, customer, 'generalization');
    putRelation(p, order, pay, 'include');
    putRelation(p, coupon, order, 'extend');
    putSymbol(p, 'umlNote', 'include：基础 → 被包含\nextend：扩展 → 被扩展', 310, 345, {}, boundary.id);
    return p;
}
export function templatePages(id: string): {
    pages: Page[];
    dictionary?: Doc['dictionary'];
} {
    // Keep existing automation callers compatible with the renamed template.
    if (id === 'library') id = 'business';
    if (id === 'shopping' || id === 'course')
        return { pages: [useCases(id === 'course' ? '选课系统' : '购物系统', id === 'course')] };
    if (id === 'business') {
        const uc = useCases('业务系统');
        Object.values(uc.nodes).filter(n => n.kind === 'actor').forEach((n, i) => (n as ShapeNode).text = i ? '高级用户' : '用户');
        const cases = Object.values(uc.nodes).filter(n => n.kind === 'useCase') as ShapeNode[];
        cases[0].text = '提交业务请求';
        cases[0].semantic = { ...cases[0].semantic, goal: '处理业务请求并保存处理记录', precondition: '用户具备操作权限，所需数据已准备', postcondition: '处理记录已保存，返回业务结果', mainFlow: '1. 提交用户标识和业务数据\n2. 校验权限与业务规则\n3. 保存处理记录并返回结果', exceptionFlow: '权限不足、数据无效或规则不满足时，返回原因' };
        cases[1].text = '校验请求';
        cases[2].text = '补充信息';
        cases[2].semantic = { ...cases[2].semantic, condition: '请求信息不完整时' };
        const p = diagramPage('dfd', '业务系统 · 上下文'), user = putSymbol(p, 'dfdExternal', '用户', 80, 150), process = putSymbol(p, 'dfdProcess', '业务系统', 390, 150, { code: '0' }), admin = putSymbol(p, 'dfdExternal', '管理员', 700, 150);
        putRelation(p, user, process, 'dataFlow', '业务请求');
        putRelation(p, process, user, 'dataFlow', '处理结果', { route: 'orthogonal', from: { nodeId: process.id, side: 'bottom' }, to: { nodeId: user.id, side: 'bottom' }, bends: [{ x: 470, y: 355 }, { x: 155, y: 355 }] });
        putRelation(p, admin, process, 'dataFlow', '基础数据');
        putRelation(p, process, admin, 'dataFlow', '统计报表', { route: 'orthogonal', from: { nodeId: process.id, side: 'bottom' }, to: { nodeId: admin.id, side: 'bottom' }, bends: [{ x: 470, y: 390 }, { x: 775, y: 390 }] });
        const doc = { pages: [uc, p], activePageId: p.id } as Doc;
        const childId = childDiagram(doc, p.id, process.id), child = doc.pages.find(p => p.id === childId)!, sub = Object.values(child.nodes).find(n => n.kind === 'dfdProcess') as ShapeNode;
        child.name = '业务系统 · 业务分解';
        child.levelLabel = '业务分解层';
        sub.text = '处理业务请求';
        sub.semantic = { ...sub.semantic, code: '1' };
        const store = putSymbol(child, 'dfdStore', '业务记录', 370, 410, { code: 'D1' });
        putRelation(child, sub, store, 'dataFlow', '业务记录');
        putRelation(child, store, sub, 'dataFlow', '历史记录', { route: 'orthogonal', from: { nodeId: store.id, side: 'right' }, to: { nodeId: sub.id, side: 'right' }, bends: [{ x: 625, y: 447.5 }, { x: 625, y: 245 }] });
        const maintenance = putSymbol(child, 'dfdProcess', '维护基础数据', 370, 50, { code: '2' }), report = putSymbol(child, 'dfdProcess', '生成报表', 700, 520, { code: '3' });
        for (const n of Object.values(child.nodes))
            if (n.kind === 'connector') {
                if (n.text === '业务请求') n.labelOffsets = { middle: { x: -20, y: -35 } };
                if (n.text === '基础数据')
                    n.to = { nodeId: maintenance.id, side: 'auto' };
                if (n.text === '统计报表') {
                    n.from = { nodeId: report.id, side: 'right' };
                    n.to = { ...n.to!, side: 'right' };
                    n.route = 'orthogonal';
                    n.bends = [{ x: 925, y: 575 }, { x: 925, y: 250 }];
                }
            }
        putRelation(child, maintenance, report, 'dataFlow', '基础数据统计', { route: 'orthogonal', labelOffsets: { middle: { x: 70, y: -20 } }, from: { nodeId: maintenance.id, side: 'right' }, to: { nodeId: report.id, side: 'top' }, bends: [{ x: 650, y: 105 }, { x: 650, y: 500 }, { x: 780, y: 500 }] });
        putRelation(child, store, report, 'dataFlow', '业务统计');
        const detailId = childDiagram(doc, child.id, sub.id), detail = doc.pages.find(p => p.id === detailId)!, inner = Object.values(detail.nodes).find(n => n.kind === 'dfdProcess') as ShapeNode;
        detail.name = '业务处理 · 子图';
        detail.levelLabel = '业务处理分解';
        inner.text = '校验并保存请求';
        return { pages: doc.pages, dictionary: [{ id: newId('dict'), kind: 'flow', name: '业务请求', definition: '用户标识 + 业务数据 + 请求时间（按实际需求调整）', modelIds: [], flowIds: doc.pages.flatMap(p => Object.values(p.nodes).filter(n => n.kind === 'connector' && n.text === '业务请求').map(n => n.id)) }, { id: newId('dict'), kind: 'store', name: '业务记录', definition: '保存请求内容、处理状态、结果与处理时间（按实际需求调整）', modelIds: [store.modelId!] }] };
    }
    const p = diagramPage(TEMPLATES.find(t => t.id === id)?.type || 'free', TEMPLATES.find(t => t.id === id)?.name);
    if (id === 'classes') {
        const a = putSymbol(p, 'umlClass', 'Order', 90, 300, { attributes: [{ id: newId('f'), name: 'id', type: 'String', visibility: '-' }, { id: newId('f'), name: 'total', type: 'Decimal', visibility: '-' }], operations: [{ id: newId('f'), name: 'submit', parameters: '', type: 'void', visibility: '+' }] }), b = putSymbol(p, 'umlClass', 'OrderItem', 500, 320, { attributes: [{ id: newId('f'), name: 'quantity', type: 'int', visibility: '-' }], operations: [] }), c = putSymbol(p, 'umlInterface', 'Payable', 90, 20, { stereotype: 'interface', operations: [{ id: newId('f'), name: 'pay', parameters: 'amount: Decimal', type: 'boolean', visibility: '+' }] });
        putRelation(p, a, b, 'composition', '', { startRole: 'order', endRole: 'items', startMultiplicity: '1', endMultiplicity: '1..*' });
        putRelation(p, a, c, 'realization');
    }
    else if (id === 'database') {
        const a = putSymbol(p, 'erTable', 'users', 80, 110, { fields: [{ id: 'users-id', name: 'id', type: 'INTEGER', primary: true, nullable: false }, { id: newId('f'), name: 'name', type: 'VARCHAR(100)', nullable: false }] }), b = putSymbol(p, 'erTable', 'orders', 460, 110, { fields: [{ id: 'orders-id', name: 'id', type: 'INTEGER', primary: true, nullable: false }, { id: 'orders-user', name: 'user_id', type: 'INTEGER', foreign: true, nullable: false }] }), c = putSymbol(p, 'erTable', 'order_items', 850, 110, { fields: [{ id: newId('f'), name: 'id', type: 'INTEGER', primary: true, nullable: false }, { id: 'items-order', name: 'order_id', type: 'INTEGER', foreign: true, nullable: false }, { id: newId('f'), name: 'quantity', type: 'INTEGER', nullable: false }] });
        putRelation(p, a, b, 'optionalMany', '', { from: { nodeId: a.id, side: 'right', portId: 'users-id' }, to: { nodeId: b.id, side: 'left', portId: 'orders-user' } });
        putRelation(p, b, c, 'oneMany', '', { from: { nodeId: b.id, side: 'right', portId: 'orders-id' }, to: { nodeId: c.id, side: 'left', portId: 'items-order' } });
    }
    else if (id === 'chen') {
        const a = putSymbol(p, 'erEntity', '用户', 80, 180), r = putSymbol(p, 'erRelationship', '下单', 360, 175), b = putSymbol(p, 'erWeakEntity', '订单明细', 640, 180), f = putSymbol(p, 'erAttribute', '用户编号', 85, 40);
        putRelation(p, a, r, 'association', '', { startMultiplicity: '1' });
        putRelation(p, r, b, 'association', '', { endMultiplicity: 'N' });
        putRelation(p, a, f, 'association');
    }
    else if (id === 'login') {
        const a = putSymbol(p, 'sequenceParticipant', '用户', 80, 40), b = putSymbol(p, 'sequenceParticipant', '登录服务', 350, 40), c = putSymbol(p, 'sequenceParticipant', '用户数据库', 680, 40), fragment = putSymbol(p, 'sequenceFragment', '', 65, 250, { fragment: 'alt', condition: '密码正确', secondCondition: '密码错误' });
        fragment.w = 800;
        fragment.h = 170;
        p.order = [fragment.id, ...p.order.filter(id => id !== fragment.id)];
        putRelation(p, a, b, 'syncMessage', '登录(user, password)', { messageY: 125 });
        putRelation(p, b, c, 'syncMessage', '查找用户', { messageY: 173 });
        putRelation(p, c, b, 'returnMessage', '用户记录', { messageY: 221 });
        putRelation(p, b, a, 'returnMessage', '返回登录令牌', { messageY: 285, fragmentId: fragment.id, fragmentBranch: 0 });
        putRelation(p, b, a, 'returnMessage', '提示凭据错误', { messageY: 369, fragmentId: fragment.id, fragmentBranch: 1 });
        const activation = putSymbol(p, 'sequenceActivation', '', 418, 125), activation2 = putSymbol(p, 'sequenceActivation', '', 748, 173);
        activation.activationFor = b.id;
        activation2.activationFor = c.id;
        activation.activationStart = Object.values(p.nodes).find(n => n.kind === 'connector' && n.messageY === 125)?.id;
        activation2.activationStart = Object.values(p.nodes).find(n => n.kind === 'connector' && n.messageY === 173)?.id;
        activation2.activationEnd = Object.values(p.nodes).find(n => n.kind === 'connector' && n.messageY === 221)?.id;
    }
    else if (id === 'activity') {
        const lane = putSymbol(p, 'swimlane', '用户', 60, 30);
        lane.w = 300;
        const lane2 = putSymbol(p, 'swimlane', '系统', 360, 30);
        lane2.w = 300;
        const a = putSymbol(p, 'initialState', '', 185, 85, {}, lane.id), b = putSymbol(p, 'activityAction', '提交申请', 130, 170, {}, lane.id), c = putSymbol(p, 'decision', '审核', 470, 180, {}, lane2.id), e = putSymbol(p, 'activityAction', '记录结果', 425, 335, {}, lane2.id), f = putSymbol(p, 'finalState', '', 185, 440, {}, lane.id);
        putRelation(p, a, b, 'sequenceFlow');
        putRelation(p, b, c, 'sequenceFlow');
        putRelation(p, c, e, 'sequenceFlow', '[通过]');
        putRelation(p, c, b, 'sequenceFlow', '[退回]');
        putRelation(p, e, f, 'sequenceFlow');
    }
    else if (id === 'state') {
        const a = putSymbol(p, 'initialState', '', 70, 130), b = putSymbol(p, 'umlState', '待支付', 180, 90, { entry: '启动计时', exit: '停止计时' }), c = putSymbol(p, 'umlState', '已支付', 560, 90, { entry: '通知仓库', doActivity: '等待发货' }), f = putSymbol(p, 'finalState', '', 930, 130);
        putRelation(p, a, b, 'transition');
        putRelation(p, b, c, 'transition', '支付 [金额正确] / 确认');
        putRelation(p, c, f, 'transition', '发货完成');
    }
    else if (id === 'deployment') {
        const a = putSymbol(p, 'deploymentDevice', '应用服务器', 70, 70, { stereotype: 'device', technology: 'Linux' }), b = putSymbol(p, 'deploymentDevice', '数据库服务器', 540, 70, { stereotype: 'executionEnvironment', technology: 'PostgreSQL' });
        putSymbol(p, 'artifact', 'order-service.jar', 115, 155, { technology: 'Java' }, a.id);
        putRelation(p, a, b, 'dependency', 'TCP / JDBC');
    }
    else if (id === 'package') {
        const a = putSymbol(p, 'umlPackage', '业务层', 50, 70), b = putSymbol(p, 'umlPackage', '持久化层', 530, 70);
        putSymbol(p, 'umlClass', 'OrderService', 80, 110, {}, a.id);
        putSymbol(p, 'umlClass', 'OrderRepository', 560, 110, {}, b.id);
        putRelation(p, a, b, 'dependency');
    }
    else if (id === 'bpmn') {
        const pool = putSymbol(p, 'bpmnPool', '客户', 50, 40), pool2 = putSymbol(p, 'bpmnPool', '商家', 50, 350), a = putSymbol(p, 'bpmnEvent', '', 110, 130, {}, pool.id), b = putSymbol(p, 'bpmnTask', '提交订单', 240, 110, {}, pool.id), c = putSymbol(p, 'bpmnGateway', '', 500, 125, { stereotype: 'exclusive' }, pool.id), e = putSymbol(p, 'bpmnTask', '处理订单', 240, 425, {}, pool2.id);
        putRelation(p, a, b, 'sequenceFlow');
        putRelation(p, b, c, 'sequenceFlow');
        putRelation(p, b, e, 'messageFlow', '订单消息');
    }
    else if (id === 'c4') {
        const a = putSymbol(p, 'actor', '客户', 30, 130), b = putSymbol(p, 'c4System', '订单系统', 250, 100, { responsibility: '处理下单、支付与交付', technology: 'Web + API' }), c = putSymbol(p, 'c4Container', '订单数据库', 650, 100, { technology: 'PostgreSQL', responsibility: '保存订单' });
        putRelation(p, a, b, 'dependency', 'HTTPS');
        putRelation(p, b, c, 'dependency', 'SQL / TLS');
    }
    else if (id === 'component') {
        const a = putSymbol(p, 'umlComponent', '订单服务', 100, 100, { ports: [{ id: 'api', name: 'Order API', side: 'right', offset: .5 }] }), b = putSymbol(p, 'umlComponent', '支付服务', 550, 100, { ports: [{ id: 'api', name: 'Pay API', side: 'left', offset: .5 }] });
        putRelation(p, a, b, 'dependency', 'HTTPS', { from: { nodeId: a.id, side: 'right', portId: 'api' }, to: { nodeId: b.id, side: 'left', portId: 'api' } });
    }
    else if (id === 'communication') {
        const a = putSymbol(p, 'umlObject', 'user : Customer', 70, 70), b = putSymbol(p, 'umlObject', 'order : OrderService', 460, 70), c = putSymbol(p, 'umlObject', 'pay : PayService', 460, 350);
        putRelation(p, a, b, 'communicationMessage', '下单()', { messageNumber: '1' });
        putRelation(p, b, c, 'communicationMessage', '支付()', { messageNumber: '1.1' });
        putRelation(p, c, b, 'communicationMessage', '支付结果', { messageNumber: '1.2', route: 'orthogonal', bends: [{ x: 800, y: 420 }, { x: 800, y: 140 }] });
    }
    else if (id === 'composite') {
        const frame = putSymbol(p, 'umlComposite', 'OrderSystem', 60, 50, { ports: [{ id: 'public-api', name: 'API', side: 'left', offset: .5 }] });
        frame.w = 800;
        frame.h = 360;
        const a = putSymbol(p, 'umlPart', 'orders : OrderService', 130, 160, { ports: [{ id: 'payment', name: 'pay', side: 'right', offset: .5 }] }, frame.id), b = putSymbol(p, 'umlPart', 'payments : PayService', 540, 160, { ports: [{ id: 'required', name: 'pay', side: 'left', offset: .5 }] }, frame.id);
        putRelation(p, a, b, 'association', 'pay interface', { from: { nodeId: a.id, side: 'right', portId: 'payment' }, to: { nodeId: b.id, side: 'left', portId: 'required' } });
    }
    else if (id === 'timing') {
        putSymbol(p, 'timingLifeline', '订单处理状态（时间单位：秒）', 60, 80);
        putSymbol(p, 'umlNote', '事件列表定义时间与状态；时间事件排序会更新阶梯轨迹。', 60, 360);
    }
    else if (id === 'interaction') {
        const login = templatePages('login').pages[0], a = putSymbol(p, 'initialState', '', 100, 130), ref = putSymbol(p, 'interactionRef', '登录交互', 270, 90), decision = putSymbol(p, 'decision', '成功？', 620, 100), end = putSymbol(p, 'finalState', '', 850, 125);
        ref.childPageId = login.id;
        putRelation(p, a, ref, 'sequenceFlow');
        putRelation(p, ref, decision, 'sequenceFlow');
        putRelation(p, decision, end, 'sequenceFlow', '[成功]');
        putRelation(p, decision, ref, 'sequenceFlow', '[失败]', { route: 'orthogonal', bends: [{ x: 655, y: 300 }, { x: 370, y: 300 }] });
        return { pages: [p, login] };
    }
    else if (id === 'requirements') {
        const a = putSymbol(p, 'requirement', '订单可追踪', 70, 100, { code: 'REQ-1', requirementText: '用户能查询每笔订单的状态' }), b = putSymbol(p, 'useCase', '查询订单', 480, 140, { code: 'UC-01' }), c = putSymbol(p, 'testCase', '订单查询测试', 820, 140);
        putRelation(p, a, b, 'trace');
        putRelation(p, b, c, 'trace');
    }
    else if (id === 'object') {
        const a = putSymbol(p, 'umlObject', 'order1 : Order', 70, 100, { attributes: [{ id: newId('f'), name: 'status', type: '"paid"' }] }), b = putSymbol(p, 'umlObject', 'user1 : User', 450, 100, { attributes: [{ id: newId('f'), name: 'name', type: '"张三"' }] });
        putRelation(p, a, b, 'association', 'owner');
    }
    else {
        const kind = id === 'network' ? 'networkDevice' : 'module', a = putSymbol(p, kind, id === 'network' ? '网关' : '订单模块', 350, 40, { technology: id === 'network' ? 'HTTPS / TLS' : '' }), b = putSymbol(p, kind, id === 'network' ? '应用服务器' : '支付子模块', 100, 250), c = putSymbol(p, id === 'network' ? 'c4Container' : 'module', id === 'network' ? '数据库' : '库存子模块', 620, 250);
        putRelation(p, a, b, 'dependency', '');
        putRelation(p, a, c, 'dependency', '');
    }
    return { pages: [p] };
}
export function insertTemplate(doc: Doc, id: string): void { const result = templatePages(id); doc.pages.push(...result.pages); doc.activePageId = result.pages[0].id; doc.dictionary = [...(doc.dictionary || []), ...(result.dictionary || [])]; }
export function documentMarkdown(doc: Doc): string {
    let out = `# ${doc.title}\n\n`;
    for (const p of doc.pages) {
        out += `## ${p.name}\n\n图类型：${DIAGRAMS.find(d => d.id === p.diagramType)?.label || '自由绘图'}\n\n`;
        for (const n of Object.values(p.nodes)) {
            if (!n.semantic)
                continue;
            out += `### ${(n as ShapeNode).text || n.kind} ${n.semantic.code || ''}\n\n`;
            for (const [key, label] of [['goal', '目标'], ['precondition', '前置条件'], ['postcondition', '后置条件'], ['mainFlow', '主流程'], ['exceptionFlow', '异常流程'], ['description', '说明'], ['responsibility', '职责'], ['technology', '技术栈'], ['requirementText', '需求']] as const)
                if (n.semantic[key])
                    out += `${label}：${n.semantic[key]}\n\n`;
            for (const key of ['attributes', 'operations', 'fields'] as const)
                for (const f of n.semantic[key] || [])
                    out += `- ${f.name}${f.parameters !== undefined ? '(' + f.parameters + ')' : ''}: ${f.type}${f.primary ? ' PK' : ''}${f.foreign ? ' FK' : ''}\n`;
            out += '\n';
        }
        out += '关系清单：\n\n';
        for (const n of Object.values(p.nodes))
            if (n.kind === 'connector')
                out += `- ${(p.nodes[n.from?.nodeId || ''] as ShapeNode)?.text || '悬空'} → ${(p.nodes[n.to?.nodeId || ''] as ShapeNode)?.text || '悬空'}：${n.relation || '连接'} ${n.text || ''} ${n.startMultiplicity || ''} / ${n.endMultiplicity || ''}\n`;
        out += '\n';
    }
    out += '## 数据字典\n\n';
    for (const e of doc.dictionary || [])
        out += `- ${e.name}（${e.kind}）：${e.definition}\n`;
    return out;
}
