import { openSync, readSync, closeSync, fstatSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Dosyanın son `bytes` kadarını satırlara bölerek (sondan başa) döndürür. */
export function tailLines(file: string, bytes = 512 * 1024): string[] {
  const fd = openSync(file, 'r')
  try {
    const size = fstatSync(fd).size
    const start = Math.max(0, size - bytes)
    const buf = Buffer.alloc(size - start)
    readSync(fd, buf, 0, buf.length, start)
    const lines = buf.toString('utf8').split('\n')
    if (start > 0) lines.shift() // yarım ilk satır
    return lines.filter((l) => l.trim()).reverse()
  } finally {
    closeSync(fd)
  }
}

export function headLines(file: string, bytes = 64 * 1024): string[] {
  const fd = openSync(file, 'r')
  try {
    const size = fstatSync(fd).size
    const buf = Buffer.alloc(Math.min(size, bytes))
    readSync(fd, buf, 0, buf.length, 0)
    const lines = buf.toString('utf8').split('\n')
    if (size > bytes) lines.pop()
    return lines
  } finally { closeSync(fd) }
}

interface NewestOpts {
  acceptFile?: (file: string) => boolean
  recursive?: boolean
  since?: number
  /** Yalnızca bu zamandan sonra oluşturulmuş dosyalar */
  createdSince?: number
  prefix?: string
}

/** Klasördeki (isteğe bağlı alt klasörler dahil) en yeni .jsonl dosyası. */
export function newestJsonl(dir: string, opts: NewestOpts = {}): { file: string; mtime: number } | null {
  let best: { file: string; mtime: number } | null = null
  const walk = (d: string, depth: number): void => {
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        if (opts.recursive && depth < 4) walk(p, depth + 1)
      } else if (e.name.endsWith('.jsonl') && (!opts.prefix || e.name.startsWith(opts.prefix))) {
        try {
          const st = statSync(p)
          const m = st.mtimeMs
          if (opts.acceptFile && !opts.acceptFile(p)) continue
          if (opts.createdSince !== undefined && st.birthtimeMs < opts.createdSince) continue
          if ((opts.since === undefined || m >= opts.since) && (!best || m > best.mtime)) best = { file: p, mtime: m }
        } catch {
          /* yok say */
        }
      }
    }
  }
  walk(dir, 0)
  return best
}
