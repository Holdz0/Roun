import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, extname, sep } from 'node:path'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'out', 'renderer')
let state = {}
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname
    if (pathname === '/test-state') {
      if (req.method === 'POST') { let raw = ''; for await (const chunk of req) raw += chunk; state = JSON.parse(raw) }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(state)); return
    }
    if (pathname === '/ui-fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(join(root, 'tests', 'ui-fixture.js'))); return }
    const target = resolve(output, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!target.startsWith(output + sep)) { res.writeHead(403); res.end(); return }
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }
    res.setHeader('Content-Type', mime[extname(target)] || 'application/octet-stream')
    let data = await readFile(target)
    if (extname(target) === '.html') data = Buffer.from(data.toString().replace('<head>', '<head><script src="/ui-fixture.js"></script>'))
    res.end(data)
  } catch { res.writeHead(404); res.end('Not found') }
})
server.listen(4318, '127.0.0.1', () => console.log('Roun UI fixture: http://127.0.0.1:4318'))
