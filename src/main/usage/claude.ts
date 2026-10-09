import { readFileSync, existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { newestJsonl, tailLines } from './jsonl'
import type { ContextResult, LimitsResult, LimitWindow } from './types'

export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

const LABELS: Record<string, string> = {
  five_hour: '5 saat',
  seven_day: 'Haftalık',
  seven_day_opus: 'Haftalık · Opus',
  seven_day_sonnet: 'Haftalık · Sonnet'
}

interface OAuth {
  accessToken: string
  expiresAt?: number
  subscriptionType?: string
}

function readOauth(): OAuth | null {
  try {
    const raw = JSON.parse(readFileSync(join(CLAUDE_DIR, '.credentials.json'), 'utf8'))
    return raw.claudeAiOauth ?? null
  } catch {
    return null
  }
}

/** Abonelik limitlerini Claude Code'un /usage ekranının kullandığı uç noktadan okur. */
export async function claudeLimits(): Promise<LimitsResult> {
  const now = Date.now()
  const auth = readOauth()
  if (!auth?.accessToken) {
    return { ok: false, windows: [], source: 'none', error: 'Giriş bulunamadı. Claude sekmesinde /login yapın.', fetchedAt: now }
  }
  const fail = (error: string): LimitsResult => ({
    ok: false,
    windows: [],
    plan: auth.subscriptionType,
    source: 'none',
    error,
    fetchedAt: now
  })
  if (auth.expiresAt && auth.expiresAt < now) {
    return fail('Oturum anahtarının süresi dolmuş. Bir Claude sekmesi açınca otomatik yenilenir.')
  }
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/roun'
      },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return fail(`Limitler alınamadı (HTTP ${res.status})`)
    const data = (await res.json()) as Record<string, { utilization?: number; resets_at?: string } | null>
    const windows: LimitWindow[] = []
    for (const key of Object.keys(LABELS)) {
      const w = data[key]
      if (w && typeof w.utilization === 'number') {
        windows.push({ label: LABELS[key], percent: w.utilization, resetsAt: w.resets_at ?? null })
      }
    }
    return { ok: true, windows, plan: auth.subscriptionType, source: 'api', fetchedAt: now }
  } catch (e) {
    return fail(`Limitler alınamadı (${(e as Error).message})`)
  }
}

/** Claude Code proje klasörü adı: harf/rakam dışındaki her karakter '-' olur. */
export function projectDirFor(cwd: string): string {
  return join(CLAUDE_DIR, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
}

/** Sekmenin cwd'sine ait, sekme açıldıktan sonra yazılan en güncel oturumun bağlam doluluğu. */
export function claudeContext(cwd: string, since: number, resume: boolean, sessionId?: string): ContextResult {
  const empty: ContextResult = { ok: false, used: 0, window: 200_000, percent: 0 }
  // Yeni oturumlar sekmeden sonra oluşturulan dosyaya, devam edilenler sonradan yazılan dosyaya yazar
  const explicit = sessionId ? join(projectDirFor(cwd), sessionId + '.jsonl') : null
  const newest = explicit ? (existsSync(explicit) ? { file: explicit, mtime: statSync(explicit).mtimeMs } : null) : newestJsonl(projectDirFor(cwd), resume ? { since: since - 2000 } : { createdSince: since - 2000 })
  if (!newest) return empty
  try {
    for (const line of tailLines(newest.file)) {
      if (!line.includes('"usage"')) continue
      let j
      try {
        j = JSON.parse(line)
      } catch {
        continue
      }
      if (j.type !== 'assistant' || j.isSidechain || !j.message?.usage) continue
      const u = j.message.usage
      const used =
        (u.input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0) +
        (u.output_tokens ?? 0)
      if (used === 0) continue
      const model: string = j.message.model ?? ''
      const window = used > 200_000 || model.includes('[1m]') ? 1_000_000 : 200_000
      return { ok: true, used, window, percent: (used / window) * 100, model, updatedAt: newest.mtime }
    }
  } catch {
    /* okunamadı */
  }
  return empty
}
