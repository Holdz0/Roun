// Yalnızca tests/ui-preview.mjs tarafından sunulan yerel arayüz doğrulama verisi.
const settings = { theme: 'dark', fontFamily: 'Consolas, monospace', fontSize: 14, defaultTool: 'claude', defaultCwd: 'C:/Demo/Roun', claudeArgs: '', codexArgs: '', openrouterStartup: '', refreshSeconds: 60, recentDirs: ['C:/Demo/Roun'], sidebarCollapsed: false, notificationsEnabled: true, quietMode: false, notificationCooldownSeconds: 60, usageAlerts: true, usageAlertPercent: 85, contextAlertPercent: 85, resetReminders: true }
const now = Date.now(), reset = new Date(now + 3600000).toISOString()
const entries = [
  { key: 'claude:12345678-1234-1234-1234-123456789abc', id: '12345678-1234-1234-1234-123456789abc', tool: 'claude', cwd: 'C:/Demo/Roun', title: 'Terminal bölünmüş görünümü', pinned: true, updatedAt: now, preview: 'İki ajanı yan yana çalıştır.' },
  { key: 'codex:abcdefab-1234-1234-1234-abcdefabcdef', id: 'abcdefab-1234-1234-1234-abcdefabcdef', tool: 'codex', cwd: 'C:/Demo/Other', title: 'Kullanım uyarıları', pinned: false, updatedAt: now - 86400000, preview: 'Kullanım eşiğini kontrol et.' }
]
const callbacks = { data: [], exit: [], state: [], activate: [], error: [], limits: [] }
const subscribe = (event, cb) => { callbacks[event].push(cb); return () => { callbacks[event] = callbacks[event].filter((f) => f !== cb) } }
const calls = { spawned: [], killed: [], saved: [], reports: [] }
const report = () => fetch('/test-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calls) })
const limits = { claude: { ok: true, windows: [{ label: '5 saat', percent: 90, resetsAt: reset }], source: 'api', fetchedAt: now }, codex: { ok: true, windows: [{ label: '5 saat', percent: 35, resetsAt: reset }], source: 'api', fetchedAt: now } }
window.roun = {
  settings: { get: async () => ({ ...settings }), set: async (patch) => ({ ...Object.assign(settings, patch) }) },
  tabs: { session: async (id) => id === 'left' ? entries[0].id : null, load: async () => ({ tabs: [{ id: 'left', tool: 'claude', cwd: 'C:/Demo/Roun', args: '--session-id ' + entries[0].id, startedAt: now }, { id: 'right', tool: 'codex', cwd: 'C:/Demo/Roun', args: '', startedAt: now }], activeId: 'left' }), save: (tabs) => { calls.saved = tabs; report() }, onState: (cb) => subscribe('state', cb) },
  pty: { spawn: (o) => { calls.spawned.push(o); report(); setTimeout(() => callbacks.data.forEach((cb) => cb(o.id, '\r\nRoun arayüz doğrulaması: ' + o.tool + '\r\n> ')), 100) }, write: (id, data) => callbacks.data.forEach((cb) => cb(id, data)), resize: () => {}, kill: (id) => { calls.killed.push(id); report() }, onData: (cb) => subscribe('data', cb), onExit: (cb) => subscribe('exit', cb) },
  usage: { limits: async () => limits, context: async () => ({ ok: true, used: 180000, window: 200000, percent: 90 }), onLimits: (cb) => subscribe('limits', cb), history: async () => ['claude', 'codex'].map((tool) => ({ tool, label: '5 saat', ratePerHour: 12, minutesLeft: 50, history: Array.from({ length: 12 }, (_, i) => ({ tool, label: '5 saat', percent: 30 + i * 3, at: now - (11 - i) * 60000, resetsAt: reset, source: 'api' })) })) },
  notifications: { state: (id, state) => { calls.reports.push({ id, state }); report() }, onActivate: (cb) => subscribe('activate', cb), onError: (cb) => subscribe('error', cb) },
  worktrees: { list: async () => [{ path: 'C:/Demo/Roun', branch: 'main', bare: false }], create: async (cwd, branch) => { if (branch.startsWith('-')) throw new Error('Geçerli bir dal adı girin.'); return { path: 'C:/Demo/worktrees/task', branch, bare: false } } },
  sessions: { list: async () => [...entries], detail: async (key) => ({ entry: entries.find((e) => e.key === key), messages: [{ role: 'user', text: 'İki ajanı yan yana çalıştır.' }, { role: 'assistant', text: 'Bölünmüş görünüm hazır. Testler tamamlandı.' }], truncated: false }), update: async (key, patch) => Object.assign(entries.find((e) => e.key === key), patch), draft: async () => '# Amaç\nİki ajanı yan yana çalıştır.\n\n# Tamamlanan işler\nBölünmüş görünüm.\n\n# Kalan görevler\nDoğrulama.', handoff: async () => '# Amaç\nİki ajanı yan yana çalıştır.\n\n# Tamamlanan işler\nBölünmüş görünüm.\n\n# Kalan görevler\nDoğrulama.' },
  pickFolder: async () => 'C:/Demo/Roun', openExternal: () => {}, reveal: () => {}, pathForFile: () => ''
}
