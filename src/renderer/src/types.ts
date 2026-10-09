import type { RounApi } from '../../preload'
import type { FeatureSettings } from '../../shared/features'
export type { SessionEntry, SessionDetail, UsageInsight, WorktreeInfo } from '../../shared/features'

declare global {
  interface Window {
    roun: RounApi
  }
}

export type Tool = 'claude' | 'codex' | 'openrouter' | 'shell'

export const TOOLS: Tool[] = ['claude', 'codex', 'openrouter', 'shell']

/** OpenRouter sekmesi, OmniRoute üzerinden çalışan bir Claude Code oturumudur. */
export const isClaudeLike = (t: Tool): boolean => t === 'claude' || t === 'openrouter'

/** Sekmedeki konuşmanın durumu: çalışıyor / yanıt bekliyor / bitti / hata */
export type TabState = 'working' | 'waiting' | 'done' | 'error'

export const STATE_NAMES: Record<TabState, string> = {
  working: 'çalışıyor',
  waiting: 'yanıt bekliyor',
  done: 'bitti',
  error: 'hata'
}

export interface Tab {
  id: string
  tool: Tool
  cwd: string
  args: string
  startedAt: number
  exitCode: number | null
  /** Yeniden başlatmada TerminalView'in süreci tekrar açması için artar */
  run: number
  state?: TabState
}

export interface LimitWindow {
  label: string
  percent: number
  resetsAt: string | null
}

export interface LimitsResult {
  ok: boolean
  windows: LimitWindow[]
  plan?: string
  source: 'api' | 'log' | 'none'
  error?: string
  fetchedAt: number
  measuredAt?: number
}

export interface Limits {
  claude: LimitsResult
  codex: LimitsResult
}

export interface ContextResult {
  ok: boolean
  used: number
  window: number
  percent: number
  model?: string
  updatedAt?: number
}

export interface Settings extends FeatureSettings {
  theme: 'dark' | 'light'
  fontFamily: string
  fontSize: number
  defaultTool: Tool
  defaultCwd: string
  claudeArgs: string
  codexArgs: string
  openrouterStartup: string
  refreshSeconds: number
  recentDirs: string[]
  sidebarCollapsed: boolean
}

export const TOOL_NAMES: Record<Tool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  openrouter: 'OpenRouter',
  shell: 'Terminal'
}

export function baseName(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}
