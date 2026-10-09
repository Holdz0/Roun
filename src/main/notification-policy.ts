import type { FeatureSettings } from '../shared/features'
import type { TabState } from './hooks'

export class NotificationPolicy {
  private states = new Map<string, TabState>()
  private sent = new Map<string, number>()
  allow(key: string, settings: FeatureSettings, now = Date.now()): boolean {
    if (!settings.notificationsEnabled || settings.quietMode) return false
    const previous = this.sent.get(key)
    if (previous !== undefined && now - previous < settings.notificationCooldownSeconds * 1000) return false
    this.sent.set(key, now)
    if (this.sent.size > 1000) for (const [k, at] of this.sent) if (now - at > 86400000) this.sent.delete(k)
    return true
  }
  transition(id: string, state: TabState, settings: FeatureSettings, now = Date.now()): boolean {
    const previous = this.states.get(id)
    this.states.set(id, state)
    if (previous === state || state === 'working') return false
    if (state === 'done' && previous !== 'working' && previous !== 'waiting') return false
    return this.allow('tab:' + id + ':' + state, settings, now)
  }
  forget(id: string): void { this.states.delete(id) }
}
