export type AgentTool = 'claude' | 'codex' | 'openrouter'
export interface SessionEntry {
  key: string
  id: string
  tool: AgentTool
  cwd: string
  title: string
  pinned: boolean
  updatedAt: number
  preview: string
}
export interface SessionDetail {
  entry: SessionEntry
  goal?: string
  messages: { role: 'user' | 'assistant'; text: string }[]
  truncated: boolean
}
export interface UsageSample {
  tool: 'claude' | 'codex'
  label: string
  percent: number
  resetsAt: string | null
  at: number
  source: 'api' | 'log'
}
export interface UsageInsight {
  tool: 'claude' | 'codex'
  label: string
  history: UsageSample[]
  ratePerHour: number | null
  minutesLeft: number | null
}
export interface WorktreeInfo { path: string; branch: string; bare: boolean }
export interface FeatureSettings {
  notificationsEnabled: boolean
  quietMode: boolean
  notificationCooldownSeconds: number
  usageAlerts: boolean
  usageAlertPercent: number
  contextAlertPercent: number
  resetReminders: boolean
}
