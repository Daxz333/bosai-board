import { useStore } from '../store/board';
import { exportPageSvg } from '../engine/export';
export default function PrintAtlas({ onClose }: {
    onClose: () => void;
}) {
    const s = useStore();
    return <div className="atlas-mask"><div className="atlas-controls"><strong>{s.doc.title} · 图册预览</strong><button onClick={() => window.print()}>打印 / 另存 PDF</button><button onClick={onClose}>关闭</button></div><div className="atlas-pages">{s.doc.pages.map((p, i) => { const print = p.print || { width: 794, height: 1123, margin: 40 }; return <section key={p.id} className="atlas-page" style={{ width: print.width, minHeight: print.height, padding: print.margin, page: print.width > print.height ? 'bosaiLandscape' : 'bosaiPortrait' }}><h2>{p.name}</h2><div className="atlas-svg" style={{ height: print.height - print.margin * 2 - 85 }} dangerouslySetInnerHTML={{ __html: exportPageSvg(s.doc, p.id).svg }}/><footer>{s.doc.title} · {i + 1} / {s.doc.pages.length}</footer></section>; })}</div></div>;
}
