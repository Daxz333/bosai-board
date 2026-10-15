const { spawnSync } = require('node:child_process')
const path = require('node:path')

const electron = path.join(__dirname, '../node_modules/electron/cli.js')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

for (const test of ['data-protection-test.js', 'close-lifecycle-test.js', 'professional-test.js', 'compatibility-test.js', 'export-test.js', 'engineering-test.js', 'canvas-workflow-test.js']) {
  console.log(`\n=== ${test} ===`)
  const result = spawnSync(process.execPath, [electron, path.join(__dirname, test)], { env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
