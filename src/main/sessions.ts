import { readdir, stat, open, readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { AgentTool, SessionEntry, SessionDetail } from '../shared/features'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
interface Metadata { title?: string; pinned?: boolean; tool?: AgentTool; cwd?: string }
interface Indexed { entry: SessionEntry; file: string }
export async function readSessionParts(file: string, tailBytes = 128 * 1024): Promise<{ lines: string[]; truncated: boolean }> {
  const handle = await open(file, 'r')
  try {
    const { size } = await handle.stat()
    const headSize = Math.min(size, 64 * 1024)
    const head = Buffer.alloc(headSize)
    await handle.read(head, 0, headSize, 0)
    if (size <= headSize) return { lines: head.toString('utf8').split('\n'), truncated: false }
    const start = Math.max(headSize, size - tailBytes)
    const tail = Buffer.alloc(size - start)
    await handle.read(tail, 0, tail.length, start)
    const first = head.toString('utf8').split('\n')
    const last = tail.toString('utf8').split('\n')
    first.pop(); last.shift()
    return { lines: [...first, ...last], truncated: true }
  } finally { await handle.close() }
}
const textOf = (content: unknown): string => typeof content === 'string' ? content : Array.isArray(content)
  ? content.filter((c) => c && ['text', 'input_text', 'output_text'].includes(c.type)).map((c) => c.text || '').join('\n') : ''
export function parseSession(lines: string[], provider: 'claude' | 'codex'): { id?: string; cwd: string; messages: SessionDetail['messages'] } {
  let id: string | undefined
  let cwd = ''
  const messages: SessionDetail['messages'] = []
  const fallback: SessionDetail['messages'] = []
  for (const line of lines) {
    try {
      const j = JSON.parse(line)
      if (provider === 'codex' && j.type === 'session_meta') { id = j.payload?.id; cwd = j.payload?.cwd || cwd }
      if (provider === 'claude') { id ||= j.sessionId; cwd ||= j.cwd || '' }
      const m = provider === 'claude' && !j.isSidechain && ['user', 'assistant'].includes(j.type) ? j.message
        : provider === 'codex' && j.type === 'response_item' && j.payload?.type === 'message' ? j.payload : null
      if (m && ['user', 'assistant'].includes(m.role)) {
        const text = textOf(m.content).trim()
        if (text) messages.push({ role: m.role, text })
      }
      if (provider === 'codex' && j.type === 'event_msg') {
        if (j.payload?.type === 'user_message' && typeof j.payload.message === 'string') fallback.push({ role: 'user', text: j.payload.message })
        if (j.payload?.type === 'agent_message' && typeof j.payload.message === 'string') fallback.push({ role: 'assistant', text: j.payload.message })
      }
    } catch { /* aktif kaydın yarım satırını atla */ }
  }
  return { id, cwd, messages: messages.length ? messages : fallback }
}
export function handoffDraft(detail: SessionDetail): string {
  const user = detail.messages.filter((m) => m.role === 'user')
  const assistant = detail.messages.filter((m) => m.role === 'assistant')
  const goal = detail.goal || user.find((m) => !m.text.startsWith('<environment_context>') && !m.text.startsWith('# AGENTS.md'))?.text || '(Amacı buraya yazın)'
  return [
    '# Görev devri',
    'Proje: ' + detail.entry.cwd,
    'Kaynak: ' + detail.entry.tool + ' / ' + detail.entry.id,
    '', '# Amaç', goal.slice(0, 3000),
    '', '# Son ajan çıktısı — tamamlanan işleri kontrol edin', assistant.at(-1)?.text.slice(0, 5000) || '(Henüz ajan çıktısı yok)',
    '', '# Son kullanıcı isteği', user.at(-1)?.text.slice(0, 2000) || '(Yok)',
    '', '# Kalan görevler ve doğrulama', '(Devam edilecek işleri, çalıştırılacak testleri ve önemli kararları buraya yazın.)',
    detail.truncated ? '\nNot: Uzun oturumun yalnızca başlangıcı ve son kayıtları aktarıldı.' : ''
  ].join('\n')
}

export class SessionArchive {
  private metadata: Record<string, Metadata> = {}
  private index = new Map<string, Indexed>()
  private queue: Promise<void> = Promise.resolve()
  private ready: Promise<void>
  private storage: string
  private claudeRoot: string
  private codexRoot: string
  constructor(storage: string, claudeRoot: string, codexRoot: string) {
    this.storage = storage; this.claudeRoot = claudeRoot; this.codexRoot = codexRoot
    this.ready = readFile(join(storage, 'session-library.json'), 'utf8').then((raw) => {
      const data = JSON.parse(raw)
      if (data && typeof data === 'object' && !Array.isArray(data)) this.metadata = data
    }).catch(() => {})
  }
  private async persist(): Promise<void> {
    this.queue = this.queue.catch(() => {}).then(async () => {
      await mkdir(this.storage, { recursive: true })
      const file = join(this.storage, 'session-library.json')
      await writeFile(file + '.tmp', JSON.stringify(this.metadata, null, 2))
      await rename(file + '.tmp', file)
    })
    return this.queue
  }
  async remember(id: string, tool: AgentTool, cwd: string): Promise<void> {
    await this.ready
    const key = (tool === 'codex' ? 'codex:' : 'claude:') + id
    const previous = this.metadata[key]
    if (previous?.tool === tool && previous.cwd === cwd) return
    this.metadata[key] = { ...previous, tool, cwd }
    await this.persist()
  }
  async list(includeKey?: string): Promise<SessionEntry[]> {
    await this.ready
    const candidates: { file: string; provider: 'claude' | 'codex'; at: number }[] = []
    const scan = async (dir: string, provider: 'claude' | 'codex', depth: number): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        const file = join(dir, e.name)
        if (e.isDirectory() && depth > 0 && e.name !== 'subagents') await scan(file, provider, depth - 1)
        else if (e.isFile() && e.name.endsWith('.jsonl') && UUID.test(e.name)) {
          const info = await stat(file).catch(() => null)
          if (info) candidates.push({ file, provider, at: info.mtimeMs })
        }
      }
    }
    await Promise.all([scan(this.claudeRoot, 'claude', 1), scan(this.codexRoot, 'codex', 4)])
    candidates.sort((a, b) => b.at - a.at)
    const selected = candidates.filter((c, i) => i < 250 || includeKey === c.provider + ':' + basename(c.file).match(UUID)?.[0] || this.metadata[c.provider + ':' + basename(c.file).match(UUID)?.[0]]?.pinned)
    const next = new Map<string, Indexed>()
    for (let i = 0; i < selected.length; i += 8) {
      await Promise.all(selected.slice(i, i + 8).map(async (c) => {
        try {
          const parsed = parseSession((await readSessionParts(c.file)).lines, c.provider)
          const id = parsed.id?.match(UUID)?.[0] || basename(c.file).match(UUID)?.[0]
          if (!id) return
          const key = c.provider + ':' + id
          const meta = this.metadata[key] || {}
          const cwd = parsed.cwd || meta.cwd || ''
          if (!cwd) return
          const preview = parsed.messages.filter((m) => m.role === 'user').at(-1)?.text.slice(0, 400) || ''
          const title = meta.title || parsed.messages.find((m) => m.role === 'user' && !m.text.startsWith('<environment_context>') && !m.text.startsWith('# AGENTS.md'))?.text.replace(/\s+/g, ' ').slice(0, 80) || basename(cwd) || id
          next.set(key, { file: c.file, entry: { key, id, cwd, title, preview, tool: meta.tool || c.provider, pinned: !!meta.pinned, updatedAt: c.at } })
        } catch { /* okunamayan kaydı atla */ }
      }))
    }
    this.index = next
    return [...next.values()].map((v) => v.entry).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
  }
  async detail(key: string): Promise<SessionDetail> {
    let found = this.index.get(key)
    if (!found) { await this.list(key); found = this.index.get(key) }
    if (!found) throw new Error('Oturum kaydı bulunamadı. Arşivi yenileyin.')
    const data = await readSessionParts(found.file, 512 * 1024)
    const messages = parseSession(data.lines, found.entry.tool === 'codex' ? 'codex' : 'claude').messages
    const goal = messages.find((m) => m.role === 'user' && !m.text.startsWith('<environment_context>') && !m.text.startsWith('# AGENTS.md'))?.text
    return { entry: found.entry, goal, messages: messages.slice(-40), truncated: data.truncated || messages.length > 40 }
  }
  async update(key: string, patch: { title?: string; pinned?: boolean }): Promise<void> {
    const { entry } = await this.detail(key)
    this.metadata[key] = { ...this.metadata[key], tool: entry.tool, cwd: entry.cwd,
      ...(typeof patch.title === 'string' ? { title: patch.title.trim().slice(0, 120) } : {}),
      ...(typeof patch.pinned === 'boolean' ? { pinned: patch.pinned } : {}) }
    await this.persist()
  }
}
