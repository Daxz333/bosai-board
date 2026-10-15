import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/board';
import type { DiagramType } from '../types';
import { DIAGRAMS } from '../engine/engineering';
import { exportPageSvg } from '../engine/export';
import { importPreviewDocument, type ModelImport } from '../engine/model-interop';
import { requestAiDraft, type AiSettings } from '../engine/ai-draft';
export default function AiDraftDialog({ onClose }: {
    onClose: () => void;
}) {
    const s = useStore(), [settings, setSettings] = useState<AiSettings>({ enabled: false, endpoint: '', model: '', apiKey: '', jsonSchema: true }), [type, setType] = useState<DiagramType>(s.page().diagramType || 'useCase'), [prompt, setPrompt] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState<ModelImport | null>(null), [error, setError] = useState(''), controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    const generate = async () => {
        setError('');
        setResult(null);
        setBusy(true);
        const abort = new AbortController();
        controller.current = abort;
        const timer = setTimeout(() => abort.abort(), 60000);
        try {
            setResult(await requestAiDraft(settings, prompt, type, abort.signal));
        }
        catch (e) {
            setError(abort.signal.aborted ? '请求已取消或超过 60 秒' : (e as Error).message);
        }
        finally {
            clearTimeout(timer);
            setBusy(false);
        }
    };
    return <div className="modal-mask" onClick={onClose}><div className="engineering-dialog" role="dialog" aria-label="AI 模型草稿" onClick={e => e.stopPropagation()}><div className="engineering-dialog-head"><h2>可选 AI 模型草稿</h2><button onClick={onClose}>×</button></div><p className="eng-hint">默认关闭。启用后，仅在点击“生成草稿”时将下方需求描述发送到你配置的服务。当前工程不会随请求上传。密钥只保留在本窗口内存中。</p><label className="member-flags"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })}/>启用远程模型连接</label><label className="eng-field"><span>Chat Completions 兼容服务端点</span><input aria-label="AI 服务端点" placeholder="https://…/v1/chat/completions" value={settings.endpoint} onChange={e => setSettings({ ...settings, endpoint: e.target.value })}/></label><div className="member-row"><label className="eng-field"><span>模型名称</span><input aria-label="AI 模型名称" value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value })}/></label><label className="eng-field"><span>API Key（本机服务可留空）</span><input type="password" autoComplete="off" aria-label="AI 服务密钥" value={settings.apiKey} onChange={e => setSettings({ ...settings, apiKey: e.target.value })}/></label></div><label className="member-flags"><input type="checkbox" checked={settings.jsonSchema} onChange={e => setSettings({ ...settings, jsonSchema: e.target.checked })}/>使用结构化 JSON Schema（服务不支持时可切换 JSON 模式）</label><label className="eng-field"><span>目标图类型</span><select value={type} onChange={e => setType(e.target.value as DiagramType)}>{DIAGRAMS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label><textarea className="model-source" aria-label="生成模型的需求描述" maxLength={20000} value={prompt} placeholder="描述参与角色、业务流程、实体、约束与需要表达的关系…" onChange={e => { setPrompt(e.target.value); setResult(null); }}/><div className="member-row"><button disabled={busy || !settings.enabled || !settings.endpoint || !settings.model || !prompt.trim()} onClick={generate}>{busy ? '生成中…' : '生成草稿'}</button>{busy && <button onClick={() => controller.current?.abort()}>取消请求</button>}</div>{error && <p className="engineering-error" role="alert">{error}</p>}{result && <><div className="conversion-warnings">{result.warnings.map((w, i) => <p key={i}>{w}</p>)}</div><div className="native-preview" dangerouslySetInnerHTML={{ __html: exportPageSvg(importPreviewDocument(result), result.pages[0].id).svg }}/><button className="wide-btn" onClick={() => { s.editDoc('插入 AI 模型草稿', doc => { doc.pages.push(...structuredClone(result.pages)); doc.activePageId = result.pages[0].id; }); s.fitView(); onClose(); }}>插入可编辑草稿</button></>}</div></div>;
}
