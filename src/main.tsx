import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { useStore } from './store/board'
import * as exportMod from './engine/export'
import { importSvg, parseSvgPath } from './engine/import-svg'
import { importVsdx } from './engine/import-vsdx'
import * as engineering from './engine/engineering'
import * as engineeringCommands from './engine/engineering-commands'
import * as modelInterop from './engine/model-interop'
import * as validation from './engine/document-validation'
import * as engineeringVisual from './engine/engineering-visual'
import * as engineeringLayout from './engine/engineering-layout'
import * as codeImport from './engine/import-code'
import * as localSymbolLibrary from './engine/symbol-library'
import * as aiDraft from './engine/ai-draft'
import * as traceability from './engine/traceability'

// 开发期错误与状态收集：便于 tools/ 下的脚本验证渲染层
;(window as any).__ERRS__ = []
;(window as any).__store = useStore
;(window as any).__exportMod = exportMod
;(window as any).__importMod = { importSvg, importVsdx, parseSvgPath }
;(window as any).__engineeringMod = {...engineering,...engineeringCommands,...modelInterop,...validation,...engineeringVisual,...engineeringLayout,...codeImport,...localSymbolLibrary,...aiDraft,...traceability}
window.addEventListener('error', (e) => {
  ;(window as any).__ERRS__.push(String(e.message))
})
window.addEventListener('unhandledrejection', (e) => {
  ;(window as any).__ERRS__.push('unhandled: ' + String((e as PromiseRejectionEvent).reason))
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
