import { claudeContext, claudeLimits } from './claude'
import { codexContext, codexLimits } from './codex'
import type { ContextResult, LimitsResult } from './types'

export type { ContextResult, LimitsResult, LimitWindow } from './types'

let cache: { claude: LimitsResult; codex: LimitsResult } | null = null
let inflight: Promise<{ claude: LimitsResult; codex: LimitsResult }> | null = null

/** İki aracın limitleri; `maxAgeMs` içinde tekrar istenirse önbellekten döner. */
export async function getLimits(maxAgeMs: number, force = false): Promise<{ claude: LimitsResult; codex: LimitsResult }> {
  if (!force && cache && Date.now() - cache.claude.fetchedAt < maxAgeMs) return cache
  if (!inflight) {
    inflight = Promise.all([claudeLimits(), codexLimits()])
      .then(([claude, codex]) => (cache = { claude, codex }))
      .finally(() => (inflight = null))
  }
  return inflight
}

export function getContext(tool: string, cwd: string, since: number, args = ''): ContextResult | null {
  const resume = /(^|\s)(-c|--continue|-r|--resume|resume)(\s|$)/.test(args)
  if (tool === 'claude') return claudeContext(cwd, since, resume)
  if (tool === 'codex') return codexContext(since, resume)
  return null
}
