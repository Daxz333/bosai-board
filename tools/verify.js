/** 验证打包后的正式 exe 能正常启动并渲染 */
const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 60000)

// 校验资源是否被正确打进 asar
const base = path.join(__dirname, '..', 'dist-app')
const asar = path.join(base, 'win-unpacked', 'resources', 'app.asar')
console.log('app.asar 存在:', fs.existsSync(asar), fs.existsSync(asar) ? (fs.statSync(asar).size / 1024).toFixed(0) + ' KB' : '')

const res = path.join(base, 'win-unpacked', 'resources')
console.log('resources 内容:', fs.readdirSync(res).join(', '))

// 启动打包后的 exe
const exe = path.join(base, 'win-unpacked', 'BoSai Board.exe')
const child = spawn(exe, [], { detached: true, stdio: 'ignore' })
child.unref()

setTimeout(() => {
  let alive = true
  try { process.kill(child.pid, 0) } catch (e) { alive = false }
  console.log('打包后 exe 启动:', alive ? '成功（进程存活 pid=' + child.pid + '）' : '失败（进程已退出）')
  if (alive) { try { process.kill(child.pid) } catch (e) {} }
  app.quit()
  process.exit(alive ? 0 : 1)
}, 9000)
