import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { newestJsonl, tailLines } from './jsonl'
import type { ContextResult, LimitsResult, LimitWindow } from './types'

const CODEX_DIR = process.env.CODEX_HOME || join(homedir(), '.codex')
export const SESSIONS = join(CODEX_DIR, 'sessions')

function windowLabel(seconds: number | undefined, fallback: string): string {
  if (!seconds) return fallback
  const h = seconds / 3600
  if (h >= 24 * 6) return 'Haftalık'
  return `${Math.round(h)} saat`
}

function toIso(epochSec: number | undefined, inSec: number | undefined, base: number): string | null {
  if (epochSec) return new Date(epochSec * 1000).toISOString()
  if (inSec !== undefined) return new Date(base + inSec * 1000).toISOString()
  return null
}

/** ChatGPT hesabı için Codex'in /status ekranının kullandığı uç nokta. */
async function fromApi(now: number): Promise<LimitsResult | null> {
  let auth
  try {
    auth = JSON.parse(readFileSync(join(CODEX_DIR, 'auth.json'), 'utf8'))
  } catch {
    return null
  }
  const t = auth?.tokens
  if (!t?.access_token) return null
  try {
    const res = await fetch('https://chatgpt.com/backend-api/wham/usage', {
      headers: {
        Authorization: `Bearer ${t.access_token}`,
        ...(t.account_id ? { 'ChatGPT-Account-Id': t.account_id } : {}),
        'User-Agent': 'codex_cli_rs/roun'
      },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return null
    const d = await res.json()
    const rl = d.rate_limit ?? {}
    const windows: LimitWindow[] = []
    const pairs: [any, string][] = [
      [rl.primary_window, '5 saat'],
      [rl.secondary_window, 'Haftalık']
    ]
    for (const [w, fb] of pairs) {
      if (w && typeof w.used_percent === 'number') {
        windows.push({
          label: windowLabel(w.limit_window_seconds, fb),
          percent: w.used_percent,
          resetsAt: toIso(w.reset_at, w.reset_after_seconds, now)
        })
      }
    }
    return windows.length ? { ok: true, windows, plan: d.plan_type, source: 'api', fetchedAt: now } : null
  } catch {
    return null
  }
}

/** Son Codex oturum kaydındaki token_count olayından limitleri okur. */
function fromLogs(now: number): LimitsResult | null {
  const newest = newestJsonl(SESSIONS, { recursive: true, prefix: 'rollout-' })
  if (!newest) return null
  for (const line of tailLines(newest.file)) {
    if (!line.includes('rate_limits')) continue
    try {
      const j = JSON.parse(line)
      const rl = j.payload?.rate_limits ?? j.msg?.rate_limits
      if (!rl) continue
      const base = j.timestamp ? Date.parse(j.timestamp) : newest.mtime
      const windows: LimitWindow[] = []
      const pairs: [any, string][] = [
        [rl.primary, '5 saat'],
        [rl.secondary, 'Haftalık']
      ]
      for (const [w, fb] of pairs) {
        if (w && typeof w.used_percent === 'number') {
          windows.push({
            label: windowLabel(w.window_minutes ? w.window_minutes * 60 : undefined, fb),
            percent: w.used_percent,
            resetsAt: toIso(w.resets_at, w.resets_in_seconds, base)
          })
        }
      }
      if (windows.length) return { ok: true, windows, source: 'log', fetchedAt: now }
    } catch {
      /* sonraki satır */
    }
  }
  return null
}

export async function codexLimits(): Promise<LimitsResult> {
  const now = Date.now()
  return (
    (await fromApi(now)) ??
    fromLogs(now) ?? {
      ok: false,
      windows: [],
      source: 'none',
      error: 'Henüz veri yok. Codex sekmesinde bir istem gönderince görünür.',
      fetchedAt: now
    }
  )
}

/** Sekme açıldıktan sonra yazılan en yeni Codex oturumunun bağlam doluluğu. */
export function codexContext(since: number, resume: boolean): ContextResult {
  const empty: ContextResult = { ok: false, used: 0, window: 0, percent: 0 }
  const newest = newestJsonl(SESSIONS, { recursive: true, prefix: 'rollout-', ...(resume ? { since: since - 2000 } : { createdSince: since - 2000 }) })
  if (!newest) return empty
  for (const line of tailLines(newest.file)) {
    if (!line.includes('token_count')) continue
    try {
      const j = JSON.parse(line)
      const info = j.payload?.info ?? j.msg?.info
      if (!info) continue
      const used = info.last_token_usage?.total_tokens ?? info.last_token_usage?.input_tokens ?? 0
      const window = info.model_context_window ?? 0
      if (!used || !window) continue
      return { ok: true, used, window, percent: (used / window) * 100, updatedAt: newest.mtime }
    } catch {
      /* sonraki satır */
    }
  }
  return empty
}
