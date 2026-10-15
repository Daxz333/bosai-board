import type { Doc, LineNode } from '../types';
import { DIAGRAMS, SYMBOLS, RELATIONS, MARKERS } from './engineering';
export const MAX_DOCUMENT_CHARS = 50000000;
const kinds = new Set('rect roundRect ellipse triangle diamond pentagon hexagon star cylinder cloud arrow chevron parallelogram trapezoid document sticky text frame group table image path line pencil connector'.split(' '));
SYMBOLS.forEach(s => kinds.add(s.kind));
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 100000): value is string => typeof value === 'string' && value.length <= max;
const id = (value: unknown): value is string => text(value, 200) && value.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e15;
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
function boundedWalk(part: unknown, depth = 0): void {
    if (depth > 16)
        throw new Error('专业属性结构过深');
    if (typeof part === 'number' && !finite(part))
        throw new Error('专业属性含无效数值');
    if (typeof part === 'string' && !text(part, 100000))
        throw new Error('专业属性文本过大');
    if (Array.isArray(part)) {
        if (part.length > 5000)
            throw new Error('专业属性列表过大');
        for (const item of part)
            boundedWalk(item, depth + 1);
    }
    else if (isObject(part))
        for (const item of Object.values(part))
            boundedWalk(item, depth + 1);
}
function validateData(value: unknown): void {
    if (!isObject(value))
        throw new Error('专业对象属性无效');
    for (const key of ['code', 'stereotype', 'description', 'goal', 'precondition', 'postcondition', 'mainFlow', 'exceptionFlow', 'condition', 'secondCondition', 'entry', 'exit', 'doActivity', 'technology', 'protocol', 'responsibility', 'requirementText'])
        if (value[key] !== undefined && !text(value[key]))
            throw new Error('专业文本属性无效：' + key);
    if (value.notation !== undefined && !['yourdon', 'gane'].includes(String(value.notation)))
        throw new Error('专业 DFD 表示无效');
    if (value.fragment !== undefined && !['alt', 'opt', 'loop', 'par'].includes(String(value.fragment)))
        throw new Error('时序片段类型无效');
    for (const key of ['attributes', 'operations', 'fields', 'ports']) {
        const members = value[key];
        if (members === undefined)
            continue;
        if (!Array.isArray(members) || members.length > 2000)
            throw new Error('成员数量无效');
        const ids = new Set<string>();
        for (const member of members) {
            if (!isObject(member) || !id(member.id) || ids.has(member.id) || !text(member.name) || key !== 'ports' && !text(member.type))
                throw new Error('专业成员结构无效');
            ids.add(member.id);
            if (key === 'ports' && (!['top', 'bottom', 'left', 'right', 'auto'].includes(String(member.side)) || !finite(member.offset) || (member.offset as number) < 0 || (member.offset as number) > 1))
                throw new Error('端口坐标无效');
            if (member.visibility !== undefined && !['+', '-', '#', '~'].includes(String(member.visibility)))
                throw new Error('成员可见性无效');
            if (member.parameters !== undefined && !text(member.parameters))
                throw new Error('方法参数无效');
            for (const flag of ['primary', 'foreign', 'nullable'])
                if (member[flag] !== undefined && typeof member[flag] !== 'boolean')
                    throw new Error('字段约束无效');
        }
    }
    if (value.timingStates !== undefined && (!Array.isArray(value.timingStates) || value.timingStates.length > 50 || value.timingStates.some(s => !text(s, 200))))
        throw new Error('时间线状态无效');
    if (value.timeEvents !== undefined) {
        if (!Array.isArray(value.timeEvents) || value.timeEvents.length > 500)
            throw new Error('时间事件列表无效');
        const seen = new Set<string>();
        for (const e of value.timeEvents) {
            if (!isObject(e) || !id(e.id) || seen.has(e.id) || !finite(e.time) || (e.time as number) < 0 || !text(e.state, 200) || !text(e.label))
                throw new Error('时间事件无效');
            seen.add(e.id);
        }
    }
    boundedWalk(value);
}
/** Reject malformed or unsupported native projects before any store state is replaced. */
export function validateDocument(value: unknown): Doc {
    if (!isObject(value))
        throw new Error('工程根对象无效');
    if (value.version !== 1 && value.version !== 2)
        throw new Error(`不支持的工程版本：${String(value.version)}`);
    if (!text(value.title) || !timestamp(value.createdAt) || !timestamp(value.updatedAt))
        throw new Error('工程元数据无效');
    if (value.documentId !== undefined && !id(value.documentId))
        throw new Error('工程身份无效');
    if (!Array.isArray(value.pages) || value.pages.length < 1 || value.pages.length > 500)
        throw new Error('页面数量无效');
    const pageIds = new Set<string>();
    const allNodeIds = new Set<string>();
    let totalNodes = 0;
    let totalPoints = 0;
    for (const page of value.pages) {
        if (!isObject(page) || !id(page.id) || pageIds.has(page.id) || !text(page.name) || !text(page.background, 100))
            throw new Error('页面结构或 ID 无效');
        pageIds.add(page.id);
        if (page.diagramType !== undefined && !DIAGRAMS.some(d => d.id === page.diagramType))
            throw new Error('图类型无效');
        if (page.notation !== undefined && !['yourdon', 'gane'].includes(String(page.notation)))
            throw new Error('DFD 符号规范无效');
        if (page.print !== undefined && (!isObject(page.print) || !finite(page.print.width) || !finite(page.print.height) || !finite(page.print.margin) || (page.print.width as number) <= 0 || (page.print.height as number) <= 0 || (page.print.margin as number) < 0 || (page.print.margin as number) * 2 >= Math.min(page.print.width as number, page.print.height as number)))
            throw new Error('页面打印设置无效');
        if (!isObject(page.nodes) || !Array.isArray(page.order))
            throw new Error('页面节点列表无效');
        const keys = Object.keys(page.nodes);
        totalNodes += keys.length;
        if (totalNodes > 50000 || page.order.length !== keys.length)
            throw new Error('节点数量或顺序无效');
        const ordered = new Set<string>();
        for (const nodeId of page.order) {
            if (!id(nodeId) || ordered.has(nodeId) || !hasOwn(page.nodes, nodeId))
                throw new Error('节点顺序存在重复或悬空引用');
            ordered.add(nodeId);
        }
        for (const [nodeId, node] of Object.entries(page.nodes)) {
            if (!id(nodeId) || allNodeIds.has(nodeId) || !isObject(node) || node.id !== nodeId || !kinds.has(String(node.kind)))
                throw new Error('节点 ID 或类型无效');
            allNodeIds.add(nodeId);
            for (const key of ['x', 'y', 'w', 'h', 'rot', 'z'])
                if (!finite(node[key]))
                    throw new Error(`节点 ${nodeId} 的 ${key} 无效`);
            if ((node.w as number) < 0 || (node.h as number) < 0)
                throw new Error('节点尺寸无效');
            if (node.parent !== undefined && node.parent !== null && !id(node.parent))
                throw new Error('组合引用无效');
            if (node.container !== undefined && typeof node.container !== 'boolean')
                throw new Error('容器属性无效');
            for (const key of ['fontSize', 'lineHeight', 'letterSpacing', 'strokeWidth', 'radius', 'opacity', 'curve', 'corner', 'gridWidth'])
                if (node[key] !== undefined && !finite(node[key]))
                    throw new Error('图形数值属性无效：' + key);
            for (const key of ['fill', 'fill2', 'stroke', 'color', 'fontFamily', 'text', 'headerFill', 'headerColor', 'name'])
                if (node[key] !== undefined && !text(node[key]))
                    throw new Error('图形文本或样式属性无效：' + key);
            if (node.route !== undefined && !['straight', 'orthogonal', 'curve'].includes(String(node.route)))
                throw new Error('路由类型无效');
            if (node.arrow !== undefined && !['none', 'end', 'both'].includes(String(node.arrow)))
                throw new Error('箭头类型无效');
            if (node.lineStyle !== undefined && !['solid', 'dashed', 'dotted'].includes(String(node.lineStyle)))
                throw new Error('线型无效');
            if (node.modelId !== undefined && !id(node.modelId))
                throw new Error('模型引用无效');
            if (node.semantic !== undefined)
                validateData(node.semantic);
            for (const key of ['startMarker', 'endMarker'])
                if (node[key] !== undefined && !MARKERS.some(m => m.id === node[key]))
                    throw new Error('关系端点样式无效');
            if (node.relation !== undefined && !RELATIONS.some(r => r.id === node.relation))
                throw new Error('关系类型无效');
            for (const key of ['startLabel', 'endLabel', 'startRole', 'endRole', 'startMultiplicity', 'endMultiplicity', 'messageNumber'])
                if (node[key] !== undefined && !text(node[key]))
                    throw new Error('专业关系标签无效');
            for (const key of ['messageY', 'sequenceIndex', 'fragmentSplit', 'lifeStart', 'lifeEnd'])
                if (node[key] !== undefined && !finite(node[key]))
                    throw new Error('专业视图坐标无效');
            for (const key of ['avoidObstacles', 'avoidLabels', 'jumpLines', 'layoutLocked'])
                if (node[key] !== undefined && typeof node[key] !== 'boolean')
                    throw new Error('专业视图选项无效');
            if (node.labelOffsets !== undefined) {
                if (!isObject(node.labelOffsets))
                    throw new Error('关系标签偏移无效');
                for (const [key, offset] of Object.entries(node.labelOffsets))
                    if (!['start', 'middle', 'end'].includes(key) || offset !== undefined && (!isObject(offset) || !finite(offset.x) || !finite(offset.y)))
                        throw new Error('关系标签偏移坐标无效');
            }
            if (node.autoLabelOffset !== undefined && (!isObject(node.autoLabelOffset) || !finite(node.autoLabelOffset.x) || !finite(node.autoLabelOffset.y)))
                throw new Error('自动标签偏移无效');
            if (node.kind === 'image' && (!text(node.src, 20000000) || !node.src.startsWith('data:image/')))
                throw new Error('图片资源无效或过大');
            if (node.kind === 'table') {
                if (!Number.isInteger(node.rows) || !Number.isInteger(node.cols) || (node.rows as number) < 1 || (node.cols as number) < 1 || (node.rows as number) > 1000 || (node.cols as number) > 1000 || !Array.isArray(node.data) || node.data.length !== node.rows || node.data.some((row: unknown) => !Array.isArray(row) || row.length !== node.cols || row.some((cell: unknown) => !isObject(cell) || !text(cell.text))))
                    throw new Error('表格结构无效');
            }
            for (const field of ['points', 'bends', 'anchors', 'jumpPoints']) {
                const points = node[field];
                if (points === undefined)
                    continue;
                if (!Array.isArray(points) || points.length > 100000)
                    throw new Error('路径点数量无效');
                totalPoints += points.length;
                if (totalPoints > 1000000 || points.some((point: unknown) => !isObject(point) || !finite(point.x) || !finite(point.y)))
                    throw new Error('路径点坐标无效');
            }
            // A bounded walk catches NaN/Infinity and oversized strings in optional properties.
            const walk = (part: unknown, depth: number): void => {
                if (depth > 16)
                    throw new Error('节点结构过深');
                if (typeof part === 'number' && !finite(part))
                    throw new Error('节点含无效数值');
                if (typeof part === 'string' && !text(part, 20000000))
                    throw new Error('节点文本或资源过大');
                if (Array.isArray(part))
                    for (const item of part)
                        walk(item, depth + 1);
                else if (isObject(part))
                    for (const item of Object.values(part))
                        walk(item, depth + 1);
            };
            walk(node, 0);
        }
        for (const node of Object.values(page.nodes)) {
            const n = node as unknown as LineNode;
            if (n.parent && (!hasOwn(page.nodes, n.parent) || ((page.nodes[n.parent] as Record<string, unknown>).kind !== 'group' && (page.nodes[n.parent] as Record<string, unknown>).container !== true)))
                throw new Error('容器或组合父节点不存在');
            for (const endpoint of [n.from, n.to])
                if (endpoint && (!id(endpoint.nodeId) || !hasOwn(page.nodes, endpoint.nodeId) || !['auto', 'top', 'right', 'bottom', 'left'].includes(endpoint.side)))
                    throw new Error('连接线端点无效');
            for (const endpoint of [n.from, n.to])
                if (endpoint?.portId !== undefined && !id(endpoint.portId))
                    throw new Error('端口或字段引用无效');
            if (n.fragmentId && (!hasOwn(page.nodes, n.fragmentId) || (page.nodes[n.fragmentId] as Record<string, unknown>).kind !== 'sequenceFragment'))
                throw new Error('消息片段引用无效');
            if (n.fragmentBranch !== undefined && n.fragmentBranch !== 0 && n.fragmentBranch !== 1)
                throw new Error('消息分支编号无效');
            if (n.activationFor && (!hasOwn(page.nodes, n.activationFor) || (page.nodes[n.activationFor] as Record<string, unknown>).kind !== 'sequenceParticipant'))
                throw new Error('激活对象不存在');
            for (const ref of [n.activationStart, n.activationEnd])
                if (ref && (!hasOwn(page.nodes, ref) || (page.nodes[ref] as Record<string, unknown>).kind !== 'connector'))
                    throw new Error('激活消息引用无效');
            const visited = new Set<string>();
            let parent = n.parent;
            while (parent) {
                if (visited.has(parent))
                    throw new Error('组合层级存在循环');
                visited.add(parent);
                parent = (page.nodes[parent] as Record<string, unknown>).parent as string | undefined;
            }
        }
    }
    if (!id(value.activePageId) || !pageIds.has(value.activePageId))
        throw new Error('当前页面不存在');
    for (const p of value.pages as Record<string, unknown>[]) {
        if (p.parentPageId !== undefined && (!id(p.parentPageId) || !pageIds.has(p.parentPageId)))
            throw new Error('父图不存在');
        const parent = (value.pages as Record<string, unknown>[]).find(parent => parent.id === p.parentPageId);
        if (p.parentProcessId !== undefined && (!parent || !id(p.parentProcessId) || !hasOwn(parent.nodes as object, p.parentProcessId)))
            throw new Error('父图处理过程不存在');
        const seen = new Set<string>([p.id as string]);
        let current = parent;
        while (current) {
            if (seen.has(current.id as string))
                throw new Error('页面分解层级存在循环');
            seen.add(current.id as string);
            current = (value.pages as Record<string, unknown>[]).find(x => x.id === current!.parentPageId);
        }
        for (const n of Object.values(p.nodes as Record<string, Record<string, unknown>>))
            if (n.childPageId !== undefined && (!id(n.childPageId) || !pageIds.has(n.childPageId)))
                throw new Error('子图不存在');
    }
    if (value.models !== undefined) {
        if (!isObject(value.models) || Object.keys(value.models).length > 50000)
            throw new Error('模型仓库无效');
        for (const [key, m] of Object.entries(value.models)) {
            if (!isObject(m) || m.id !== key || !id(key) || !SYMBOLS.some(s => s.kind === m.kind) || !text(m.name) || !isObject(m.data))
                throw new Error('模型对象无效');
            validateData(m.data);
        }
        for (const p of value.pages as Record<string, unknown>[])
            for (const n of Object.values(p.nodes as Record<string, Record<string, unknown>>))
                if (n.modelId && (!hasOwn(value.models, String(n.modelId)) || (value.models[String(n.modelId)] as Record<string, unknown>).kind !== n.kind))
                    throw new Error('模型引用不存在或类型不一致');
    }
    if (value.dictionary !== undefined && (!Array.isArray(value.dictionary) || value.dictionary.length > 10000 || value.dictionary.some((e: unknown) => !isObject(e) || !id(e.id) || !['flow', 'store', 'item'].includes(String(e.kind)) || !text(e.name) || !text(e.definition) || !Array.isArray(e.modelIds) || e.modelIds.some((ref: unknown) => !id(ref) || !isObject(value.models) || !hasOwn(value.models, ref)))))
        throw new Error('数据字典无效');
    if (Array.isArray(value.dictionary)) {
        const seen = new Set<string>();
        for (const entry of value.dictionary as Record<string, unknown>[]) {
            if (seen.has(entry.id as string))
                throw new Error('字典 ID 重复');
            seen.add(entry.id as string);
            if (entry.flowIds !== undefined && (!Array.isArray(entry.flowIds) || entry.flowIds.some(ref => !id(ref) || !allNodeIds.has(ref))))
                throw new Error('字典数据流引用无效');
        }
    }
    if (value.version === 1)
        return { ...value, version: 2, models: {}, dictionary: [], pages: (value.pages as Record<string, unknown>[]).map(p => ({ ...p, diagramType: 'free' })) } as unknown as Doc;
    return value as unknown as Doc;
}
export function parseDocument(content: string): Doc {
    if (content.length > MAX_DOCUMENT_CHARS)
        throw new Error('工程文件超过 50 MB 限制');
    return validateDocument(JSON.parse(content));
}
