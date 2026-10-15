import type { AnyNode, LineNode, Page } from '../types';
import { routeOrthogonal } from './shapes';
import type { Pt, Rect } from './geometry';
import { renumberMessages } from './engineering-commands';
import { lineLabels } from './engineering-visual';
/** Deterministic, bounded local layout. Cycles occupy the last rank. Locked views never move. */
export function layoutDiagram(page: Page, mode: 'tree' | 'layered' | 'orthogonal', selection: string[] = []) {
    if (page.diagramType === 'sequence') {
        const participants = Object.values(page.nodes).filter(n => n.kind === 'sequenceParticipant').sort((a, b) => a.x - b.x);
        participants.forEach((n, i) => {
            if (!n.locked && !n.layoutLocked) {
                n.x = 70 + i * 270;
                n.y = 40;
            }
        });
        renumberMessages(page);
        return;
    }
    const chosen = new Set(selection), nodes = Object.values(page.nodes).filter(n => !['connector', 'line', 'pencil', 'group'].includes(n.kind) && !n.container && !n.hidden && !n.locked && !n.layoutLocked && (chosen.size ? chosen.has(n.id) : !n.parent)), set = new Set(nodes.map(n => n.id));
    const edges = (Object.values(page.nodes).filter(n => n.kind === 'connector') as LineNode[]).filter(e => set.has(e.from?.nodeId || '') && set.has(e.to?.nodeId || '')), incoming = new Map(nodes.map(n => [n.id, 0])), rank = new Map(nodes.map(n => [n.id, 0]));
    for (const e of edges)
        incoming.set(e.to!.nodeId, incoming.get(e.to!.nodeId)! + 1);
    const queue = nodes.filter(n => incoming.get(n.id) === 0).map(n => n.id), seen = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        seen.add(id);
        for (const e of edges.filter(e => e.from?.nodeId === id)) {
            const to = e.to!.nodeId;
            rank.set(to, Math.max(rank.get(to)!, rank.get(id)! + 1));
            incoming.set(to, incoming.get(to)! - 1);
            if (incoming.get(to) === 0)
                queue.push(to);
        }
    }
    const last = Math.max(0, ...rank.values()) + 1;
    for (const n of nodes)
        if (!seen.has(n.id))
            rank.set(n.id, last);
    const maxW = Math.max(180, ...nodes.map(n => n.w)), maxH = Math.max(100, ...nodes.map(n => n.h)), used = new Map<number, number>(), origin = { x: Math.min(80, ...nodes.map(n => n.x)), y: Math.min(80, ...nodes.map(n => n.y)) };
    const fixed = Object.values(page.nodes).filter(n => (n.locked || n.layoutLocked) && !['connector', 'line', 'pencil'].includes(n.kind));
    nodes.forEach((n, i) => {
        const r = mode === 'orthogonal' ? Math.floor(i / 3) : rank.get(n.id)!, col = mode === 'orthogonal' ? i % 3 : used.get(r) || 0;
        used.set(r, col + 1);
        n.x = origin.x + (mode === 'tree' ? col : r) * (maxW + 100);
        n.y = origin.y + (mode === 'tree' ? r : mode === 'orthogonal' ? r : col) * (maxH + 80);
        if (mode === 'orthogonal')
            n.x = origin.x + col * (maxW + 100);
        let attempts = 0;
        while (fixed.some(f => n.x < f.x + f.w + 25 && n.x + n.w + 25 > f.x && n.y < f.y + f.h + 25 && n.y + n.h + 25 > f.y) && attempts++ < 100)
            n.y += maxH + 80;
    });
}
const segmentHits = (a: Pt, b: Pt, r: Rect) => a.x === b.x ? a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h : a.y === b.y ? a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w : false;
/** Search orthogonal corridor candidates, including a corridor outside all obstacles. */
export function routeAvoiding(a: Pt, b: Pt, obstacles: AnyNode[], fromId?: string, toId?: string): Pt[] {
    const rects = obstacles.filter(n => n.id !== fromId && n.id !== toId && !n.hidden && !n.container && !['connector', 'line', 'pencil', 'group', 'sequenceParticipant'].includes(n.kind)).slice(0, 300).map(n => ({ x: n.x - 12, y: n.y - 12, w: n.w + 24, h: n.h + 24 })).filter(r => !(a.x > r.x && a.x < r.x + r.w && a.y > r.y && a.y < r.y + r.h) && !(b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h));
    const baseline = routeOrthogonal(a, b, Math.abs(a.x - b.x) > Math.abs(a.y - b.y) ? 'h' : 'v');
    const count = (pts: Pt[]) => pts.slice(1).reduce((n, p, i) => n + rects.filter(r => segmentHits(pts[i], p, r)).length, 0);
    if (!count(baseline))
        return baseline;
    const xs = [...new Set(rects.flatMap(r => [r.x - 1, r.x + r.w + 1]))], ys = [...new Set(rects.flatMap(r => [r.y - 1, r.y + r.h + 1]))], candidates = [baseline];
    for (const x of xs)
        candidates.push([a, { x, y: a.y }, { x, y: b.y }, b]);
    for (const y of ys)
        candidates.push([a, { x: a.x, y }, { x: b.x, y }, b]);
    // Five-segment routes handle endpoints boxed in by unrelated nodes.
    const nearX = xs.sort((x, y) => Math.min(Math.abs(x - a.x), Math.abs(x - b.x)) - Math.min(Math.abs(y - a.x), Math.abs(y - b.x))).slice(0, 12);
    const outerY = ys.sort((x, y) => Math.abs(x - (a.y + b.y) / 2) - Math.abs(y - (a.y + b.y) / 2)).slice(0, 12);
    for (const x of nearX)
        for (const y of outerY)
            candidates.push([a, { x, y: a.y }, { x, y }, { x: b.x, y }, b]);
    const score = (pts: Pt[]) => count(pts) * 1e7 + pts.slice(1).reduce((n, p, i) => n + Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y), 0) + pts.length * 10;
    return candidates.sort((x, y) => score(x) - score(y))[0].filter((p, i, pts) => !i || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}
