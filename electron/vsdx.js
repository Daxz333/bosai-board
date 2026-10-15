// Read OPC ZIP parts in memory: no extraction, no filesystem paths from archive entries.
const { inflateRawSync } = require('node:zlib')
const MAX_FILE = 32 * 1024 * 1024
const MAX_EXPANDED = 128 * 1024 * 1024
function readVsdx(buffer) {
  if (buffer.length > MAX_FILE) throw new Error('VSDX 最大支持 32 MB')
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break }
  }
  if (end < 0) throw new Error('不是有效的 ZIP/VSDX 文件')
  const count = buffer.readUInt16LE(end + 10), size = buffer.readUInt32LE(end + 12), start = buffer.readUInt32LE(end + 16)
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || count === 65535 || start + size > end || count > 10000) throw new Error('不支持分卷或 ZIP64 格式')
  const parts = Object.create(null)
  let pos = start, expanded = 0
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || buffer.readUInt32LE(pos) !== 0x02014b50) throw new Error('ZIP 目录损坏')
    const flags = buffer.readUInt16LE(pos + 8), method = buffer.readUInt16LE(pos + 10)
    const compressed = buffer.readUInt32LE(pos + 20), original = buffer.readUInt32LE(pos + 24)
    const nameLength = buffer.readUInt16LE(pos + 28), extraLength = buffer.readUInt16LE(pos + 30), commentLength = buffer.readUInt16LE(pos + 32)
    const offset = buffer.readUInt32LE(pos + 42)
    if (pos + 46 + nameLength + extraLength + commentLength > end) throw new Error('ZIP 文件名损坏')
    const name = buffer.subarray(pos + 46, pos + 46 + nameLength).toString('utf8')
    pos += 46 + nameLength + extraLength + commentLength
    expanded += original
    if (expanded > MAX_EXPANDED || original > 16 * 1024 * 1024) throw new Error('VSDX 解压内容超出安全限制')
    if (flags & 1) throw new Error('不支持加密的 VSDX')
    if (name.includes('..') || name.startsWith('/') || name.includes('\\') || Object.hasOwn(parts, name)) throw new Error('VSDX 包含不安全或重复的部件名')
    if (!/\.(xml|rels)$/i.test(name)) continue
    if (offset + 30 > start || buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error('ZIP 部件头损坏')
    const dataStart = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28)
    if (dataStart + compressed > start) throw new Error('ZIP 部件数据越界')
    const data = buffer.subarray(dataStart, dataStart + compressed)
    const decoded = method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: Math.max(1, original) }) : null
    if (!decoded || decoded.length !== original) throw new Error('VSDX 使用了不支持的压缩方式或部件损坏')
    if (crc32(decoded) !== buffer.readUInt32LE(pos - (46 + nameLength + extraLength + commentLength) + 16)) throw new Error('VSDX 部件校验失败')
    parts[name] = decoded.toString('utf8')
  }
  if (!parts['visio/pages/pages.xml']) throw new Error('缺少 Visio 页面部件，不是支持的 VSDX')
  return parts
}
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
module.exports = { readVsdx, crc32 }
