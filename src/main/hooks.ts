import { app } from 'electron'
import { writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'

export type TabState = 'working' | 'waiting' | 'done' | 'error'

type Listener = (tabId: string, state: TabState, sessionId?: string) => void

/** Claude Code hook olayını sekme durumuna çevirir; durumu etkilemeyen olaylar için null. */
function stateFor(body: Record<string, any>): TabState | null {
  switch (body.hook_event_name) {
    case 'UserPromptSubmit':
    case 'PostToolUse':
    case 'PostToolUseFailure':
      return 'working'
    case 'PreToolUse':
      return body.tool_name === 'AskUserQuestion' ? 'waiting' : 'working'
    case 'PermissionRequest':
      return 'waiting'
    case 'Notification':
      return ['permission_prompt', 'elicitation_dialog', 'agent_needs_input'].includes(body.notification_type) ? 'waiting' : null
    case 'Stop':
      return 'done'
    case 'StopFailure':
      return 'error'
    default:
      return null
  }
}

const EVENTS = ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure']

let settingsFile: string | null = null

/**
 * Claude Code'un HTTP hook'larını dinleyen yerel sunucuyu başlatır ve
 * `--settings` ile verilecek ayar dosyasını yazar. Sekme, pty ortamındaki ROUN_TAB ile tanınır.
 */
export function startHookServer(onState: Listener): void {
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => (raw += d))
    req.on('end', () => {
      res.end()
      const tabId = req.headers['x-roun-tab']
      if (typeof tabId !== 'string' || !tabId) return
      try {
        const body = JSON.parse(raw)
        const state = stateFor(body)
        if (state) onState(tabId, state, body.session_id)
      } catch {
        /* bozuk istek */
      }
    })
  })
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as AddressInfo
    const hook = {
      type: 'http',
      url: `http://127.0.0.1:${port}/hook`,
      timeout: 5,
      headers: { 'X-Roun-Tab': '$ROUN_TAB' },
      allowedEnvVars: ['ROUN_TAB']
    }
    const hooks = Object.fromEntries(EVENTS.map((e) => [e, [{ hooks: [hook] }]]))
    const file = join(app.getPath('userData'), 'claude-hooks.json')
    try {
      writeFileSync(file, JSON.stringify({ hooks }, null, 2))
      settingsFile = file
    } catch {
      /* yazılamazsa Claude sekmeleri durum bildirmeden çalışır */
    }
  })
}

/** Claude'a verilecek `--settings` argümanı (sunucu hazır değilse boş). */
export function claudeHookArgs(): string {
  return settingsFile ? `--settings "${settingsFile}"` : ''
}
