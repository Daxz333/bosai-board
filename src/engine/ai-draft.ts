import type { DiagramType, EngineeringData, ModelField, ProfessionalKind, RelationKind, ShapeNode } from '../types';
import { newId } from '../types';
import { DIAGRAMS, RELATIONS, SYMBOLS } from './engineering';
import { diagramPage, putRelation, putSymbol } from './engineering-commands';
import { importPreviewDocument, type ModelImport } from './model-interop';
import { validateDocument } from './document-validation';
const string = { type: 'string' }, array = (items: unknown) => ({ type: 'array', items }), object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const field = object({ name: string, type: string, primary: { type: 'boolean' }, foreign: { type: 'boolean' }, nullable: { type: 'boolean' } });
const schema = object({ pageName: string, symbols: array(object({ alias: string, kind: { type: 'string', enum: SYMBOLS.map(s => s.kind) }, name: string, parent: string, code: string, description: string, goal: string, precondition: string, postcondition: string, mainFlow: string, exceptionFlow: string, attributes: array(field), fields: array(field), operations: array(object({ name: string, type: string, parameters: string })) })), relations: array(object({ from: string, to: string, kind: { type: 'string', enum: RELATIONS.map(r => r.id) }, label: string })), notes: array(string) });
export interface AiSettings {
    endpoint: string;
    model: string;
    apiKey: string;
    enabled: boolean;
    jsonSchema: boolean;
}
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const boundedString = (v: unknown, max = 10000): v is string => typeof v === 'string' && v.length <= max;
export function parseAiDraft(value: unknown, type: DiagramType): ModelImport {
    if (!plain(value) || !boundedString(value.pageName) || !Array.isArray(value.symbols) || !value.symbols.length || value.symbols.length > 100 || !Array.isArray(value.relations) || value.relations.length > 250 || !Array.isArray(value.notes) || value.notes.length > 100 || value.notes.some(n => !boundedString(n)))
        throw new Error('模型草稿结构或数量无效');
    const page = diagramPage(type, value.pageName), aliases = new Map<string, ShapeNode>(), parents = new Map<string, string>(), warnings: string[] = value.notes as string[];
    for (const item of value.symbols) {
        if (!plain(item) || !boundedString(item.alias, 200) || !item.alias || aliases.has(item.alias) || !SYMBOLS.some(s => s.kind === item.kind) || !boundedString(item.name) || !boundedString(item.parent, 200))
            throw new Error('模型草稿存在未知图形、重复别名或无效名称');
        const data: EngineeringData = {};
        for (const key of ['code', 'description', 'goal', 'precondition', 'postcondition', 'mainFlow', 'exceptionFlow'] as const) {
            if (!boundedString(item[key]))
                throw new Error('草稿属性无效：' + key);
            data[key] = item[key] as string;
        }
        for (const key of ['attributes', 'fields', 'operations'] as const) {
            const fields = item[key];
            if (!Array.isArray(fields) || fields.length > 100)
                throw new Error('草稿成员列表无效');
            data[key] = fields.map(f => {
                if (!plain(f) || !boundedString(f.name) || !boundedString(f.type) || key === 'operations' && !boundedString(f.parameters))
                    throw new Error('草稿成员无效');
                return { id: newId('field'), name: f.name, type: f.type, visibility: '+', ...(key === 'operations' ? { parameters: f.parameters } : {}), ...(key === 'fields' ? { primary: f.primary, foreign: f.foreign, nullable: f.nullable } : {}) } as ModelField;
            });
        }
        const n = putSymbol(page, item.kind as ProfessionalKind, item.name, 60 + (aliases.size % 3) * 350, 60 + Math.floor(aliases.size / 3) * 260, data);
        if (type === 'sequence' && n.kind === 'sequenceParticipant') {
            n.x = 60 + aliases.size * 250;
            n.y = 40;
        }
        aliases.set(item.alias, n);
        parents.set(item.alias, item.parent);
    }
    for (const [alias, parent] of parents) {
        if (!parent)
            continue;
        const n = aliases.get(alias)!, container = aliases.get(parent);
        if (!container?.container || n.id === container.id)
            throw new Error('草稿包含关系无效');
        n.parent = container.id;
    }
    for (const container of aliases.values())
        if (container.container) {
            const children = [...aliases.values()].filter(n => n.parent === container.id);
            if (children.length) {
                container.x = Math.min(...children.map(n => n.x)) - 30;
                container.y = Math.min(...children.map(n => n.y)) - 50;
                container.w = Math.max(...children.map(n => n.x + n.w)) - container.x + 30;
                container.h = Math.max(...children.map(n => n.y + n.h)) - container.y + 30;
                page.order = [container.id, ...page.order.filter(id => id !== container.id)];
            }
        }
    for (const [index, item] of value.relations.entries()) {
        if (!plain(item) || !boundedString(item.from, 200) || !boundedString(item.to, 200) || !aliases.has(item.from) || !aliases.has(item.to) || !RELATIONS.some(r => r.id === item.kind) || !boundedString(item.label))
            throw new Error('草稿关系存在未定义端点或类型');
        putRelation(page, aliases.get(item.from)!, aliases.get(item.to)!, item.kind as RelationKind, item.label, type === 'sequence' ? { messageY: 125 + index * 48 } : {});
    }
    const result = { pages: [page], warnings: ['AI 生成草稿，请检查对象、关系方向与业务含义，再插入工程。', ...warnings] };
    validateDocument(importPreviewDocument(result));
    return result;
}
export async function requestAiDraft(settings: AiSettings, prompt: string, type: DiagramType, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ModelImport> {
    if (!settings.enabled)
        throw new Error('请先启用可选远程模型连接');
    if (!settings.model.trim() || !prompt.trim() || prompt.length > 20000)
        throw new Error('请填写模型名称及 2 万字以内的需求描述');
    const endpoint = new URL(settings.endpoint);
    if (endpoint.username || endpoint.password || endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))
        throw new Error('仅允许 HTTPS 或本机 HTTP 模型端点');
    const instructions = `Create a software engineering diagram draft for ${DIAGRAMS.find(d => d.id === type)?.label}. Return JSON matching this schema: ${JSON.stringify(schema)}. Use only registered symbol and relationship kinds. Unique aliases, parent is an existing container alias or empty string. Do not provide positions, IDs, executable code, HTML, URLs or file references. Supply empty strings/arrays for inapplicable properties. For include/extend use their correct UML direction. Notes describe assumptions and concerns. Names and descriptions should follow the language of the requirements.`;
    const response = await fetcher(endpoint.toString(), { method: 'POST', signal, redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { Authorization: 'Bearer ' + settings.apiKey } : {}) }, body: JSON.stringify({ model: settings.model.trim(), messages: [{ role: 'system', content: instructions }, { role: 'user', content: prompt }], response_format: settings.jsonSchema ? { type: 'json_schema', json_schema: { name: 'bosai_diagram_draft', strict: true, schema } } : { type: 'json_object' } }) });
    if (!response.ok)
        throw new Error(`模型服务返回 HTTP ${response.status}，请检查端点、模型和凭据`);
    const reader = response.body?.getReader();
    let content = '';
    if (reader) {
        let total = 0;
        const decoder = new TextDecoder();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                total += value.byteLength;
                if (total > 2000000)
                    throw new Error('模型响应超过 2 MB');
                content += decoder.decode(value, { stream: true });
            }
            content += decoder.decode();
        }
        finally {
            await reader.cancel();
        }
    }
    else {
        content = await response.text();
        if (content.length > 2000000)
            throw new Error('模型响应过大');
    }
    const envelope = JSON.parse(content), choice = envelope?.choices?.[0];
    if (choice?.message?.refusal)
        throw new Error('模型未生成此草稿：' + String(choice.message.refusal).slice(0, 300));
    if (choice?.finish_reason === 'length')
        throw new Error('模型响应不完整，请减少需求范围');
    const text = choice?.message?.content;
    if (typeof text !== 'string')
        throw new Error('模型服务未返回文本草稿');
    return parseAiDraft(JSON.parse(text), type);
}
