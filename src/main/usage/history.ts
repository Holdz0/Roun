import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import type { UsageSample, UsageInsight, FeatureSettings } from '../../shared/features'
import type { LimitsResult } from './types'

export interface UsageAlert { key: string; title: string; body: string }
export function usageInsights(samples: UsageSample[], now = Date.now()): UsageInsight[] {
  const groups = new Map<string, UsageSample[]>()
  for (const s of samples) {
    if (s.at < now - 86400000 || s.at > now) continue
    const key = s.tool + ':' + s.label
    const group = groups.get(key) || []; group.push(s); groups.set(key, group)
  }
  return [...groups.values()].map((group) => {
    group.sort((a, b) => a.at - b.at)
    const last = group.at(-1)!
    const current: UsageSample[] = []
    for (let i = group.length - 1; i >= 0; i--) {
      const s = group[i]
      if (s.source !== 'api' || s.resetsAt !== last.resetsAt || s.at < now - 3600000 || (current.length && s.percent > current.at(-1)!.percent)) break
      current.push(s)
    }
    const first = current.at(-1)
    const span = first ? last.at - first.at : 0
    const fresh = now - last.at <= 5 * 60000 && (!last.resetsAt || Date.parse(last.resetsAt) > now)
    const rate = fresh && current.length >= 3 && span >= 5 * 60000 ? (last.percent - first!.percent) / (span / 3600000) : 0
    return { tool: last.tool, label: last.label, history: group.slice(-90), ratePerHour: rate > 0 ? rate : null,
      minutesLeft: rate > 0 && last.percent < 100 ? (100 - last.percent) / rate * 60 : null }
  })
}
export class UsageHistory {
  private samples: UsageSample[] = []
  private alerted = new Map<string, number>()
  private file?: string
  constructor(file?: string) {
    this.file = file
    if (file && existsSync(file)) try {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      this.samples = Array.isArray(data.samples) ? data.samples.filter((s: UsageSample) => ['claude', 'codex'].includes(s.tool) && Number.isFinite(s.at) && Number.isFinite(s.percent)).slice(-4000) : []
      this.alerted = new Map(Array.isArray(data.alerted) ? data.alerted : [])
    } catch { /* yeni geçmiş */ }
  }
  private persist(): void {
    if (!this.file) return
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file + '.tmp', JSON.stringify({ samples: this.samples, alerted: [...this.alerted] }))
      renameSync(this.file + '.tmp', this.file)
    } catch { /* geçmiş yazılamasa da canlı panel çalışır */ }
  }
  record(limits: { claude: LimitsResult; codex: LimitsResult }, settings: FeatureSettings, now = Date.now()): UsageAlert[] {
    const alerts: UsageAlert[] = []
    for (const tool of ['claude', 'codex'] as const) {
      const result = limits[tool]
      if (!result.ok || result.source === 'none') continue
      for (const w of result.windows) {
        if (!Number.isFinite(w.percent)) continue
        const last = [...this.samples].reverse().find((s) => s.tool === tool && s.label === w.label)
        const at = result.measuredAt ?? result.fetchedAt
        if (!last || (at > last.at && (at - last.at >= 30000 || last.percent !== w.percent || last.resetsAt !== w.resetsAt))) {
          this.samples.push({ tool, ...w, percent: Math.max(0, Math.min(100, w.percent)), at, source: result.source })
        }
        // Kayıttan okunan eski limitler için masaüstü uyarısı üretme.
        const key = 'limit:' + tool + ':' + w.label + ':' + (w.resetsAt || new Date(now).toISOString().slice(0, 10)) + ':' + settings.usageAlertPercent
        if (result.source === 'api' && settings.usageAlerts && w.percent >= settings.usageAlertPercent && (!w.resetsAt || Date.parse(w.resetsAt) > now) && !this.alerted.has(key)) {
          alerts.push({ key, title: tool === 'claude' ? 'Claude limit uyarısı' : 'Codex limit uyarısı', body: w.label + ' kullanımı %' + Math.round(w.percent) + '. Eşik: %' + settings.usageAlertPercent })
          this.alerted.set(key, now)
        }
      }
    }
    this.samples = this.samples.filter((s) => s.at >= now - 7 * 86400000).slice(-4000)
    for (const [key, at] of this.alerted) if (at < now - 8 * 86400000) this.alerted.delete(key)
    this.persist()
    return alerts
  }
  resetAlerts(settings: FeatureSettings, now = Date.now()): UsageAlert[] {
    if (!settings.resetReminders || !settings.usageAlerts) return []
    const alerts: UsageAlert[] = []
    for (const s of this.samples) {
      if (s.source !== 'api' || !s.resetsAt || s.percent < settings.usageAlertPercent) continue
      const reset = Date.parse(s.resetsAt)
      const key = 'reset:' + s.tool + ':' + s.label + ':' + s.resetsAt
      if (now >= reset && now - reset < 15 * 60000 && !this.alerted.has(key)) {
        alerts.push({ key, title: 'Limit sıfırlanma zamanı', body: s.tool + ' · ' + s.label + ' için sıfırlanma zamanı geldi. Güncel durumu panelden kontrol edin.' })
        this.alerted.set(key, now)
      }
    }
    if (alerts.length) this.persist()
    return alerts
  }
  insights(now = Date.now()): UsageInsight[] { return usageInsights(this.samples, now) }
}
