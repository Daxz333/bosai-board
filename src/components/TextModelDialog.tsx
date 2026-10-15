import { useState } from 'react';
import { expandNodeIds, useStore } from '../store/board';
import { newId } from '../types';
import type { LineNode } from '../types';
import { exportPageSvg } from '../engine/export';
import { exportModelText, exportSql, exportSymbolPackage, importDrawio, importModelText, importPreviewDocument, importSql, importSymbolPackage, type ModelImport, type TextFormat } from '../engine/model-interop';
import { downloadText } from './EngineeringWorkspace';
import { importTypeScript } from '../engine/import-code';
import { saveLocalSymbol } from '../engine/symbol-library';
const EXAMPLES: Record<TextFormat, string> = {
    plantuml: '@startuml\nactor "顾客" as Customer\nrectangle "购物系统" {\nusecase "下单" as Order\nusecase "支付" as Pay\n}\nCustomer -- Order\nOrder ..> Pay : «include»\n@enduml',
    mermaid: 'sequenceDiagram\nparticipant User as 用户\nparticipant API as 登录服务\nUser->>API: 登录\nalt 成功\nAPI-->>User: 返回令牌\nelse 失败\nAPI-->>User: 提示错误\nend',
    sql: 'CREATE TABLE users (\n id INTEGER PRIMARY KEY,\n name VARCHAR(100) NOT NULL\n);\nCREATE TABLE orders (\n id INTEGER PRIMARY KEY,\n user_id INTEGER NOT NULL REFERENCES users(id),\n total DECIMAL(10,2) NOT NULL\n);', drawio: '', symbols: '', typescript: 'export interface Payable { pay(amount: number): boolean; }\nexport class Order implements Payable {\n private id: string;\n pay(amount: number): boolean { return amount > 0; }\n}'
};
export default function TextModelDialog({ onClose }: {
    onClose: () => void;
}) {
    const s = useStore(), [format, setFormat] = useState<TextFormat>('plantuml'), [source, setSource] = useState(EXAMPLES.plantuml), [preview, setPreview] = useState<ModelImport | null>(null), [warnings, setWarnings] = useState<string[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [dialect, setDialect] = useState<'postgresql' | 'mysql' | 'sqlite'>('postgresql'), [exported, setExported] = useState(false);
    const parse = async () => {
        setBusy(true);
        setError('');
        setPreview(null);
        setExported(false);
        try {
            const result = format === 'typescript' ? await importTypeScript(source) : format === 'sql' ? importSql(source) : format === 'drawio' ? await importDrawio(source) : format === 'symbols' ? importSymbolPackage(source) : importModelText(source, format);
            importPreviewDocument(result);
            setPreview(result);
            setWarnings(result.warnings);
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    };
    const generate = () => {
        setError('');
        setPreview(null);
        try {
            const output = format === 'sql' ? exportSql(s.page(), dialect) : format === 'symbols' ? { source: exportSymbolPackage(s.doc, s.page().id, expandNodeIds(s.page(), s.selection.length ? s.selection : s.page().order)), warnings: [] } : format === 'typescript' ? (() => { throw new Error('代码当前支持 TypeScript / JavaScript 类导入；源码生成另行扩充'); })() : format === 'drawio' ? (() => { throw new Error('drawio 当前支持导入；导出请使用 SVG 或原生符号包'); })() : exportModelText(s.page(), format);
            setSource(output.source);
            setWarnings(output.warnings);
            setExported(true);
        }
        catch (e) {
            setError((e as Error).message);
        }
    };
    const apply = () => {
        if (!preview)
            return;
        try {
            s.editDoc('插入文本转换图', doc => {
                const pages = structuredClone(preview.pages), nodeIds = new Map<string, string>(), pageIds = new Map(pages.map(p => [p.id, newId('page')])), modelIds = new Map<string, string>();
                for (const p of pages)
                    for (const n of Object.values(p.nodes)) {
                        nodeIds.set(n.id, newId('n'));
                        if (n.modelId && !modelIds.has(n.modelId))
                            modelIds.set(n.modelId, newId('model'));
                    }
                for (const p of pages) {
                    p.id = pageIds.get(p.id)!;
                    p.parentPageId = p.parentPageId ? pageIds.get(p.parentPageId) : undefined;
                    p.parentProcessId = p.parentProcessId ? nodeIds.get(p.parentProcessId) : undefined;
                    const nodes = Object.values(p.nodes);
                    for (const n of nodes) {
                        const old = n.id;
                        n.id = nodeIds.get(old)!;
                        n.parent = n.parent ? nodeIds.get(n.parent) || null : null;
                        n.modelId = n.modelId ? modelIds.get(n.modelId) : undefined;
                        n.childPageId = n.childPageId ? pageIds.get(n.childPageId) : undefined;
                        const l = n as LineNode;
                        for (const key of ['from', 'to'] as const)
                            if (l[key])
                                l[key] = { ...l[key]!, nodeId: nodeIds.get(l[key]!.nodeId)! };
                    }
                    p.nodes = Object.fromEntries(nodes.map(n => [n.id, n]));
                    p.order = p.order.map(id => nodeIds.get(id)!);
                }
                doc.pages.push(...pages);
                doc.activePageId = pages[0].id;
            });
            s.fitView();
            onClose();
        }
        catch (e) {
            setError((e as Error).message);
        }
    };
    return <div className="modal-mask" onClick={onClose}><div className="engineering-dialog text-model-dialog" role="dialog" aria-label="文本与模型转换" onClick={e => e.stopPropagation()}><div className="engineering-dialog-head"><h2>文本与模型转换</h2><button onClick={onClose}>×</button></div><div className="member-row"><select aria-label="转换格式" value={format} onChange={e => { const f = e.target.value as TextFormat; setFormat(f); setSource(EXAMPLES[f]); setPreview(null); setWarnings([]); setError(''); setExported(false); }}><option value="plantuml">PlantUML 子集</option><option value="mermaid">Mermaid 子集</option><option value="sql">SQL DDL</option><option value="drawio">drawio XML</option><option value="symbols">BoSai 本地符号包</option><option value="typescript">TypeScript / JavaScript 类</option></select>{format === 'sql' && <select aria-label="SQL 方言" value={dialect} onChange={e => setDialect(e.target.value as typeof dialect)}><option value="postgresql">PostgreSQL</option><option value="mysql">MySQL</option><option value="sqlite">SQLite</option></select>}<label className="file-input-label">读取本地文件<input type="file" accept=".txt,.puml,.mmd,.sql,.drawio,.xml,.json,.ts,.js" onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file)
                return;
            if (file.size > 10000000) {
                setError('文件超过 10 MB 限制');
                return;
            }
            setSource(await file.text());
            setPreview(null);
            setExported(false);
        }}/></label></div><p className="eng-hint">支持 PlantUML 用例／类／时序、Mermaid 类／ER／时序，以及 CREATE TABLE、单列外键。预览显示转换损失；源码修改后请重新预览。TypeScript / JavaScript 使用本地编译器解析类结构，不执行代码。当前图导出会生成文件内容供检查。</p><textarea className="model-source" aria-label="模型源码" spellCheck={false} value={source} onChange={e => { setSource(e.target.value); setPreview(null); setExported(false); }}/><div className="member-row"><button disabled={busy || !source.trim()} onClick={parse}>{busy ? '解析中…' : '预览为原生对象'}</button><button onClick={generate}>从当前图生成文本</button><button disabled={!exported} onClick={() => downloadText(s.doc.title + (format === 'sql' ? '.sql' : format === 'plantuml' ? '.puml' : format === 'mermaid' ? '.mmd' : '.symbols.json'), source)}>下载预览文件</button></div>{error && <p className="engineering-error" role="alert">{error}</p>}{warnings.length > 0 && <div className="conversion-warnings"><strong>兼容范围 / 未转换内容</strong>{warnings.map((w, i) => <p key={i}>{w}</p>)}</div>}{preview && <>{format === 'symbols' && <button className="wide-btn" onClick={() => {
                    try {
                        saveLocalSymbol(s.doc.title + ' 符号', source);
                        onClose();
                    }
                    catch (e) {
                        setError((e as Error).message);
                    }
                }}>保存到本地符号库</button>}<div className="native-preview">{preview.pages.map(p => { const doc = importPreviewDocument({ pages: [p], warnings: [] }); return <div key={p.id}><strong>{p.name} · {p.order.length} 个可编辑对象</strong><div dangerouslySetInnerHTML={{ __html: exportPageSvg(doc, p.id).svg }}/></div>; })}</div><button className="wide-btn" onClick={apply}>插入 {preview.pages.length} 个新页面</button></>}</div></div>;
}
