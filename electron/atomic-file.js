const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

/** Write beside the target, flush, then replace. On failure the old file is left intact. */
function writeAtomic(target, content, ops = fs) {
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`)
  let fd
  try {
    fd = ops.openSync(temp, 'wx', 0o600)
    ops.writeFileSync(fd, content, 'utf8')
    ops.fsyncSync(fd)
    ops.closeSync(fd)
    fd = undefined
    ops.renameSync(temp, target)
  } catch (error) {
    if (fd !== undefined) try { ops.closeSync(fd) } catch {}
    try { ops.unlinkSync(temp) } catch {}
    throw error
  }
}

module.exports = { writeAtomic }
