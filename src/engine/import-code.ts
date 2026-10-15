import type { ModelImport } from './model-interop';
import type { ShapeNode } from '../types';
import { newId } from '../types';
import { diagramPage, putRelation, putSymbol } from './engineering-commands';
/** Parse declarations with the bundled compiler. Imported source is never executed. */
export async function importTypeScript(source: string): Promise<ModelImport> {
    if (source.length > 2000000)
        throw new Error('源码超过 2 MB');
    const ts = await import('typescript'), file = ts.createSourceFile('model.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), diagnostics = (file as unknown as {
        parseDiagnostics: import('typescript').Diagnostic[];
    }).parseDiagnostics;
    if (diagnostics.length)
        throw new Error('源码语法错误：' + ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' '));
    const page = diagramPage('class', 'TypeScript / JavaScript 类结构'), symbols = new Map<string, ShapeNode>(), warnings: string[] = [], pending: {
        from: ShapeNode;
        name: string;
        implements: boolean;
    }[] = [];
    const visit = (node: import('typescript').Node): void => {
        if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
            if (!node.name) {
                warnings.push('匿名类未转换');
                return;
            }
            const name = node.name.text;
            if (symbols.has(name)) {
                warnings.push('同名声明未合并：' + name);
                return;
            }
            const n = putSymbol(page, ts.isInterfaceDeclaration(node) ? 'umlInterface' : ts.isEnumDeclaration(node) ? 'umlEnum' : 'umlClass', name, 70 + (symbols.size % 3) * 370, 70 + Math.floor(symbols.size / 3) * 370, { attributes: [], operations: [] });
            symbols.set(name, n);
            for (const member of node.members) {
                const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) || [] : [], visibility = modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) ? '-' : modifiers.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword) ? '#' : '+';
                if (modifiers.some(m => m.kind === ts.SyntaxKind.StaticKeyword || m.kind === ts.SyntaxKind.AbstractKeyword))
                    warnings.push(`${name}：静态 / 抽象修饰符未转换为 UML 显示属性`);
                if (ts.isEnumMember(member)) {
                    n.semantic!.attributes!.push({ id: newId('f'), name: member.name.getText(file), type: member.initializer?.getText(file) || '', visibility: '+' });
                    continue;
                }
                if (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) {
                    n.semantic!.attributes!.push({ id: newId('f'), name: member.name.getText(file) + (member.questionToken ? '?' : ''), type: member.type?.getText(file) || 'any', visibility });
                    if (!member.type)
                        warnings.push(`${name}.${member.name.getText(file)}：缺少显式类型，使用 any`);
                    continue;
                }
                if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member) || ts.isConstructorDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
                    const constructor = ts.isConstructorDeclaration(member), nameText = constructor ? 'constructor' : member.name.getText(file), type = constructor ? '' : member.type?.getText(file) || 'any';
                    n.semantic!.operations!.push({ id: newId('f'), name: nameText, type, visibility, parameters: member.parameters.map(p => `${p.dotDotDotToken ? '...' : ''}${p.name.getText(file)}${p.questionToken ? '?' : ''}: ${p.type?.getText(file) || 'any'}`).join(', ') });
                    if (constructor)
                        for (const parameter of member.parameters) {
                            const modifiers = ts.canHaveModifiers(parameter) ? ts.getModifiers(parameter) || [] : [];
                            if (modifiers.some(m => [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.PublicKeyword, ts.SyntaxKind.ProtectedKeyword, ts.SyntaxKind.ReadonlyKeyword].includes(m.kind)))
                                n.semantic!.attributes!.push({ id: newId('f'), name: parameter.name.getText(file), type: parameter.type?.getText(file) || 'any', visibility: modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) ? '-' : '+' });
                        }
                    continue;
                }
                warnings.push(`${name}：成员未转换：${member.getText(file).slice(0, 80)}`);
            }
            if (!ts.isEnumDeclaration(node)) {
                for (const clause of node.heritageClauses || [])
                    for (const type of clause.types)
                        pending.push({ from: n, name: type.expression.getText(file), implements: clause.token === ts.SyntaxKind.ImplementsKeyword });
                if (node.typeParameters?.length)
                    warnings.push(`${name}：泛型约束未建模，成员类型文本保持原样`);
            }
            return;
        }
        if (ts.isModuleDeclaration(node) || ts.isModuleBlock(node) || ts.isSourceFile(node)) {
            ts.forEachChild(node, visit);
            return;
        }
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
            warnings.push('顶层语句未转换：' + node.getText(file).slice(0, 60));
    };
    visit(file);
    for (const relation of pending) {
        let target = symbols.get(relation.name);
        if (!target) {
            target = putSymbol(page, relation.implements ? 'umlInterface' : 'umlClass', relation.name, 70 + (symbols.size % 3) * 370, 70 + Math.floor(symbols.size / 3) * 370, { description: '外部声明占位' });
            symbols.set(relation.name, target);
            warnings.push('外部基类 / 接口仅作为占位：' + relation.name);
        }
        putRelation(page, relation.from, target, relation.implements ? 'realization' : 'generalization');
    }
    if (!symbols.size)
        throw new Error('未发现具名 class / interface / enum 声明');
    warnings.push('当前仅解析单个文件的类、接口、枚举、显式成员类型及 extends / implements；不解析依赖工程，不执行源码，不推断方法体或运行时类型。');
    return { pages: [page], warnings: [...new Set(warnings)] };
}
