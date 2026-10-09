import { app } from 'electron'
import type { FeatureSettings } from '../shared/features'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface Settings extends FeatureSettings {
  theme: 'dark' | 'light'
  fontFamily: string
  fontSize: number
  defaultTool: 'claude' | 'codex' | 'openrouter' | 'shell'
  defaultCwd: string
  claudeArgs: string
  codexArgs: string
  /** OpenRouter sekmesinde Claude başlamadan önce çalışan PowerShell komutları */
  openrouterStartup: string
  refreshSeconds: number
  recentDirs: string[]
  sidebarCollapsed: boolean
}

const defaults: Settings = {
  theme: 'dark',
  fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
  fontSize: 14,
  defaultTool: 'claude',
  defaultCwd: homedir(),
  claudeArgs: '',
  codexArgs: '',
  openrouterStartup: '',
  refreshSeconds: 60,
  recentDirs: [],
  sidebarCollapsed: false,
  notificationsEnabled: true,
  quietMode: false,
  notificationCooldownSeconds: 60,
  usageAlerts: true,
  usageAlertPercent: 85,
  contextAlertPercent: 85,
  resetReminders: true
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  try {
    return normalize({ ...defaults, ...JSON.parse(readFileSync(file(), 'utf8')) })
  } catch {
    return { ...defaults }
  }
}

function normalize(s: Settings): Settings {
  const number = (n: number, min: number, max: number, fallback: number): number => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
  return { ...s, usageAlertPercent: number(s.usageAlertPercent, 1, 100, 85), contextAlertPercent: number(s.contextAlertPercent, 1, 100, 85), notificationCooldownSeconds: number(s.notificationCooldownSeconds, 10, 3600, 60) }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = normalize({ ...loadSettings(), ...patch })
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch {
    /* yazılamazsa bellekte kalsın */
  }
  return next
}
