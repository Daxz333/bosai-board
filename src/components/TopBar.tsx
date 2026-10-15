import { useState } from 'react'
import { useStore } from '../store/board'
import { doSave } from './Canvas'

export default function TopBar({ onNew, onOpen, onExport, onImport }: { onNew: () => void; onOpen: () => void; onExport: () => void; onImport: () => void }) {
  const s = useStore()
  const [menu, setMenu] = useState<string | null>(null)

  const doNew = () => onNew()
  const doExportJson = async () => {
    const api = (window as any).boardAPI
    const content = JSON.stringify(s.doc, null, 2)
    if (api) await api.exportText({ defaultName: `${s.doc.title}.bosai`, content, ext: 'bosai', name: '白板文件' })
    else {
      const b = new Blob([content], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${s.doc.title}.bosai`; a.click()
    }
  }
  const doPrint = () => window.print()

  const items: Record<string, { label: string; fn: () => void; sep?: boolean; hint?: string }[]> = {
    文件: [
      { label: '新建白板', fn: doNew, hint: 'Ctrl+N' },
      { label: '打开…', fn: onOpen, hint: 'Ctrl+O' },
      { label: '导入可编辑 SVG / VSDX…', fn: onImport },
      { label: '保存', fn: doSave, hint: 'Ctrl+S' },
      { label: '', fn: () => { }, sep: true },
      { label: '导出图片…', fn: () => onExport(), hint: 'Ctrl+Shift+E' },
      { label: '导出工程文件', fn: doExportJson },
      { label: '打印 / 另存 PDF', fn: doPrint }
    ],
    编辑: [
      { label: '撤销', fn: () => s.undo(), hint: 'Ctrl+Z' },
      { label: '重做', fn: () => s.redo(), hint: 'Ctrl+Y' },
      { label: '', fn: () => { }, sep: true },
      { label: '复制', fn: () => s.copy(s.selection), hint: 'Ctrl+C' },
      { label: '粘贴', fn: () => s.paste(), hint: 'Ctrl+V' },
      { label: '复制副本', fn: () => s.duplicate(s.selection), hint: 'Ctrl+D' },
      { label: '', fn: () => { }, sep: true },
      { label: '全选', fn: () => s.selectAll(), hint: 'Ctrl+A' },
      { label: '删除', fn: () => s.removeNodes(s.selection), hint: 'Del' },
      { label: '组合', fn: () => s.group(s.selection), hint: 'Ctrl+G' },
      { label: '取消组合', fn: () => s.ungroup(), hint: 'Ctrl+Shift+G' }
    ],
    视图: [
      { label: s.gridVisible ? '隐藏网格' : '显示网格', fn: () => s.toggleGrid() },
      { label: s.snapEnabled ? '关闭吸附' : '开启吸附', fn: () => s.toggleSnap() },
      { label: '', fn: () => { }, sep: true },
      { label: '适应画布', fn: () => s.fitView(), hint: 'Ctrl+1' },
      { label: '缩放到选中', fn: () => s.zoomToSelection(), hint: 'Ctrl+2' },
      { label: '实际大小 100%', fn: () => s.zoomTo(1), hint: 'Ctrl+0' },
      { label: '', fn: () => { }, sep: true },
      { label: s.presentation ? '退出演示' : '演示模式', fn: () => s.setPresentation(!s.presentation), hint: 'F5' }
    ]
  }

  return (
    <div className="topbar">
      <div className="brand">
        <img className="brand-mark" src="./icon.svg" alt="" />
        <span className="logo">BoSai</span>
        <span className="brand-sub">Board</span>
      </div>
      <div className="menus">
        {Object.entries(items).map(([name, list]) => (
          <div key={name} className="menu-wrap">
            <button className={`menu-btn ${menu === name ? 'active' : ''}`} onClick={() => setMenu(menu === name ? null : name)}>
              {name}
            </button>
            {menu === name && (
              <>
                <div className="menu-mask" onClick={() => setMenu(null)} />
                <div className="menu-pop">
                  {list.map((it, i) => it.sep ? <div key={i} className="menu-sep" /> : (
                    <button key={i} className="menu-item" onClick={() => { it.fn(); setMenu(null) }}>
                      <span>{it.label}</span>
                      {it.hint && <kbd>{it.hint}</kbd>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="history-actions" aria-label="历史操作">
        <button
          onClick={() => s.undo()}
          disabled={!s.past.length}
          title={s.past.length ? `撤销：${s.past[s.past.length - 1].label} (Ctrl+Z)` : '没有可撤销的操作'}
        >↶</button>
        <button
          onClick={() => s.redo()}
          disabled={!s.future.length}
          title={s.future.length ? `重做：${s.future[0].label} (Ctrl+Y)` : '没有可重做的操作'}
        >↷</button>
      </div>
      <input
        className="title-input"
        aria-label="白板名称"
        value={s.doc.title}
        onChange={(e) => s.setTitle(e.target.value)}
        spellCheck={false}
      />
      <div className="top-right">
        <button className="btn-outline" onClick={() => onExport()} title="导出图片 (Ctrl+Shift+E)">
          导出
        </button>
        {s.dirty && <span className="dirty-dot" title="有未保存改动" />}
        {s.recoveryError && <span className="hint-text" title={s.recoveryError} role="alert">恢复快照失败</span>}
        <span className="hint-text">{s.filePath ? s.filePath.split(/[\\/]/).pop() : '未保存'}</span>
        <button className="btn-primary" onClick={() => doSave()}>保存</button>
      </div>
      
    </div>
  )
}
