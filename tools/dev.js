const { spawn } = require('node:child_process')
const electron = require('electron')
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, BOSAI_DEV: '1' } })
child.on('exit', code => process.exit(code || 0))
