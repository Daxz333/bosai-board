import type { AnyNode, Doc, LineNode, Page, ProfessionalKind, RelationKind, ShapeNode } from '../types';
import { newId } from '../types';
import { diagramPage, putRelation, putSymbol } from './engineering-commands';
import { reconcileEngineering, symbolDefinition } from './engineering';
import { validateDocument } from './document-validation';
import { parseXml } from './import-svg';
export interface ModelImport {
    pages: Page[];
    warnings: string[];
}
export type TextFormat = 'plantuml' | 'mermaid' | 'sql' | 'drawio' | 'symbols' | 'typescript';
const ident = '(?:"(?:[^"\\n]|"")+"|`[^`\\n]+`|\\[[^\\]\\n]+\\]|[\\w\\u0080-\\uFFFF.$]+)';
const clean = (s: string) => s.trim().replace(/^["`\[]|["`\]]$/g, '').replace(/""/g, '"');
export function splitTopLevel(text: string, separator = ','): string[] {
    const out: string[] = [];
    let depth = 0, quote = '', start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            if (c === quote) {
                if (text[i + 1] === quote)
                    i++;
                else
                    quote = '';
            }
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            continue;
        }
        if (c === '(')
            depth++;
        if (c === ')')
            depth--;
        if (c === separator && depth === 0) {
            out.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    if (quote || depth !== 0)
        throw new Error('未闭合的字符串或括号');
    if (text.slice(start).trim())
        out.push(text.slice(start).trim());
    return out;
}
export function importSql(source: string): ModelImport {
    if (source.length > 2000000)
        throw new Error('SQL 文本过大');
    const pages = [diagramPage('er', 'SQL 数据库表图')], p = pages[0], warnings: string[] = [], tables = new Map<string, ShapeNode>(), references: {
        child: string;
        field: string;
        parent: string;
        parentField: string;
    }[] = [];
    const statements = splitTopLevel(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, ''), ';');
    for (const statement of statements) {
        const m = statement.match(new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${ident})\\s*\\(([\\s\\S]*)\\)\\s*(.*)$`, 'i'));
        if (!m) {
            warnings.push('未转换语句：' + statement.slice(0, 100));
            continue;
        }
        const name = clean(m[1]);
        if (tables.has(name.toLowerCase()))
            throw new Error('重复的表名：' + name);
        const table = putSymbol(p, 'erTable', name, 60 + (tables.size % 3) * 370, 60 + Math.floor(tables.size / 3) * 320, { fields: [] });
        tables.set(name.toLowerCase(), table);
        if (m[3].trim())
            warnings.push(`${name}：表选项未保留：${m[3]}`);
        const pk: string[] = [], fk: typeof references = [];
        for (const definition of splitTopLevel(m[2])) {
            const part = definition.replace(new RegExp(`^CONSTRAINT\\s+${ident}\\s+`, 'i'), '');
            const primary = part.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
            if (primary) {
                pk.push(...splitTopLevel(primary[1]).map(clean));
                continue;
            }
            const foreign = part.match(new RegExp(`^FOREIGN\\s+KEY\\s*\\(([^)]+)\\)\\s+REFERENCES\\s+(${ident})\\s*\\(([^)]+)\\)(.*)$`, 'i'));
            if (foreign) {
                const keys = splitTopLevel(foreign[1]).map(clean), targetKeys = splitTopLevel(foreign[3]).map(clean);
                if (keys.length !== 1 || targetKeys.length !== 1) {
                    warnings.push(`${name}：复合外键未转换：${definition}`);
                    continue;
                }
                fk.push({ child: name, field: keys[0], parent: clean(foreign[2]), parentField: targetKeys[0] });
                if (foreign[4].trim())
                    warnings.push(`${name}：外键行为未保留：${foreign[4]}`);
                continue;
            }
            if (/^(UNIQUE|CHECK|INDEX|KEY)\b/i.test(part)) {
                warnings.push(`${name}：约束未保留：${definition}`);
                continue;
            }
            const column = part.match(new RegExp(`^(${ident})\\s+([A-Za-z][\\w]*(?:\\s+(?:PRECISION|VARYING))?(?:\\s*\\([^)]*\\))?(?:\\[\\])?)\\s*([\\s\\S]*)$`, 'i'));
            if (!column) {
                warnings.push(`${name}：列未转换：${definition}`);
                continue;
            }
            const fieldName = clean(column[1]);
            if (table.semantic!.fields!.some(f => f.name.toLowerCase() === fieldName.toLowerCase()))
                throw new Error(`表 ${name} 含重复字段 ${fieldName}`);
            const tail = column[3], isPrimary = /\bPRIMARY\s+KEY\b/i.test(tail), ref = tail.match(new RegExp(`REFERENCES\\s+(${ident})\\s*\\(\\s*(${ident})\\s*\\)(.*)$`, 'i'));
            table.semantic!.fields!.push({ id: newId('field'), name: fieldName, type: column[2].toUpperCase().replace(/\s+\(/g, '('), primary: isPrimary, foreign: !!ref, nullable: !isPrimary && !/\bNOT\s+NULL\b/i.test(tail) });
            if (ref)
                fk.push({ child: name, field: fieldName, parent: clean(ref[1]), parentField: clean(ref[2]) });
            if (/\b(DEFAULT|UNIQUE|CHECK|AUTO_INCREMENT|AUTOINCREMENT|GENERATED|COLLATE|COMMENT)\b/i.test(tail) || ref?.[3].trim())
                warnings.push(`${name}.${fieldName}：默认值、唯一约束、生成规则或引用行为未保留`);
        }
        for (const name of pk) {
            const f = table.semantic!.fields!.find(f => f.name === name);
            if (f) {
                f.primary = true;
                f.nullable = false;
            }
            else
                warnings.push(`主键字段未找到：${name}`);
        }
        references.push(...fk);
    }
    for (const ref of references) {
        const child = tables.get(ref.child.toLowerCase()), parent = tables.get(ref.parent.toLowerCase()), field = child?.semantic?.fields?.find(f => f.name === ref.field), target = parent?.semantic?.fields?.find(f => f.name === ref.parentField);
        if (!child || !parent || !field || !target) {
            warnings.push(`外键引用未找到：${ref.child}.${ref.field} → ${ref.parent}.${ref.parentField}`);
            continue;
        }
        field.foreign = true;
        putRelation(p, parent, child, 'optionalMany', '', { from: { nodeId: parent.id, side: 'right', portId: target.id }, to: { nodeId: child.id, side: 'left', portId: field.id }, endMultiplicity: '0..*' });
    }
    if (!tables.size)
        throw new Error('未找到受支持的 CREATE TABLE 语句');
    return { pages, warnings };
}
export function exportSql(page: Page, dialect: 'postgresql' | 'mysql' | 'sqlite'): {
    source: string;
    warnings: string[];
} {
    const tables = Object.values(page.nodes).filter(n => n.kind === 'erTable') as ShapeNode[], warnings: string[] = [], quote = (s: string) => dialect === 'mysql' ? '`' + s.replace(/`/g, '``') + '`' : '"' + s.replace(/"/g, '""') + '"';
    const type = (raw: string) => {
        let t = raw.trim().toUpperCase() || 'TEXT';
        if (!/^[A-Z][A-Z0-9_ ]*(?:\(\d+(?:\s*,\s*\d+)?\))?(?:\[\])?$/.test(t)) {
            warnings.push(`类型 ${raw} 无法安全生成，使用 TEXT`);
            return 'TEXT';
        }
        if (dialect === 'sqlite') {
            if (/INT|BOOL/.test(t))
                return 'INTEGER';
            if (/CHAR|TEXT|CLOB/.test(t))
                return 'TEXT';
            if (/BLOB|BYTEA|BINARY/.test(t))
                return 'BLOB';
            if (/REAL|FLOAT|DOUBLE/.test(t))
                return 'REAL';
            return 'NUMERIC';
        }
        if (dialect === 'mysql' && t === 'BYTEA')
            return 'BLOB';
        if (dialect === 'postgresql' && t === 'BLOB')
            return 'BYTEA';
        return t;
    };
    const names = new Set<string>();
    for (const n of tables) {
        if (!n.text?.trim() || names.has(n.text.toLowerCase()))
            throw new Error('SQL 表名不能为空或重复');
        names.add(n.text.toLowerCase());
    }
    const result = tables.map(table => {
        const fields = table.semantic?.fields || [];
        if (!fields.length)
            throw new Error(`表 ${table.text} 没有字段`);
        const fieldNames = new Set<string>();
        for (const f of fields) {
            if (!f.name.trim() || fieldNames.has(f.name.toLowerCase()))
                throw new Error(`表 ${table.text} 的字段名为空或重复`);
            fieldNames.add(f.name.toLowerCase());
        }
        const rows = fields.map(f => `  ${quote(f.name)} ${type(f.type)}${f.primary || !f.nullable ? ' NOT NULL' : ''}`), primary = fields.filter(f => f.primary);
        if (primary.length)
            rows.push(`  PRIMARY KEY (${primary.map(f => quote(f.name)).join(', ')})`);
        for (const n of Object.values(page.nodes)) {
            if (n.kind !== 'connector' || n.to?.nodeId !== table.id || !n.to.portId || !n.from?.portId)
                continue;
            const parent = page.nodes[n.from.nodeId] as ShapeNode | undefined, childField = fields.find(f => f.id === n.to!.portId), parentField = parent?.semantic?.fields?.find(f => f.id === n.from!.portId);
            if (parent?.kind === 'erTable' && parentField && childField?.foreign) {
                rows.push(`  FOREIGN KEY (${quote(childField.name)}) REFERENCES ${quote(parent.text || '')} (${quote(parentField.name)})`);
                if (!parentField.primary)
                    warnings.push(`${table.text}.${childField.name} 引用了非主键字段，请检查唯一性`);
            }
        }
        for (const f of fields.filter(f => f.foreign))
            if (!rows.some(r => r.startsWith('  FOREIGN KEY (' + quote(f.name) + ')')))
                warnings.push(`${table.text}.${f.name} 标为 FK 但缺少字段绑定关系`);
        return `CREATE TABLE ${quote(table.text || '')} (\n${rows.join(',\n')}\n);`;
    });
    if (!tables.length)
        throw new Error('当前页没有数据库表对象');
    return { source: `-- BoSai ${dialect} DDL 预览；未执行数据库操作\n\n${result.join('\n\n')}\n`, warnings };
}
export function importModelText(source: string, format: 'plantuml' | 'mermaid'): ModelImport {
    if (source.length > 2000000)
        throw new Error('文本过大');
    if (format === 'mermaid' && !/^\s*(?:sequenceDiagram|classDiagram|erDiagram)\b/m.test(source))
        throw new Error('当前 Mermaid 转换子集为类、ER、时序；usecase-beta 等语法尚未接入，请使用 PlantUML 用例子集');
    const warnings: string[] = [], rows = source.split(/\r?\n/).map(s => s.trim()), sequence = /sequenceDiagram/.test(source) || format === 'plantuml' && /^(?:participant|actor|boundary|control|database)\s/m.test(source) && !/\busecase\b|\([^\n]*\)\s+as\b/.test(source), classes = /classDiagram|^\s*(?:class|interface|enum)\s/m.test(source), er = /erDiagram/.test(source), p = diagramPage(sequence ? 'sequence' : classes ? 'class' : er ? 'er' : 'useCase', format + ' 文本图'), symbols = new Map<string, ShapeNode>(), messages: LineNode[] = [], containers: string[] = [], fragments: {
        node: ShapeNode;
        start: number;
        branch: number;
    }[] = [];
    const get = (alias: string, kind: ProfessionalKind = sequence ? 'sequenceParticipant' : classes ? 'umlClass' : er ? 'erTable' : 'useCase', name = alias) => {
        if (!symbols.has(alias)) {
            const count = symbols.size, n = putSymbol(p, kind, name, sequence ? 60 + count * 250 : 80 + (count % 3) * 330, sequence ? 40 : 70 + Math.floor(count / 3) * 260, {}, containers[containers.length - 1]);
            symbols.set(alias, n);
        }
        return symbols.get(alias)!;
    };
    let current: ShapeNode | undefined;
    for (let lineNo = 0; lineNo < rows.length; lineNo++) {
        const row = rows[lineNo];
        if (!row || /^(?:@startuml|@enduml|classDiagram|sequenceDiagram|erDiagram|%%|')/.test(row))
            continue;
        let m: RegExpMatchArray | null;
        if (sequence) {
            if ((m = row.match(/^(?:participant|actor|boundary|control|entity|database)\s+(.+?)(?:\s+as\s+(.+))?$/))) {
                const alias = format === 'plantuml' ? (m[2] || m[1]) : m[1], name = format === 'plantuml' ? clean(m[1]) : clean(m[2] || m[1]);
                get(clean(alias), 'sequenceParticipant', name);
                continue;
            }
            if ((m = row.match(/^(alt|opt|loop|par)\s*(.*)$/))) {
                const node = putSymbol(p, 'sequenceFragment', '', 45, 105 + messages.length * 48, { fragment: m[1] as any, condition: m[2] }, undefined);
                node.w = Math.max(520, symbols.size * 250);
                fragments.push({ node, start: messages.length, branch: 0 });
                p.order = [node.id, ...p.order.filter(id => id !== node.id)];
                continue;
            }
            if ((m = row.match(/^(?:else|and)\s*(.*)$/))) {
                const fragment = fragments[fragments.length - 1];
                if (fragment) {
                    fragment.node.semantic = { ...fragment.node.semantic, secondCondition: m[1] };
                    fragment.branch = 1;
                    fragment.node.fragmentSplit = 105 + messages.length * 48 - fragment.node.y;
                }
                else
                    warnings.push(`第 ${lineNo + 1} 行：缺少对应片段`);
                continue;
            }
            if (/^(?:end|end alt|end loop|end opt|end par)$/.test(row)) {
                const frame = fragments.pop();
                if (frame)
                    frame.node.h = Math.max(110, (messages.length - frame.start) * 48 + 30);
                continue;
            }
            if ((m = row.match(/^([\w\u0080-\uFFFF]+)\s*(-->>|->>|-->|->|--\)|-\)|--x|-x)\s*([\w\u0080-\uFFFF]+)\s*:\s*(.*)$/))) {
                const a = get(m[1]), b = get(m[3]), relation: RelationKind = m[2].includes('x') ? 'destroyMessage' : m[2].includes(')') || format === 'plantuml' && m[2] === '->>' ? 'asyncMessage' : m[2].startsWith('--') ? 'returnMessage' : 'syncMessage', fragment = fragments[fragments.length - 1];
                messages.push(putRelation(p, a, b, relation, m[4], { messageY: 125 + messages.length * 48, fragmentId: fragment?.node.id, fragmentBranch: fragment?.branch }));
                continue;
            }
            if ((m = row.match(/^(activate|deactivate)\s+(\w+)$/))) {
                if (m[1] === 'activate') {
                    const a = get(m[2]);
                    putSymbol(p, 'sequenceActivation', '', a.x + a.w / 2 - 7, 125 + Math.max(0, messages.length - 1) * 48);
                }
                else
                    warnings.push(`第 ${lineNo + 1} 行：deactivate 仅用于绘制，激活长度请在图上调整`);
                continue;
            }
        }
        else if (classes || er) {
            if (row === '}') {
                current = undefined;
                continue;
            }
            if ((m = row.match(/^class\s+(\w+)\["([^"]*)"\]$/))) {
                get(m[1], 'umlClass', m[2]);
                continue;
            }
            if ((m = row.match(/^(class|interface|enum)\s+"([^"]+)"\s+as\s+(\w+)\s*(\{)?$/))) {
                const kind: ProfessionalKind = m[1] === 'interface' ? 'umlInterface' : m[1] === 'enum' ? 'umlEnum' : 'umlClass';
                current = get(m[3], kind, m[2]);
                if (!m[4])
                    current = undefined;
                continue;
            }
            if ((m = row.match(/^(?:class|interface|enum)\s+(\w+)(?:\s+as\s+"([^"]+)")?\s*(\{)?$/))) {
                const kind: ProfessionalKind = row.startsWith('interface') ? 'umlInterface' : row.startsWith('enum') ? 'umlEnum' : 'umlClass';
                current = get(m[1], kind, m[2] || m[1]);
                if (!m[3])
                    current = undefined;
                continue;
            }
            if (er && (m = row.match(/^(\w+)\s*\{$/))) {
                current = get(m[1], 'erTable');
                current.semantic = { fields: [] };
                continue;
            }
            if (er && (m = row.match(/^(\w+)\s*(\|\||\|o|\}o|\}\|)\s*(--|\.\.)\s*(\|\||o\||o\{|\|\{)\s*(\w+)\s*:\s*(.*)$/))) {
                const left = { '||': 'one', '|o': 'zeroOne', '}o': 'zeroMany', '}|': 'many' } as const;
                const right = { '||': 'one', 'o|': 'zeroOne', 'o{': 'zeroMany', '|{': 'many' } as const;
                putRelation(p, get(m[1]), get(m[5]), 'association', m[6], { startMarker: left[m[2] as keyof typeof left], endMarker: right[m[4] as keyof typeof right], lineStyle: m[3] === '..' ? 'dashed' : 'solid' });
                continue;
            }
            if (current) {
                if ((m = row.match(/^<<(interface|enumeration)>>$/))) {
                    current.kind = m[1] === 'interface' ? 'umlInterface' : 'umlEnum';
                    current.semantic = { ...current.semantic, stereotype: m[1] };
                    continue;
                }
                if (er && (m = row.match(/^(\S+)\s+(\w+)\s*(PK|FK|UK)?\s*(.*)$/))) {
                    current.semantic!.fields!.push({ id: newId('f'), type: m[1], name: m[2], primary: m[3] === 'PK', foreign: m[3] === 'FK', nullable: false });
                    if (m[3] === 'UK' || m[4])
                        warnings.push(`第 ${lineNo + 1} 行：唯一约束 / 注释未保留`);
                    continue;
                }
                m = row.match(/^([+\-#~])?\s*([^:()]+?)(?:\(([^)]*)\))?\s*(?::\s*(.*))?$/);
                if (format === 'mermaid' && !row.includes(':')) {
                    const method = row.match(/^([+\-#~])?\s*([\w\u0080-\uFFFF]+)\(([^)]*)\)\s*(.*)$/), attribute = row.match(/^([+\-#~])?\s*(\S+)\s+([\w\u0080-\uFFFF]+)$/);
                    if (method)
                        m = [row, method[1] || '+', method[2], method[3], method[4]];
                    else if (attribute)
                        m = [row, attribute[1] || '+', attribute[3], undefined as any, attribute[2]];
                }
                if (m) {
                    const method = m[3] !== undefined, field = method ? 'operations' : 'attributes';
                    current.semantic = { ...current.semantic, [field]: [...(current.semantic?.[field] || []), { id: newId('f'), name: m[2].trim(), type: m[4] || '', visibility: m[1] || '+', ...(method ? { parameters: m[3] } : {}) }] };
                    continue;
                }
            }
            if ((m = row.match(/^(\w+)\s*(?:"([^"]*)"\s*)?(<\|--|<\|\.\.|--\|>|\.\.\|>|\*--|o--|-->?|\.\.>|\|\|--o\{|\|\|--\|\{)\s*(?:"([^"]*)"\s*)?(\w+)\s*(?::\s*(.*))?$/))) {
                const a = get(m[1]), b = get(m[5]), arrow = m[3], relation: RelationKind = arrow === '*--' ? 'composition' : arrow === 'o--' ? 'aggregation' : arrow.includes('|') && !arrow.includes('{') ? arrow.includes('.') ? 'realization' : 'generalization' : arrow.includes('{') ? 'optionalMany' : arrow.includes('.') ? 'dependency' : 'association';
                const reverse = arrow.startsWith('<|');
                putRelation(p, reverse ? b : a, reverse ? a : b, relation, m[6] || '', { startMultiplicity: reverse ? m[4] : m[2], endMultiplicity: reverse ? m[2] : m[4] });
                continue;
            }
        }
        else {
            if (row === '}') {
                containers.pop();
                continue;
            }
            if ((m = row.match(/^(?:rectangle|package)\s+"([^"]+)"(?:\s+as\s+(\w+))?\s*\{$/))) {
                const n = putSymbol(p, 'systemBoundary', m[1], 220, 40);
                n.w = 740;
                n.h = 600;
                containers.push(n.id);
                continue;
            }
            if ((m = row.match(/^actor\s+(?:"([^"]+)"|(\w+))(?:\s+as\s+(\w+))?$/))) {
                const alias = m[3] || m[2] || m[1];
                get(alias, 'actor', m[1] || m[2]);
                continue;
            }
            if ((m = row.match(/^usecase\s+(?:"([^"]+)"|\(([^)]+)\))(?:\s+as\s+(\w+))?$/))) {
                const name = m[1] || m[2];
                get(m[3] || name, 'useCase', name);
                continue;
            }
            if ((m = row.match(/^(\w+)\s*(--\|>|<\|--|\.\.>|\.>|-->|--)\s*(\w+)\s*(?::\s*(.*))?$/))) {
                const text = m[4] || '', relation: RelationKind = /include/.test(text) ? 'include' : /extend/.test(text) ? 'extend' : m[2].includes('|') ? 'generalization' : m[2].includes('.') ? 'dependency' : 'association';
                putRelation(p, get(m[2] === '<|--' ? m[3] : m[1]), get(m[2] === '<|--' ? m[1] : m[3]), relation, text);
                continue;
            }
        }
        warnings.push(`第 ${lineNo + 1} 行未转换：${row}`);
    }
    if (fragments.length)
        warnings.push('存在未闭合的时序片段');
    if (!p.order.length)
        throw new Error('没有可转换的对象；请检查受支持的语法子集');
    for (const n of Object.values(p.nodes))
        if (n.kind === 'sequenceParticipant')
            n.h = Math.max(360, 160 + messages.length * 48);
    return { pages: [p], warnings };
}
export function exportModelText(page: Page, format: 'plantuml' | 'mermaid'): {
    source: string;
    warnings: string[];
} {
    const warnings: string[] = [], nodes = Object.values(page.nodes), lines = nodes.filter(n => n.kind === 'connector') as LineNode[], aliases = new Map(nodes.map((n, i) => [n.id, 'N' + i])), name = (n: AnyNode) => ((n as ShapeNode).text || '').replace(/["\r\n]/g, ' '), a = (id?: string) => id ? aliases.get(id) : undefined;
    let rows: string[] = [];
    if (page.diagramType === 'sequence') {
        rows = [format === 'mermaid' ? 'sequenceDiagram' : '@startuml'];
        for (const n of nodes.filter(n => n.kind === 'sequenceParticipant'))
            rows.push(format === 'mermaid' ? `participant ${a(n.id)} as ${name(n)}` : `participant "${name(n)}" as ${a(n.id)}`);
        for (const n of lines.sort((x, y) => (x.messageY || x.y) - (y.messageY || y.y))) {
            if (!a(n.from?.nodeId) || !a(n.to?.nodeId)) {
                warnings.push('跳过悬空消息');
                continue;
            }
            const arrow = n.relation === 'returnMessage' ? format === 'mermaid' ? '-->>' : '-->' : n.relation === 'asyncMessage' ? format === 'mermaid' ? '-)' : '->>' : n.relation === 'destroyMessage' ? '-x' : format === 'mermaid' ? '->>' : '->';
            rows.push(`${a(n.from?.nodeId)} ${arrow} ${a(n.to?.nodeId)}: ${(n.text || '').replace(/[\r\n]/g, ' ')}`);
        }
        if (nodes.some(n => n.kind === 'sequenceFragment' || n.kind === 'sequenceActivation'))
            warnings.push('文本导出未保留组合片段、分支条件和激活长度；原生工程保留这些信息');
    }
    else if (page.diagramType === 'class' || page.diagramType === 'object') {
        rows = [format === 'mermaid' ? 'classDiagram' : '@startuml'];
        for (const n of nodes.filter(n => ['umlClass', 'umlInterface', 'umlEnum', 'umlObject'].includes(n.kind))) {
            const keyword = n.kind === 'umlInterface' ? 'interface' : n.kind === 'umlEnum' ? 'enum' : 'class';
            if (format === 'mermaid') {
                rows.push(`class ${a(n.id)}["${name(n)}"]`);
                rows.push(`class ${a(n.id)} {`);
                if (keyword !== 'class')
                    rows.push(`  <<${keyword === 'enum' ? 'enumeration' : 'interface'}>>`);
            }
            else
                rows.push(`${keyword} "${name(n)}" as ${a(n.id)} {`);
            for (const f of n.semantic?.attributes || [])
                rows.push(format === 'mermaid' ? `  ${f.visibility || '+'}${f.type} ${f.name}` : `  ${f.visibility || '+'}${f.name}: ${f.type}`);
            for (const f of n.semantic?.operations || [])
                rows.push(format === 'mermaid' ? `  ${f.visibility || '+'}${f.name}(${f.parameters || ''}) ${f.type}` : `  ${f.visibility || '+'}${f.name}(${f.parameters || ''}): ${f.type}`);
            rows.push('}');
        }
        const arrow: Record<string, string> = { generalization: '--|>', realization: '..|>', composition: '*--', aggregation: 'o--', dependency: '..>', association: '--' };
        for (const n of lines)
            if (a(n.from?.nodeId) && a(n.to?.nodeId))
                rows.push(`${a(n.from?.nodeId)} ${n.startMultiplicity ? `"${n.startMultiplicity}" ` : ''}${arrow[n.relation || ''] || '--'} ${n.endMultiplicity ? `"${n.endMultiplicity}" ` : ''}${a(n.to?.nodeId)}${n.text ? ' : ' + n.text : ''}`);
    }
    else if (page.diagramType === 'useCase' && format === 'plantuml') {
        rows = ['@startuml'];
        const emit = (n: AnyNode) => `  ${n.kind === 'actor' ? 'actor' : 'usecase'} "${name(n)}" as ${a(n.id)}`;
        for (const n of nodes.filter(n => ['actor', 'useCase'].includes(n.kind) && !n.parent))
            rows.push(emit(n));
        for (const container of nodes.filter(n => n.kind === 'systemBoundary')) {
            rows.push(`rectangle "${name(container)}" {`);
            for (const n of nodes.filter(n => n.parent === container.id && ['actor', 'useCase'].includes(n.kind)))
                rows.push(emit(n));
            rows.push('}');
        }
        for (const n of lines)
            if (a(n.from?.nodeId) && a(n.to?.nodeId)) {
                const arrow = n.relation === 'generalization' ? '--|>' : ['include', 'extend', 'dependency'].includes(n.relation || '') ? '..>' : '--';
                rows.push(`${a(n.from?.nodeId)} ${arrow} ${a(n.to?.nodeId)}${n.text ? ' : ' + n.text : ''}`);
            }
    }
    else if (page.diagramType === 'er' && format === 'mermaid') {
        rows = ['erDiagram'];
        for (const n of nodes.filter(n => n.kind === 'erTable')) {
            rows.push(`${a(n.id)} {`);
            for (const f of n.semantic?.fields || [])
                rows.push(`  ${f.type.replace(/[\s,]/g, '_')} ${f.name} ${f.primary ? 'PK' : f.foreign ? 'FK' : ''}`);
            rows.push('}');
            warnings.push(`${name(n)}：实体名使用别名 ${a(n.id)}，可空性和方言类型未完整保留`);
        }
        const left = { one: '||', zeroOne: '|o', zeroMany: '}o', many: '}|' } as const;
        const right = { one: '||', zeroOne: 'o|', zeroMany: 'o{', many: '|{' } as const;
        for (const n of lines) {
            const start = left[n.startMarker as keyof typeof left], end = right[n.endMarker as keyof typeof right];
            if (!start || !end) {
                warnings.push('跳过无法转换为 Mermaid ER 基数的关系；原生工程保留该关系');
                continue;
            }
            if (a(n.from?.nodeId) && a(n.to?.nodeId))
                rows.push(`${a(n.from?.nodeId)} ${start}${n.lineStyle === 'dashed' ? '..' : '--'}${end} ${a(n.to?.nodeId)} : ${n.text || 'references'}`);
        }
    }
    else
        throw new Error('当前子集支持：PlantUML 用例 / 类 / 时序，Mermaid 类 / ER / 时序。其他图请使用原生工程或 SVG。');
    if (format === 'plantuml')
        rows.push('@enduml');
    warnings.push('文本子集不保留画布坐标、样式、模型规约、命名端口和手工折点');
    if (nodes.some(n => /"|\r|\n/.test((n as ShapeNode).text || '')))
        warnings.push('名称与单行标签中的引号、换行转换为空格');
    return { source: rows.join('\n') + '\n', warnings: [...new Set(warnings)] };
}
export async function importDrawio(source: string): Promise<ModelImport> {
    if (source.length > 10000000)
        throw new Error('drawio 文件过大');
    const xml = parseXml(source), pages: Page[] = [], warnings: string[] = [];
    const diagrams = [...xml.querySelectorAll('diagram')];
    if (!diagrams.length && xml.documentElement.tagName === 'mxGraphModel')
        diagrams.push(xml.documentElement);
    for (const diagram of diagrams) {
        let graph = diagram.querySelector('mxGraphModel') || (diagram.tagName === 'mxGraphModel' ? diagram : null);
        if (!graph) {
            try {
                const encoded = atob(diagram.textContent?.trim() || ''), bytes = Uint8Array.from(encoded, c => c.charCodeAt(0)), reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), decoder = new TextDecoder();
                let decoded = '', total = 0;
                try {
                    while (true) {
                        const chunk = await reader.read();
                        if (chunk.done)
                            break;
                        total += chunk.value.byteLength;
                        if (total > 10000000)
                            throw new Error('解压结果超过 10 MB');
                        decoded += decoder.decode(chunk.value, { stream: true });
                    }
                    decoded += decoder.decode();
                }
                finally {
                    await reader.cancel();
                }
                graph = parseXml(decodeURIComponent(decoded)).documentElement;
            }
            catch (error) {
                throw new Error('无法读取此压缩 drawio 页面：' + (error as Error).message + '；可在 diagrams.net 导出未压缩 XML 后导入');
            }
        }
        const p = diagramPage('free', diagram.getAttribute('name') || 'drawio 页面'), cells = [...graph.querySelectorAll('mxCell')], map = new Map<string, AnyNode>();
        for (const cell of cells.filter(c => c.getAttribute('vertex') === '1')) {
            const geo = cell.querySelector('mxGeometry'), style = cell.getAttribute('style') || '', text = cell.getAttribute('value') || '', safeText = new DOMParser().parseFromString(text, 'text/html').body.textContent || '', kind: ProfessionalKind | undefined = style.includes('shape=umlActor') ? 'actor' : style.includes('shape=umlClass') ? 'umlClass' : style.includes('ellipse') ? 'useCase' : style.includes('swimlane') ? 'swimlane' : undefined;
            const n = kind ? putSymbol(p, kind, safeText, Number(geo?.getAttribute('x') || 0), Number(geo?.getAttribute('y') || 0)) : { id: newId('n'), kind: 'rect', x: Number(geo?.getAttribute('x') || 0), y: Number(geo?.getAttribute('y') || 0), w: 160, h: 100, rot: 0, z: p.order.length + 1, text: safeText, fill: '#fff', stroke: '#334155', strokeWidth: 2 } as ShapeNode;
            n.w = Number(geo?.getAttribute('width') || n.w);
            n.h = Number(geo?.getAttribute('height') || n.h);
            if (!kind) {
                p.nodes[n.id] = n;
                p.order.push(n.id);
            }
            map.set(cell.id, n);
            for (const [key, prop] of [['fillColor', 'fill'], ['strokeColor', 'stroke']] as const) {
                const match = style.match(new RegExp(`(?:^|;)${key}=([^;]+)`));
                if (match && /^#[\da-f]{3,8}$/i.test(match[1]))
                    n[prop] = match[1];
            }
            if (style.includes('image='))
                warnings.push(`图片资源未转换：${safeText}`);
        }
        for (const cell of cells.filter(c => c.getAttribute('vertex') === '1')) {
            const n = map.get(cell.id), parent = map.get(cell.getAttribute('parent') || '');
            if (n && parent) {
                parent.container = true;
                n.parent = parent.id;
                n.x += parent.x;
                n.y += parent.y;
            }
        }
        for (const cell of cells.filter(c => c.getAttribute('edge') === '1')) {
            const from = map.get(cell.getAttribute('source') || ''), to = map.get(cell.getAttribute('target') || '');
            if (!from || !to) {
                warnings.push('跳过未绑定端点的 drawio 连线');
                continue;
            }
            const style = cell.getAttribute('style') || '', text = new DOMParser().parseFromString(cell.getAttribute('value') || '', 'text/html').body.textContent || '', r = style.includes('endArrow=block') && style.includes('endFill=0') ? 'generalization' : style.includes('startArrow=diamond') ? style.includes('startFill=0') ? 'aggregation' : 'composition' : 'association', line = putRelation(p, from, to, r, text);
            if (style.includes('dashed=1'))
                line.lineStyle = 'dashed';
            if (style.includes('orthogonal'))
                line.route = 'orthogonal';
        }
        if (p.order.length)
            pages.push(p);
    }
    if (!pages.length)
        throw new Error('drawio 中没有可转换的图形');
    warnings.push('drawio 子集：矩形、参与者、椭圆用例、类、泳道、父子归属和绑定连线。自定义 stencil、HTML 富文本、页面属性、手工路由和复杂关系标记未完整保留。');
    return { pages, warnings };
}
export function exportSymbolPackage(doc: Doc, pageId: string, ids: string[]): string {
    const page = doc.pages.find(p => p.id === pageId)!, set = new Set(ids), nodes = ids.map(id => structuredClone(page.nodes[id])).filter(Boolean);
    for (const n of nodes) {
        if (n.parent && !set.has(n.parent))
            n.parent = null;
        delete n.childPageId;
        if (n.kind === 'connector') {
            if (n.from && !set.has(n.from.nodeId))
                delete n.from;
            if (n.to && !set.has(n.to.nodeId))
                delete n.to;
        }
    }
    const symbols: Page = { ...page, id: newId('symbol'), parentPageId: undefined, parentProcessId: undefined, nodes: Object.fromEntries(nodes.map(n => [n.id, n])), order: nodes.map(n => n.id) };
    const models = Object.fromEntries(Object.entries(doc.models || {}).filter(([id]) => nodes.some(n => n.modelId === id)));
    return JSON.stringify({ format: 'bosai-symbols', version: 1, name: doc.title, doc: { ...doc, pages: [symbols], activePageId: symbols.id, models, dictionary: [] } }, null, 2);
}
export function importSymbolPackage(source: string): ModelImport {
    const data = JSON.parse(source);
    if (data.format !== 'bosai-symbols' || data.version !== 1)
        throw new Error('不支持的符号包版本');
    const doc = validateDocument(data.doc);
    return { pages: structuredClone(doc.pages), warnings: ['符号包按原生对象插入为新页，可选中后复制到其他图。图形字段和端口继续可编辑。'] };
}
export function importPreviewDocument(result: ModelImport): Doc { return reconcileEngineering({ version: 2, title: '转换预览', documentId: newId('doc'), pages: result.pages, activePageId: result.pages[0].id, createdAt: Date.now(), updatedAt: Date.now(), models: {}, dictionary: [] }); }
