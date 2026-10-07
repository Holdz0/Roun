// build/icon.png üretir (256x256): koyu yuvarlak kare üzerinde turuncu ">_" işareti.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const S = 256
const px = Buffer.alloc(S * S * 4)

function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

function roundRectDist(x, y, r) {
  const cx = Math.max(Math.abs(x - S / 2) - (S / 2 - r), 0)
  const cy = Math.max(Math.abs(y - S / 2) - (S / 2 - r), 0)
  return Math.hypot(cx, cy) - r
}

const segs = [
  [70, 80, 128, 128],
  [128, 128, 70, 176],
  [140, 180, 194, 180]
]

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    const bg = Math.max(0, Math.min(1, 0.5 - roundRectDist(x + 0.5, y + 0.5, 56)))
    const g = y / S
    let r = 24 + 10 * g, gg = 24 + 8 * g, b = 30 + 14 * g
    const d = Math.min(...segs.map((s) => segDist(x + 0.5, y + 0.5, ...s)))
    const fg = Math.max(0, Math.min(1, 14 - d + 0.5))
    r = r * (1 - fg) + 232 * fg
    gg = gg * (1 - fg) + 128 * fg
    b = b * (1 - fg) + 84 * fg
    px[i] = r; px[i + 1] = gg; px[i + 2] = b; px[i + 3] = Math.round(bg * 255)
  }
}

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const raw = Buffer.alloc(S * (S * 4 + 1))
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])
fs.writeFileSync(path.join(__dirname, 'icon.png'), png)
console.log('build/icon.png yazıldı')
