import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { newestJsonl } from './usage/jsonl'
import { projectDirFor } from './usage/claude'
import { SESSIONS as CODEX_SESSIONS, codexSessionCwd, sameCwd } from './usage/codex'
import { isClaudeLike } from './cli'

export interface TabInfo {
  id: string
  tool: 'claude' | 'codex' | 'openrouter' | 'shell'
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

/** Claude hook'larından gelen, sekmenin o anki gerçek oturum kimliği (/clear sonrası da doğru). */
const hinted = new Map<string, string>()
let recorder: ((id: string, tool: Exclude<TabInfo['tool'], 'shell'>, cwd: string) => void) | null = null
export function setSessionRecorder(fn: NonNullable<typeof recorder>): void { recorder = fn }
export function getSavedTab(id: string): SavedTab | undefined {
  resolveAll()
  return state.tabs.find((t) => t.id === id)
}

export function noteSession(tabId: string, sessionId: string): void {
  if (!new RegExp('^' + UUID + '$', 'i').test(sessionId)) return
  hinted.set(tabId, sessionId)
  const tab = state.tabs.find((t) => t.id === tabId)
  if (tab && tab.tool !== 'shell') {
    tab.sessionId = sessionId
    recorder?.(sessionId, tab.tool, tab.cwd)
    write()
  }
}

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
  if (isClaudeLike(t.tool)) {
    const hint = hinted.get(t.id)
    if (hint && !taken.has(hint)) return hint
    // Yeni sekmelere kimliği biz veriyoruz; dosyası varsa kesin olan odur
    const explicit = t.args.match(/(?:--session-id|--resume|-r)\s+["']?([0-9a-f-]{36})/i)?.[1]
    if (explicit) return resume || existsSync(join(projectDirFor(t.cwd), explicit + '.jsonl')) ? explicit : undefined
    const n = newestJsonl(projectDirFor(t.cwd), { ...range, acceptFile: (file) => !taken.has(basename(file, '.jsonl')) })
    const id = n ? basename(n.file, '.jsonl') : undefined
    if (id && !taken.has(id)) return id
  } else {
    const explicit = t.args.match(/(?:resume|--resume|-r)\s+["']?([0-9a-f-]{36})/i)?.[1]
    if (explicit && !taken.has(explicit)) return explicit
    const hint = hinted.get(t.id)
    if (hint && !taken.has(hint)) return hint
    if (t.sessionId && !taken.has(t.sessionId)) return t.sessionId
    const n = newestJsonl(CODEX_SESSIONS, { recursive: true, prefix: 'rollout-', ...range,
      acceptFile: (file) => {
        const id = basename(file).match(/([0-9a-f-]{36})\.jsonl$/i)?.[1]
        const cwd = codexSessionCwd(file)
        return !!id && !taken.has(id) && !!cwd && sameCwd(cwd, t.cwd)
      }
    })
    const id = n?.file.match(new RegExp(`(${UUID})\\.jsonl$`))?.[1]
    if (id && !taken.has(id)) return id
  }
  return t.sessionId
}

function resolveAll(): void {
  const taken = new Set<string>()
  for (const t of state.tabs) {
    t.sessionId = resolveSession(t, taken)
    if (t.sessionId) {
      taken.add(t.sessionId)
      if (t.tool !== 'shell') recorder?.(t.sessionId, t.tool, t.cwd)
    }
  }
}

/** Renderer'daki sekme listesi her değiştiğinde çağrılır. */
export function saveTabs(tabs: TabInfo[], activeId: string | null): void {
  resolveAll()
  for (const id of hinted.keys()) if (!tabs.some((t) => t.id === id)) hinted.delete(id)
  const prev = new Map(state.tabs.map((t) => [t.id, t]))
  state = { tabs: tabs.map((t) => {
    const old = prev.get(t.id)
    const restart = old && old.startedAt !== t.startedAt && !RESUME_RE.test(t.args)
    if (restart) hinted.delete(t.id)
    return { ...t, sessionId: restart ? undefined : old?.sessionId }
  }), activeId }
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
  return isClaudeLike(t.tool)
    ? [`--resume ${t.sessionId}`, rest].filter(Boolean).join(' ')
    : [`resume ${t.sessionId}`, rest].filter(Boolean).join(' ')
}

/** Önceki çalıştırmadan kalan sekmeler, sürdürme argümanlarıyla birlikte. */
export function loadTabs(): State {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as State
    const tabs = (raw.tabs ?? []).filter((t) => t && t.cwd && ['claude', 'codex', 'openrouter', 'shell'].includes(t.tool))
    state = { tabs, activeId: raw.activeId ?? null }
    return { tabs: tabs.map((t) => ({ ...t, args: restoreArgs(t) })), activeId: state.activeId }
  } catch {
    return { tabs: [], activeId: null }
  }
}
