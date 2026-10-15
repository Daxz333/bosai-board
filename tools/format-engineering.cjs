const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const files = [
  'engine/engineering.ts', 'engine/engineering-visual.ts', 'engine/engineering-commands.ts',
  'engine/engineering-layout.ts', 'engine/model-interop.ts', 'engine/symbol-library.ts',
  'engine/import-code.ts', 'engine/ai-draft.ts', 'engine/traceability.ts', 'engine/document-validation.ts',
  'components/EngineeringProperties.tsx', 'components/EngineeringWorkspace.tsx',
  'components/EngineeringEditors.tsx', 'components/TextModelDialog.tsx',
  'components/AiDraftDialog.tsx', 'components/LocalSymbolLibrary.tsx', 'components/TracePanel.tsx',
  'components/PrintAtlas.tsx'
]
for (const relative of files) {
  const target = path.join(__dirname, '..', 'src', relative)
  const file = ts.createSourceFile(relative, fs.readFileSync(target, 'utf8'), ts.ScriptTarget.Latest, true, relative.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  if (file.parseDiagnostics.length) throw new Error('Cannot format invalid source: ' + relative)
  const formatted = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false }).printFile(file)
  fs.writeFileSync(target, formatted, 'utf8')
}
console.log('Formatted', files.length, 'engineering source files')