/** Geometry caches are recalculated with the view; manual label offsets remain untouched. */
export function decorateConnections(page: Page): void {
    const lines = Object.values(page.nodes).filter(n => n.kind === 'connector') as LineNode[], active = lines.filter(n => n.jumpLines).slice(0, 150), points = (n: LineNode) => (n.points || []).map(p => ({ x: n.x + p.x, y: n.y + p.y }));
    for (const n of lines) {
        delete n.jumpPoints;
        delete n.autoLabelOffset;
    }
    for (const n of active) {
        const own = points(n), crossings: Pt[] = [];
        for (const other of lines.slice(0, 300)) {
            if (other.id === n.id)
                continue;
            const theirs = points(other);
            for (let i = 1; i < own.length; i++)
                for (let j = 1; j < theirs.length; j++) {
                    const a = own[i - 1], b = own[i], c = theirs[j - 1], d = theirs[j], horizontal = a.y === b.y && c.x === d.x, vertical = a.x === b.x && c.y === d.y;
                    if (!horizontal && !vertical)
                        continue;
                    const p = horizontal ? { x: c.x, y: a.y } : { x: a.x, y: c.y };
                    if (p.x >= Math.min(a.x, b.x) + 8 && p.x <= Math.max(a.x, b.x) - 8 && p.y > Math.min(c.y, d.y) + 8 && p.y < Math.max(c.y, d.y) - 8 || vertical && p.y >= Math.min(a.y, b.y) + 8 && p.y <= Math.max(a.y, b.y) - 8 && p.x > Math.min(c.x, d.x) + 8 && p.x < Math.max(c.x, d.x) - 8)
                        if (!crossings.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 12))
                            crossings.push(p);
                }
        }
        n.jumpPoints = crossings;
    }
    const rectangles = Object.values(page.nodes).filter(n => !n.hidden && !n.container && !['connector', 'line', 'pencil', 'group', 'sequenceParticipant', 'sequenceActivation'].includes(n.kind));
    for (const n of lines.filter(n => n.avoidLabels && !n.labelOffsets?.middle)) {
        const middle = lineLabels(n, points(n)).find(l => l.slot === 'middle');
        if (!middle)
            continue;
        const fs = n.fontSize || 13, width = [...middle.text].reduce((sum, c) => sum + (/[^\x00-\xff]/.test(c) ? fs : fs * .65), 12);
        const overlaps = (dy: number) => rectangles.some(r => middle.x + width / 2 > r.x && middle.x - width / 2 < r.x + r.w && middle.y + dy + fs > r.y && middle.y + dy - fs < r.y + r.h);
        if (overlaps(0))
            for (let step = 1; step < 25; step++) {
                const delta = (step % 2 ? -1 : 1) * Math.ceil(step / 2) * 25;
                if (!overlaps(delta)) {
                    n.autoLabelOffset = { x: 0, y: delta };
                    break;
                }
            }
    }
}
