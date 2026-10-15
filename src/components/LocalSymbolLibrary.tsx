import { useEffect, useState } from 'react';
import { expandNodeIds, useStore } from '../store/board';
import type { LineNode } from '../types';
import { exportSymbolPackage, importSymbolPackage } from '../engine/model-interop';
import { exportPageSvg } from '../engine/export';
import { localSymbols, removeLocalSymbol, saveLocalSymbol, symbolDocument } from '../engine/symbol-library';
export default function LocalSymbolLibrary() {
    const s = useStore(), [symbols, setSymbols] = useState(localSymbols), [name, setName] = useState('我的专业符号'), [error, setError] = useState('');
    useEffect(() => { const refresh = () => setSymbols(localSymbols()); window.addEventListener('bosai:symbol-library', refresh); return () => window.removeEventListener('bosai:symbol-library', refresh); }, []);
    return <div className="shape-group"><div className="group-label">本地自定义符号</div><input className="local-symbol-name" aria-label="本地符号名称" value={name} onChange={e => setName(e.target.value)}/><button className="wide-btn" disabled={!s.selection.length} onClick={() => {
            try {
                setSymbols(saveLocalSymbol(name, exportSymbolPackage(s.doc, s.page().id, expandNodeIds(s.page(), s.selection))));
                setError('');
            }
            catch (e) {
                setError((e as Error).message);
            }
        }}>保存选区 / 更新同名符号</button>{error && <p className="engineering-error">{error}</p>}
    {symbols.map(symbol => {
            const doc = symbolDocument(symbol), page = doc.pages[0], svg = exportPageSvg(doc, page.id).svg;
            return <div className="local-symbol-card" key={symbol.id}><button title="插入为可编辑原生对象" onClick={() => {
                    const result = importSymbolPackage(symbol.source), nodes = Object.values(result.pages[0].nodes), x = Math.min(...nodes.map(n => n.x)), y = Math.min(...nodes.map(n => n.y)), host = document.querySelector('.canvas-host') as HTMLElement, target = { x: ((host?.clientWidth || 700) / 2 - s.camera.x) / s.camera.zoom, y: ((host?.clientHeight || 500) / 2 - s.camera.y) / s.camera.zoom };
                    for (const n of nodes) {
                        const dx = target.x - x, dy = target.y - y;
                        n.x += dx;
                        n.y += dy;
                        const l = n as LineNode;
                        if (l.bends)
                            l.bends = l.bends.map(p => ({ x: p.x + dx, y: p.y + dy }));
                        if (l.messageY !== undefined)
                            l.messageY += dy;
                    }
                    s.addNodes(nodes, '插入本地符号');
                    s.setTool('select');
                }}><div dangerouslySetInnerHTML={{ __html: svg }}/><span>{symbol.name}</span></button><button title="从本地库移除" onClick={() => removeLocalSymbol(symbol.id)}>×</button></div>;
        })}
    <p className="eng-hint">选中图形或组合后保存；字段、端口、样式和内嵌资源随符号保留。符号包可在“文本 / SQL”中导入导出。</p>
  </div>;
}
