import type { Doc } from '../types';
import { newId } from '../types';
import { importSymbolPackage } from './model-interop';
export interface LocalSymbol {
    id: string;
    name: string;
    source: string;
}
const KEY = 'bosai:local-symbols:v1';
export function localSymbols(): LocalSymbol[] {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) || '[]');
        if (!Array.isArray(value))
            return [];
        return value.filter((s: LocalSymbol) => {
            try {
                return typeof s.id === 'string' && typeof s.name === 'string' && typeof s.source === 'string' && s.source.length < 2000000 && importSymbolPackage(s.source).pages.length === 1;
            }
            catch {
                return false;
            }
        }).slice(0, 50);
    }
    catch {
        return [];
    }
}
export function saveLocalSymbol(name: string, source: string): LocalSymbol[] {
    if (!name.trim())
        throw new Error('请填写符号名称');
    if (source.length > 2000000)
        throw new Error('单个本地符号包超过 2 MB，请减少图片或节点数量');
    const result = importSymbolPackage(source);
    if (result.pages.length !== 1 || !result.pages[0].order.length)
        throw new Error('符号包必须包含一个非空页面');
    const list = localSymbols(), existing = list.find(s => s.name === name.trim()), symbol = { id: existing?.id || newId('symbol'), name: name.trim(), source }, next = existing ? list.map(s => s.id === existing.id ? symbol : s) : [...list, symbol];
    if (next.length > 50 || JSON.stringify(next).length > 4000000)
        throw new Error('本地符号库容量已满；可导出符号包备份后移除旧符号');
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('bosai:symbol-library'));
    return next;
}
export function removeLocalSymbol(id: string): void { localStorage.setItem(KEY, JSON.stringify(localSymbols().filter(s => s.id !== id))); window.dispatchEvent(new Event('bosai:symbol-library')); }
export function symbolDocument(symbol: LocalSymbol): Doc { return JSON.parse(symbol.source).doc as Doc; }
