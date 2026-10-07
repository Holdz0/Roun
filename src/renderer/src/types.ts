import type { RounApi } from '../../preload'

declare global {
  interface Window {
    roun: RounApi
  }
}

export type Tool = 'claude' | 'codex' | 'shell'

export interface Tab {
  id: string
  tool: Tool
  cwd: string
  args: string
  startedAt: number
  exitCode: number | null
  /** Yeniden başlatmada TerminalView'in süreci tekrar açması için artar */
  run: number
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

export interface Settings {
  theme: 'dark' | 'light'
  fontFamily: string
  fontSize: number
  defaultTool: Tool
  defaultCwd: string
  claudeArgs: string
  codexArgs: string
  refreshSeconds: number
  recentDirs: string[]
  sidebarCollapsed: boolean
}

export const TOOL_NAMES: Record<Tool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  shell: 'Terminal'
}

export function baseName(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}
