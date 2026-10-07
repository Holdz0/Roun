import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { newestJsonl } from './usage/jsonl'
import { projectDirFor } from './usage/claude'
import { SESSIONS as CODEX_SESSIONS } from './usage/codex'

export interface TabInfo {
  id: string
  tool: 'claude' | 'codex' | 'shell'
  cwd: string
  args: string
  startedAt: number
}

interface SavedTab extends TabInfo {
  sessionId?: string
}

interface State {
  tabs: SavedTab[]
  activeId: string | null
}

const RESUME_RE = /(^|\s)(-c|--continue|-r|--resume|resume)(\s|$)/
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const file = (): string => join(app.getPath('userData'), 'tabs.json')

let state: State = { tabs: [], activeId: null }

function write(): void {
  try {
    writeFileSync(file(), JSON.stringify(state, null, 2))
  } catch {
    /* yazılamazsa bir sonraki kayıtta denenir */
  }
}

/** Sekmenin şu anda yazdığı oturumun kimliği (bulunamazsa önceki bilinen kimlik). */
function resolveSession(t: SavedTab, taken: Set<string>): string | undefined {
  if (t.tool === 'shell') return undefined
  const resume = RESUME_RE.test(t.args)
  const range = resume ? { since: t.startedAt - 2000 } : { createdSince: t.startedAt - 2000 }
  if (t.tool === 'claude') {
    // Yeni sekmelere kimliği biz veriyoruz; dosyası varsa kesin olan odur
    const explicit = t.args.match(new RegExp(`--session-id\\s+(${UUID})`))?.[1]
    if (explicit && existsSync(join(projectDirFor(t.cwd), `${explicit}.jsonl`))) return explicit
    const n = newestJsonl(projectDirFor(t.cwd), range)
    const id = n ? basename(n.file, '.jsonl') : undefined
    if (id && !taken.has(id)) return id
  } else {
    const n = newestJsonl(CODEX_SESSIONS, { recursive: true, prefix: 'rollout-', ...range })
    const id = n?.file.match(new RegExp(`(${UUID})\\.jsonl$`))?.[1]
    if (id && !taken.has(id)) return id
  }
  return t.sessionId
}

function resolveAll(): void {
  const taken = new Set<string>()
  for (const t of state.tabs) {
    t.sessionId = resolveSession(t, taken)
    if (t.sessionId) taken.add(t.sessionId)
  }
}

/** Renderer'daki sekme listesi her değiştiğinde çağrılır. */
export function saveTabs(tabs: TabInfo[], activeId: string | null): void {
  const prev = new Map(state.tabs.map((t) => [t.id, t.sessionId]))
  state = { tabs: tabs.map((t) => ({ ...t, sessionId: prev.get(t.id) })), activeId }
  resolveAll()
  write()
}

/** Uygulama kapanırken oturum kimliklerini son kez güncelleyip yazar. */
export function finalizeTabs(): void {
  resolveAll()
  write()
}

/** Yeniden açılışta oturumu sürdürecek argümanlar. */
function restoreArgs(t: SavedTab): string {
  if (t.tool === 'shell' || !t.sessionId) return t.args
  const rest = t.args
    .replace(new RegExp(`(--session-id|--resume|-r)\\s+${UUID}`, 'g'), '')
    .replace(new RegExp(`^\\s*resume\\s+${UUID}`), '')
    .split(/\s+/)
    .filter((a) => a && !['-c', '--continue', '-r', '--resume', 'resume'].includes(a))
    .join(' ')
  return t.tool === 'claude'
    ? [`--resume ${t.sessionId}`, rest].filter(Boolean).join(' ')
    : [`resume ${t.sessionId}`, rest].filter(Boolean).join(' ')
}

/** Önceki çalıştırmadan kalan sekmeler, sürdürme argümanlarıyla birlikte. */
export function loadTabs(): State {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as State
    const tabs = (raw.tabs ?? []).filter((t) => t && t.cwd && ['claude', 'codex', 'shell'].includes(t.tool))
    state = { tabs, activeId: raw.activeId ?? null }
    return { tabs: tabs.map((t) => ({ ...t, args: restoreArgs(t) })), activeId: state.activeId }
  } catch {
    return { tabs: [], activeId: null }
  }
}
