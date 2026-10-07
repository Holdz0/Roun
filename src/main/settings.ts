import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface Settings {
  theme: 'dark' | 'light'
  fontFamily: string
  fontSize: number
  defaultTool: 'claude' | 'codex' | 'shell'
  defaultCwd: string
  claudeArgs: string
  codexArgs: string
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
  refreshSeconds: 60,
  recentDirs: [],
  sidebarCollapsed: false
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch {
    /* yazılamazsa bellekte kalsın */
  }
  return next
}
