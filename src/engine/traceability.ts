import type { Doc, LineNode, ShapeNode } from '../types';
import { newId } from '../types';
import { putRelation, reuseModel } from './engineering-commands';
export interface TraceLink {
    from: string;
    to: string;
    pageId: string;
    lineId: string;
}
export function traceLinks(doc: Doc): TraceLink[] {
    return doc.pages.flatMap(p => (Object.values(p.nodes).filter(n => n.kind === 'connector' && n.relation === 'trace') as LineNode[]).flatMap(n => { const a = n.from ? p.nodes[n.from.nodeId]?.modelId : undefined, b = n.to ? p.nodes[n.to.nodeId]?.modelId : undefined; return a && b ? [{ from: a, to: b, pageId: p.id, lineId: n.id }] : []; }));
}
export function reachableModels(doc: Doc, source: string): string[] {
    const links = traceLinks(doc), seen = new Set([source]), queue = [source];
    for (let i = 0; i < queue.length; i++)
        for (const edge of links.filter(l => l.from === queue[i]))
            if (!seen.has(edge.to)) {
                seen.add(edge.to);
                queue.push(edge.to);
            }
    return queue.slice(1);
}
export function setTrace(doc: Doc, fromModelId: string, toModelId: string, present: boolean): void {
    const matching = traceLinks(doc).filter(l => l.from === fromModelId && l.to === toModelId);
    if (!present) {
        for (const l of matching) {
            const p = doc.pages.find(p => p.id === l.pageId)!;
            delete p.nodes[l.lineId];
            p.order = p.order.filter(id => id !== l.lineId);
        }
        return;
    }
    if (matching.length)
        return;
    const page = doc.pages.find(p => p.id === doc.activePageId)!;
    const view = (modelId: string, x: number) => Object.values(page.nodes).find(n => n.modelId === modelId) || reuseModel(doc, modelId, page.id, x, 60);
    putRelation(page, view(fromModelId, 60), view(toModelId, 500), 'trace');
}
export function traceCsv(doc: Doc): string {
    const quote = (text: string) => '"' + (/^[=+\-@]/.test(text) ? "'" : '') + text.replace(/"/g, '""') + '"';
    const targets = Object.values(doc.models || {}), requirements = targets.filter(m => m.kind === 'requirement');
    return '\uFEFF' + [['需求编号', '需求名称', ...targets.filter(m => m.kind !== 'requirement').map(m => m.name)], ...requirements.map(r => { const reached = new Set(reachableModels(doc, r.id)); return [r.data.code || '', r.name, ...targets.filter(m => m.kind !== 'requirement').map(m => reached.has(m.id) ? '关联' : '')]; })].map(row => row.map(quote).join(',')).join('\r\n');
}
