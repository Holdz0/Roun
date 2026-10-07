export interface LimitWindow {
  label: string
  percent: number // 0-100
  resetsAt: string | null // ISO
}

export interface LimitsResult {
  ok: boolean
  windows: LimitWindow[]
  plan?: string
  source: 'api' | 'log' | 'none'
  error?: string
  fetchedAt: number
}

export interface ContextResult {
  ok: boolean
  used: number
  window: number
  percent: number
  model?: string
  updatedAt?: number
}
