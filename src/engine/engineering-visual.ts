import type { AnyNode, LineNode, MarkerKind, ModelField, ShapeNode } from '../types';
import { DEFAULT_FONT } from '../types';
import { isProfessional } from './engineering';
type Primitive = {
    type: 'path';
    d: string;
    fill?: string;
    dash?: boolean;
    width?: number;
} | {
    type: 'text';
    text: string;
    x: number;
    y: number;
    align?: 'start' | 'middle';
    bold?: boolean;
    underline?: boolean;
    size?: number;
};
const escapeXml = (v: string) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const rect = (x: number, y: number, w: number, h: number) => `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;
const ellipse = (x: number, y: number, rx: number, ry: number) => `M ${x - rx} ${y} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
export const fieldText = (f: ModelField, table = false) => table ? `${f.primary ? 'PK ' : ''}${f.foreign ? 'FK ' : ''}${f.name}: ${f.type}${f.nullable ? ' ?' : ' NOT NULL'}` : `${f.visibility || '+'} ${f.name}${f.parameters !== undefined ? `(${f.parameters})` : ''}${f.type ? `: ${f.type}` : ''}`;
/** One primitive representation feeds canvas rendering, library previews and SVG exports. */
export function professionalVisual(n: AnyNode): Primitive[] {
    if (!isProfessional(n))
        return [];
    const s = n as ShapeNode, d = n.semantic || {}, w = n.w, h = n.h, fs = s.fontSize || 14, row = Math.max(22, fs * 1.6), out: Primitive[] = [];
    const path = (p: string, fill = s.fill || '#fff', dash = false, width?: number) => out.push({ type: 'path', d: p, fill, dash, width });
    const label = (text: string, x = w / 2, y = h / 2, bold = false, align: 'start' | 'middle' = 'middle', underline = false, size = fs) => out.push({ type: 'text', text, x, y, bold, align, underline, size });
    const lines = (text: string, x: number, y: number, width: number, align: 'start' | 'middle' = 'middle', center = false) => {
        const wrapped: string[] = [];
        for (const para of text.split('\n')) {
            let segment = '';
            let length = 0;
            for (const c of para) {
                const cw = /[^\x00-\xff]/.test(c) ? fs : fs * .6;
                if (length + cw > width && segment) {
                    wrapped.push(segment);
                    segment = '';
                    length = 0;
                }
                segment += c;
                length += cw;
            }
            wrapped.push(segment);
        }
        let yy = center ? y - (wrapped.length - 1) * row / 2 : y;
        for (const line of wrapped) {
            label(line, x, yy, false, align);
            yy += row;
        }
    };
    const title = (s.text || '');
    switch (n.kind) {
        case 'actor':
            path(ellipse(w / 2, 18, 13, 13), 'none');
            path(`M ${w / 2} 31 V ${h - 48} M ${w * .18} 50 H ${w * .82} M ${w / 2} ${h - 48} L ${w * .23} ${h - 25} M ${w / 2} ${h - 48} L ${w * .77} ${h - 25}`, 'none');
            label(title, w / 2, h - 10);
            break;
        case 'useCase':
        case 'erAttribute':
            path(ellipse(w / 2, h / 2, w / 2, h / 2));
            lines(title, w / 2, h / 2, w * .7, 'middle', true);
            break;
        case 'dfdExternal':
        case 'erEntity':
            path(rect(0, 0, w, h));
            lines(title, w / 2, h / 2, w - 20, 'middle', true);
            break;
        case 'dfdProcess':
            if (d.notation === 'gane') {
                path(rect(0, 0, w, h));
                path(`M 0 28 H ${w}`, 'none');
                label(d.code || '', w / 2, 16, true);
                lines(title, w / 2, 55, w - 20);
            }
            else {
                path(ellipse(w / 2, h / 2, w / 2, h / 2));
                label(d.code || '', w / 2, h * .23, true);
                lines(title, w / 2, h * .57, w * .73);
            }
            break;
        case 'dfdStore':
            path(d.notation === 'gane' ? `M ${w} 0 H 0 V ${h} H ${w} M 44 0 V ${h}` : `M 0 0 H ${w} M 0 ${h} H ${w}`, 'none');
            label(d.code || '', d.notation === 'gane' ? 22 : 25, h / 2, true);
            lines(title, 55, h / 2, w - 65, 'start');
            break;
        case 'umlClass':
        case 'umlInterface':
        case 'umlEnum':
        case 'sysmlBlock':
        case 'umlObject':
        case 'umlPart':
        case 'erTable': {
            path(rect(0, 0, w, h));
            const header = n.kind === 'erTable' || n.kind === 'umlObject' ? 40 : 48;
            if (d.stereotype)
                label(`«${d.stereotype}»`, w / 2, 13, false, 'middle', false, fs - 1);
            label(title, w / 2, d.stereotype ? 32 : 23, true, 'middle', n.kind === 'umlObject');
            path(`M 0 ${header} H ${w}`, 'none');
            const fields = n.kind === 'erTable' ? d.fields : d.attributes;
            let y = header + row / 2;
            for (const f of fields || []) {
                label(fieldText(f, n.kind === 'erTable'), 10, y, false, 'start');
                y += row;
            }
            if (!fields?.length)
                y += row;
            if (!['erTable', 'umlObject', 'umlPart'].includes(n.kind)) {
                path(`M 0 ${y - row / 2 + 5} H ${w}`, 'none');
                y += 8;
                for (const f of d.operations || []) {
                    label(fieldText({ ...f, parameters: f.parameters || '' }), 10, y, false, 'start');
                    y += row;
                }
            }
            break;
        }
        case 'erRelationship':
        case 'decision':
        case 'bpmnGateway':
            path(`M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`);
            label(n.kind === 'bpmnGateway' ? (d.stereotype === 'parallel' ? '+' : '×') : title);
            break;
        case 'erWeakEntity':
            path(rect(0, 0, w, h));
            path(rect(5, 5, w - 10, h - 10), 'none');
            label(title);
            break;
        case 'umlNote':
        case 'artifact':
        case 'bpmnDataObject':
            path(`M 0 0 H ${w - 18} L ${w} 18 V ${h} H 0 Z`);
            path(`M ${w - 18} 0 V 18 H ${w}`, 'none');
            lines(title, 12, 24, w - 30, 'start');
            break;
        case 'sequenceParticipant':
            {
                const head = n.lifeStart === undefined ? 0 : Math.max(0, n.lifeStart - n.y - 21), end = n.lifeEnd === undefined ? h : Math.min(h, n.lifeEnd - n.y);
                path(rect(0, head, w, 42));
                label(title, w / 2, head + 22, true);
                path(`M ${w / 2} ${head + 42} V ${end}`, 'none', true);
                break;
            }
        case 'sequenceFragment':
            path(rect(0, 0, w, h), 'transparent');
            path(`M 0 30 H 64 L 78 18 V 0`, 'none');
            label(d.fragment || 'alt', 10, 16, true, 'start');
            label(`[${d.condition || '条件'}]`, 94, 18, false, 'start');
            if (d.fragment === 'alt' || d.fragment === 'par') {
                const split = n.fragmentSplit ?? h / 2;
                path(`M 0 ${split} H ${w}`, 'none', true);
                label(`[${d.secondCondition || '其他'}]`, 14, split + 10, false, 'start');
            }
            break;
        case 'sequenceActivation':
            path(rect(0, 0, w, h));
            break;
        case 'initialState':
        case 'finalState':
        case 'bpmnEvent':
        case 'historyState':
        case 'interfacePort':
            if (n.kind === 'interfacePort' && d.stereotype === 'required') {
                path(`M ${w * .8} 3 A ${w * .45} ${h * .45} 0 0 0 ${w * .8} ${h - 3}`, 'none');
                break;
            }
            path(ellipse(w / 2, h / 2, w / 2, h / 2), n.kind === 'initialState' ? (s.stroke || '#334155') : s.fill);
            if (n.kind === 'finalState')
                path(ellipse(w / 2, h / 2, w * .3, h * .3), s.stroke || '#334155');
            if (n.kind === 'bpmnEvent' && d.stereotype === 'end')
                path(ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2), 'none', false, 4);
            if (n.kind === 'bpmnEvent' && d.stereotype === 'intermediate')
                path(ellipse(w / 2, h / 2, w / 2 - 5, h / 2 - 5), 'none');
            if (n.kind === 'historyState')
                label(d.stereotype === 'deep' ? 'H*' : 'H');
            break;
        case 'fork':
            path(rect(0, 0, w, h), s.stroke || '#334155');
            break;
        case 'umlPackage':
            path(`M 0 0 H ${w * .42} V 26 H ${w} V ${h} H 0 Z`, 'transparent');
            label(title, 10, 15, true, 'start');
            break;
        case 'deploymentDevice':
            path(`M 0 18 L 18 0 H ${w} V ${h - 18} L ${w - 18} ${h} H 0 Z`, 'transparent');
            path(`M 0 18 H ${w - 18} V ${h} M ${w - 18} 18 L ${w} 0`, 'none');
            label(`«${d.stereotype || 'device'}»`, (w - 18) / 2, 35);
            label(title, (w - 18) / 2, 57, true);
            break;
        case 'systemBoundary':
        case 'swimlane':
        case 'bpmnPool':
        case 'umlComposite':
            path(rect(0, 0, w, h), 'transparent');
            label(title, 12, 18, true, 'start');
            if (n.kind !== 'systemBoundary')
                path(`M 0 34 H ${w}`, 'none');
            break;
        case 'interactionRef':
            path(rect(0, 0, w, h));
            path('M 0 27 H 48 L 60 15 V 0', 'none');
            label('ref', 10, 15, true, 'start');
            lines(title, w / 2, h / 2 + 10, w - 20, 'middle', true);
            break;
        case 'timingLifeline': {
            path(rect(0, 0, w, h));
            label(title, w / 2, 17, true);
            const states = d.timingStates?.length ? d.timingStates : ['空闲', '处理中', '完成'], events = [...(d.timeEvents || [])].sort((a, b) => a.time - b.time), max = Math.max(1, ...events.map(e => e.time)) * 1.1, start = 120, track = (h - 85) / Math.max(1, states.length - 1), yy = (state: string) => 52 + Math.max(0, states.indexOf(state)) * track, xx = (time: number) => start + (w - start - 25) * time / max;
            states.forEach((state, i) => { label(state, 10, 52 + i * track, false, 'start'); path(`M ${start} ${52 + i * track} H ${w - 15}`, 'none', true, 1); });
            let trace = '';
            events.forEach((e, i) => {
                trace += i ? ` H ${xx(e.time)} V ${yy(e.state)}` : `M ${xx(e.time)} ${yy(e.state)}`;
                label(String(e.time), xx(e.time), h - 16, false, 'middle', false, 11);
                if (e.label)
                    label(e.label, xx(e.time), 36, false, 'middle', false, 11);
            });
            if (events.length)
                trace += ` H ${w - 15}`;
            path(trace, 'none', false, 3);
            break;
        }
        case 'networkDatabase':
            path(`M 0 18 A ${w / 2} 18 0 0 1 ${w} 18 V ${h - 18} A ${w / 2} 18 0 0 1 0 ${h - 18} Z`);
            path(ellipse(w / 2, 18, w / 2, 18), 'none');
            label(title, w / 2, h * .58, true);
            break;
        case 'umlState':
            path(`M 12 0 H ${w - 12} Q ${w} 0 ${w} 12 V ${h - 12} Q ${w} ${h} ${w - 12} ${h} H 12 Q 0 ${h} 0 ${h - 12} V 12 Q 0 0 12 0 Z`);
            label(title, w / 2, 23, true);
            path(`M 0 42 H ${w}`, 'none');
            lines([d.entry && `entry / ${d.entry}`, d.doActivity && `do / ${d.doActivity}`, d.exit && `exit / ${d.exit}`].filter(Boolean).join('\n'), 12, 60, w - 24, 'start');
            break;
        default:
            path(['activityAction', 'bpmnTask'].includes(n.kind) ? `M 12 0 H ${w - 12} Q ${w} 0 ${w} 12 V ${h - 12} Q ${w} ${h} ${w - 12} ${h} H 12 Q 0 ${h} 0 ${h - 12} V 12 Q 0 0 12 0 Z` : rect(0, 0, w, h));
            if (n.kind === 'umlComponent')
                path(`M ${w - 35} 8 h 22 v 24 h -22 Z M ${w - 40} 12 h 10 v 6 h -10 Z M ${w - 40} 24 h 10 v 6 h -10 Z`, 'none');
            if (n.kind === 'bpmnTask' && d.stereotype === 'subprocess') {
                path(rect(w / 2 - 7, h - 19, 14, 14), 'none');
                path(`M ${w / 2} ${h - 16} V ${h - 8} M ${w / 2 - 4} ${h - 12} H ${w / 2 + 4}`, 'none');
            }
            if (n.kind === 'requirement') {
                label(`«requirement» ${d.code || ''}`, w / 2, 17);
                label(title, w / 2, 40, true);
                lines(d.requirementText || '', 12, 66, w - 24, 'start');
            }
            else {
                label(title, w / 2, d.technology || d.responsibility || d.description ? 30 : h / 2, true);
                if (d.technology)
                    label(`[${d.technology}]`, w / 2, 54);
                if (d.responsibility || d.description)
                    lines(d.responsibility || d.description || '', w / 2, 80, w - 24);
            }
    }
    for (const p of d.ports || []) {
        const t = Math.max(0, Math.min(1, p.offset));
        const x = p.side === 'left' ? 0 : p.side === 'right' ? w : w * t, y = p.side === 'top' ? 0 : p.side === 'bottom' ? h : h * t;
        path(rect(x - 4, y - 4, 8, 8), '#fff');
        label(p.name, x + 7, y - 8, false, 'start', false, 11);
    }
    return out;
}
export function drawProfessional(ctx: CanvasRenderingContext2D, n: AnyNode): boolean {
    if (!isProfessional(n))
        return false;
    const s = n as ShapeNode;
    ctx.save();
    ctx.translate(n.x, n.y);
    for (const p of professionalVisual(n)) {
        if (p.type === 'path') {
            const path = new Path2D(p.d);
            if (p.fill && p.fill !== 'none' && p.fill !== 'transparent') {
                if (s.gradient && s.fill2 && p.fill === (s.fill || '#fff')) {
                    const gradient = ctx.createLinearGradient(0, 0, n.w, n.h);
                    gradient.addColorStop(0, s.fill || '#fff');
                    gradient.addColorStop(1, s.fill2);
                    ctx.fillStyle = gradient;
                }
                else
                    ctx.fillStyle = p.fill;
                if (s.shadow) {
                    ctx.shadowColor = 'rgba(0,0,0,.28)';
                    ctx.shadowBlur = 14;
                    ctx.shadowOffsetY = 5;
                }
                ctx.fill(path);
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowColor = 'transparent';
            }
            ctx.strokeStyle = s.stroke || '#334155';
            ctx.lineWidth = p.width ?? s.strokeWidth ?? 2;
            ctx.setLineDash(p.dash ? [6, 5] : s.lineStyle === 'dashed' ? [8, 6] : s.lineStyle === 'dotted' ? [2, 5] : []);
            if (s.stroke !== 'none' && s.stroke !== 'transparent' && (p.width ?? s.strokeWidth ?? 2) > 0)
                ctx.stroke(path);
        }
        else {
            ctx.setLineDash([]);
            const size = p.size || s.fontSize || 14;
            ctx.fillStyle = s.color || '#1a1c22';
            ctx.font = `${s.italic ? 'italic ' : ''}${p.bold || s.bold ? '600' : '400'} ${size}px ${s.fontFamily || DEFAULT_FONT}`;
            ctx.textAlign = p.align === 'start' ? 'left' : 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.text, p.x, p.y);
            if (p.underline || s.underline) {
                const width = ctx.measureText(p.text).width;
                ctx.fillRect(p.x - width / 2, p.y + size * .6, width, 1);
            }
        }
    }
    ctx.restore();
    return true;
}
export function professionalSvg(n: AnyNode): string {
    const s = n as ShapeNode;
    const body = professionalVisual(n).map(p => {
        if (p.type === 'path') {
            const fill = s.gradient && s.fill2 && p.fill === (s.fill || '#fff') ? 'url(#grad_' + n.id + ')' : p.fill || 'none';
            const dash = p.dash ? ' stroke-dasharray="6 5"' : s.lineStyle === 'dashed' ? ' stroke-dasharray="8 6"' : s.lineStyle === 'dotted' ? ' stroke-dasharray="2 5"' : '';
            const shadow = s.shadow && p.fill && p.fill !== 'none' && p.fill !== 'transparent' ? ' filter="url(#shadow)"' : '';
            return `<path d="${p.d}" fill="${escapeXml(fill)}" stroke="${escapeXml(s.stroke || '#334155')}" stroke-width="${p.width ?? s.strokeWidth ?? 2}"${dash}${shadow}/>`;
        }
        return `<text x="${p.x}" y="${p.y}" text-anchor="${p.align || 'middle'}" dominant-baseline="middle" font-family="${escapeXml(s.fontFamily || DEFAULT_FONT)}" font-size="${p.size || s.fontSize || 14}" font-weight="${p.bold || s.bold ? 600 : 400}" font-style="${s.italic ? 'italic' : 'normal'}"${p.underline || s.underline ? ' text-decoration="underline"' : ''} fill="${escapeXml(s.color || '#1a1c22')}">${escapeXml(p.text)}</text>`;
    }).join('');
    return `<g transform="translate(${n.x} ${n.y})">${body}</g>`;
}
export function markerVisual(marker: MarkerKind, size = 12): {
    d: string;
    fill: 'none' | 'white' | 'stroke';
} {
    switch (marker) {
        case 'arrow': return { d: `M 0 0 L ${-size} ${-size / 2} L ${-size} ${size / 2} Z`, fill: 'stroke' };
        case 'open': return { d: `M ${-size} ${-size / 2} L 0 0 L ${-size} ${size / 2}`, fill: 'none' };
        case 'triangle': return { d: `M 0 0 L ${-size * 1.4} ${-size * .6} L ${-size * 1.4} ${size * .6} Z`, fill: 'white' };
        case 'diamond':
        case 'filledDiamond': return { d: `M 0 0 L ${-size} ${-size / 2} L ${-size * 2} 0 L ${-size} ${size / 2} Z`, fill: marker === 'diamond' ? 'white' : 'stroke' };
        case 'circle': return { d: ellipse(-size / 2, 0, size / 2, size / 2), fill: 'white' };
        case 'one': return { d: `M ${-size * .6} ${-size * .6} V ${size * .6}`, fill: 'none' };
        case 'many': return { d: `M 0 ${-size * .6} L ${-size} 0 L 0 ${size * .6} M 0 0 H ${-size}`, fill: 'none' };
        case 'zeroMany': return { d: `M 0 ${-size * .6} L ${-size} 0 L 0 ${size * .6} M 0 0 H ${-size} ${ellipse(-size * 1.6, 0, size * .35, size * .35)}`, fill: 'white' };
        case 'zeroOne': return { d: `M ${-size * .4} ${-size * .6} V ${size * .6} ${ellipse(-size * 1.3, 0, size * .35, size * .35)}`, fill: 'white' };
        case 'cross': return { d: `M ${-size / 2} ${-size / 2} L ${size / 2} ${size / 2} M ${size / 2} ${-size / 2} L ${-size / 2} ${size / 2}`, fill: 'none' };
        default: return { d: '', fill: 'none' };
    }
}
export function effectiveMarkers(n: LineNode): [
    MarkerKind,
    MarkerKind
] { return [n.startMarker ?? (n.arrow === 'both' ? 'arrow' : 'none'), n.endMarker ?? ((n.arrow || 'end') !== 'none' ? 'arrow' : 'none')]; }
export function drawMarker(ctx: CanvasRenderingContext2D, marker: MarkerKind, a: {
    x: number;
    y: number;
}, b: {
    x: number;
    y: number;
}, color: string, width: number) {
    if (marker === 'none')
        return;
    const p = markerVisual(marker, Math.max(10, width * 4));
    ctx.save();
    ctx.setLineDash([]);
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.fillStyle = p.fill === 'white' ? '#fff' : p.fill === 'stroke' ? color : 'transparent';
    const path = new Path2D(p.d);
    ctx.fill(path);
    ctx.stroke(path);
    ctx.restore();
}
export function markersSvg(n: LineNode, pts: {
    x: number;
    y: number;
}[]): string {
    const [start, end] = effectiveMarkers(n), color = escapeXml(n.stroke || '#334155'), width = n.strokeWidth || 2;
    const marker = (kind: MarkerKind, a: {
        x: number;
        y: number;
    }, b: {
        x: number;
        y: number;
    }) => {
        if (kind === 'none')
            return '';
        const p = markerVisual(kind, Math.max(10, width * 4));
        return `<path d="${p.d}" transform="translate(${b.x} ${b.y}) rotate(${Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI})" fill="${p.fill === 'white' ? '#fff' : p.fill === 'stroke' ? color : 'none'}" stroke="${color}" stroke-width="${width}"/>`;
    };
    return marker(start, pts[1], pts[0]) + marker(end, pts[pts.length - 2], pts[pts.length - 1]);
}
export function lineLabels(n: LineNode, pts: {
    x: number;
    y: number;
}[]): {
    slot: 'start' | 'middle' | 'end';
    text: string;
    x: number;
    y: number;
}[] {
    if (pts.length < 2)
        return [];
    const a = pts[0], b = pts[pts.length - 1], mid = pts.length % 2 ? pts[Math.floor(pts.length / 2)] : { x: (pts[pts.length / 2 - 1].x + pts[pts.length / 2].x) / 2, y: (pts[pts.length / 2 - 1].y + pts[pts.length / 2].y) / 2 };
    const center = n.route === 'curve' && pts.length === 3 ? { x: .25 * a.x + .5 * mid.x + .25 * b.x, y: .25 * a.y + .5 * mid.y + .25 * b.y } : mid;
    const at = (p: {
        x: number;
        y: number;
    }, next: {
        x: number;
        y: number;
    }) => { const length = Math.hypot(next.x - p.x, next.y - p.y) || 1; return { x: p.x + (next.x - p.x) / length * 32, y: p.y + (next.y - p.y) / length * 32 - 14 }; };
    const values: [
        'start' | 'middle' | 'end',
        string,
        {
            x: number;
            y: number;
        }
    ][] = [['start', [n.startLabel, n.startRole, n.startMultiplicity].filter(Boolean).join(' '), at(a, pts[1])], ['middle', `${n.messageNumber ? `${n.messageNumber}: ` : n.sequenceIndex ? `${n.sequenceIndex}: ` : ''}${n.text || ''}`, { x: center.x + (n.autoLabelOffset?.x || 0), y: center.y + (n.autoLabelOffset?.y || 0) }], ['end', [n.endLabel, n.endRole, n.endMultiplicity].filter(Boolean).join(' '), at(b, pts[pts.length - 2])]];
    return values.filter(([, text]) => !!text).map(([slot, text, p]) => ({ slot, text, x: p.x + (n.labelOffsets?.[slot]?.x || 0), y: p.y + (n.labelOffsets?.[slot]?.y || 0) }));
}
export function labelsSvg(n: LineNode, pts: {
    x: number;
    y: number;
}[]): string {
    const fs = n.fontSize || 13;
    return lineLabels(n, pts).map(l => { const width = [...l.text].reduce((a, c) => a + (/[^\x00-\xff]/.test(c) ? fs : fs * .62), 0) + 10; return `<rect x="${l.x - width / 2}" y="${l.y - fs * .8}" width="${width}" height="${fs * 1.6}" fill="#fff"/><text x="${l.x}" y="${l.y}" text-anchor="middle" dominant-baseline="middle" font-family="${escapeXml(n.fontFamily || DEFAULT_FONT)}" font-size="${fs}" fill="${escapeXml(n.color || n.stroke || '#334155')}">${escapeXml(l.text)}</text>`; }).join('');
}
export function connectorPath(n: LineNode, pts: {
    x: number;
    y: number;
}[]): string {
    if (!pts.length)
        return '';
    if (n.route === 'curve' && pts.length === 3)
        return `M ${pts[0].x} ${pts[0].y} Q ${pts[1].x} ${pts[1].y} ${pts[2].x} ${pts[2].y}`;
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], horizontal = a.y === b.y, vertical = a.x === b.x, direction = horizontal ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y);
        const jumps = n.jumpLines ? (n.jumpPoints || []).filter(p => horizontal && p.y === a.y && p.x > Math.min(a.x, b.x) + 7 && p.x < Math.max(a.x, b.x) - 7 || vertical && p.x === a.x && p.y > Math.min(a.y, b.y) + 7 && p.y < Math.max(a.y, b.y) - 7).sort((x, y) => direction * (horizontal ? x.x - y.x : x.y - y.y)) : [];
        for (const p of jumps)
            path += horizontal ? ` L ${p.x - direction * 6} ${p.y} Q ${p.x} ${p.y - 10} ${p.x + direction * 6} ${p.y}` : ` L ${p.x} ${p.y - direction * 6} Q ${p.x + 10} ${p.y} ${p.x} ${p.y + direction * 6}`;
        path += ` L ${b.x} ${b.y}`;
    }
    return path;
}
