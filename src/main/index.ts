import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, Notification } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import icon from '../../build/icon.png?asset'
import { killAll, killPty, resizePty, spawnPty, writePty, type SpawnOptions } from './pty'
import { loadSettings, saveSettings, type Settings } from './settings'
import { finalizeTabs, loadTabs, noteSession, saveTabs, getSavedTab, setSessionRecorder, type TabInfo } from './tabs'
import { claudeHookArgs, startHookServer, type TabState } from './hooks'
import { NotificationPolicy } from './notification-policy'
import { SessionArchive, handoffDraft } from './sessions'
import { CLAUDE_DIR } from './usage/claude'
import { SESSIONS } from './usage/codex'
import { UsageHistory } from './usage/history'
import { createWorktree, listWorktrees } from './worktrees'
import { isClaudeLike } from './cli'
import { ensureOmniRoute, stopOmniRoute } from './omniroute'
import { getContext, getLimits, type LimitsResult } from './usage'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let limitTimer: NodeJS.Timeout | null = null
let reminderTimer: NodeJS.Timeout | null = null
let archive: SessionArchive
let history: UsageHistory
const notificationPolicy = new NotificationPolicy()
const notifications = new Set<Notification>()
const contextWarnings = new Map<string, boolean>()

function notify(title: string, body: string, tabId: string | null = null): void {
  if (!win || win.isDestroyed() || !Notification.isSupported()) return
  const n = new Notification({ title, body, icon, silent: false })
  notifications.add(n)
  const release = (): void => { notifications.delete(n) }
  n.on('close', release)
  n.on('failed', (_event, error) => {
    release()
    if (win && !win.isDestroyed()) win.webContents.send('notification:error', 'Masaüstü bildirimi gösterilemedi: ' + error)
  })
  n.on('click', () => {
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show(); win.focus()
    win.webContents.send('notification:activate', tabId)
    release()
  })
  n.show()
  // Windows close olayı her zaman gelmez; son bildirimleri bellekte tut.
  if (notifications.size > 100) notifications.delete(notifications.values().next().value!)
}
function reportState(id: string, state: TabState): void {
  if (!['working', 'waiting', 'done', 'error'].includes(state)) return
  const tab = getSavedTab(id)
  if (!tab || tab.tool === 'shell') return
  if (!notificationPolicy.transition(id, state, loadSettings())) return
  const names = { working: 'Çalışıyor', waiting: 'Yanıtınız bekleniyor', done: 'Görev tamamlandı', error: 'Ajan hatası' }
  notify(names[state], tab.tool + ' · ' + tab.cwd, id)
}
function trackLimits(limits: { claude: LimitsResult; codex: LimitsResult }): void {
  const settings = loadSettings()
  const alerts = [...history.resetAlerts(settings), ...history.record(limits, settings)]
  for (const alert of alerts) if (notificationPolicy.allow(alert.key, settings)) notify(alert.title, alert.body)
}

function createWindow(): void {
  const s = loadSettings()
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: s.theme === 'light' ? '#f6f6f4' : '#16161a',
    icon,
    autoHideMenuBar: true,
    title: 'Roun',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools()
  })
  // Sekmeler kapanmadan önce oturum kimlikleri kaydedilsin
  win.on('close', () => finalizeTabs())
  win.on('closed', () => {
    killAll()
    win = null
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

function trayText(l: { claude: LimitsResult; codex: LimitsResult }): string {
  const fmt = (name: string, r: LimitsResult): string =>
    r.ok && r.windows.length ? `${name}: ` + r.windows.slice(0, 2).map((w) => `${w.label} %${Math.round(w.percent)}`).join(' · ') : `${name}: —`
  return `Roun\n${fmt('Claude', l.claude)}\n${fmt('Codex', l.codex)}`
}

async function refreshLimits(force = false): Promise<void> {
  const s = loadSettings()
  const l = await getLimits(s.refreshSeconds * 1000, force)
  trackLimits(l)
  tray?.setToolTip(trayText(l))
  if (win && !win.isDestroyed()) win.webContents.send('usage:limits', l)
}

function scheduleLimits(): void {
  if (limitTimer) clearInterval(limitTimer)
  const s = loadSettings()
  limitTimer = setInterval(() => refreshLimits(), Math.max(30, s.refreshSeconds) * 1000)
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('Roun')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Göster', click: () => (win ? win.show() : createWindow()) },
      { label: 'Limitleri yenile', click: () => refreshLimits(true) },
      { type: 'separator' },
      { label: 'Çıkış', click: () => app.quit() }
    ])
  )
  tray.on('click', () => (win ? (win.isVisible() ? win.focus() : win.show()) : createWindow()))
}

function registerIpc(): void {
  // OmniRoute beklenirken kapatılan sekmeler sonradan açılmasın
  const starting = new Set<string>()
  ipcMain.on('pty:spawn', async (e, o: SpawnOptions) => {
    const cwd = existsSync(o.cwd) ? o.cwd : app.getPath('home')
    // Claude'a durum bildiren hook ayarlarını ekle
    const args = isClaudeLike(o.tool) ? [claudeHookArgs(), o.args].filter(Boolean).join(' ') : o.args
    if (o.tool !== 'openrouter') return spawnPty(e.sender, { ...o, cwd, args })

    const wc = e.sender
    const startup = loadSettings().openrouterStartup
    starting.add(o.id)
    wc.send('pty:data', o.id, '\x1b[2mOmniRoute başlatılıyor…\x1b[0m\r\n')
    const r = await ensureOmniRoute(startup, (sec) => {
      if (starting.has(o.id) && !wc.isDestroyed())
        wc.send('pty:data', o.id, `\x1b[2mOmniRoute hâlâ açılıyor… (${sec} sn)\x1b[0m\r\n`)
    })
    if (!starting.delete(o.id) || wc.isDestroyed()) return
    if (!r.ok) {
      wc.send('pty:data', o.id, `\x1b[31m${r.error}\x1b[0m\r\n`)
      wc.send('pty:exit', o.id, 1)
      return
    }
    spawnPty(wc, { ...o, cwd, args, startup })
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => writePty(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => resizePty(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => {
    starting.delete(id)
    notificationPolicy.forget(id)
    contextWarnings.delete(id)
    killPty(id)
  })

  ipcMain.handle('usage:limits', async (_e, force?: boolean) => {
    const s = loadSettings()
    const l = await getLimits(s.refreshSeconds * 1000, !!force)
    trackLimits(l)
    tray?.setToolTip(trayText(l))
    return l
  })
  ipcMain.handle('usage:context', (_e, tool: string, cwd: string, since: number, args: string, tabId?: string) => {
    const tab = tabId ? getSavedTab(tabId) : undefined
    const context = getContext(tab?.tool || tool, tab?.cwd || cwd, tab?.startedAt || since, tab?.args || args, tab?.sessionId)
    const settings = loadSettings()
    if (context?.ok && tabId) {
      const above = context.percent >= settings.contextAlertPercent
      if (above && !contextWarnings.get(tabId) && settings.usageAlerts && notificationPolicy.allow('context:' + tabId, settings))
        notify('Bağlam doluluğu uyarısı', 'Aktif oturum bağlamı %' + Math.round(context.percent) + ' dolu. Devam etmeden önce görev devri hazırlayabilirsiniz.', tabId)
      contextWarnings.set(tabId, above)
    }
    return context
  })
  ipcMain.handle('usage:history', () => history.insights())
  ipcMain.on('notification:state', (_e, id: string, state: TabState) => reportState(id, state))
  ipcMain.handle('worktrees:list', (_e, cwd: string) => listWorktrees(cwd))
  ipcMain.handle('worktrees:create', (_e, cwd: string, branch: string) => createWorktree(cwd, branch, join(app.getPath('userData'), 'worktrees')))
  ipcMain.handle('sessions:list', () => archive.list())
  ipcMain.handle('sessions:draft', async (_e, key: string) => handoffDraft(await archive.detail(key)))
  ipcMain.handle('sessions:detail', (_e, key: string) => archive.detail(key))
  ipcMain.handle('sessions:update', (_e, key: string, patch: { title?: string; pinned?: boolean }) => archive.update(key, patch))
  ipcMain.handle('sessions:handoff', async (_e, tabId: string) => {
    const tab = getSavedTab(tabId)
    if (!tab?.sessionId || tab.tool === 'shell') throw new Error('Oturum henüz bulunamadı. İlk yanıtın ardından tekrar deneyin.')
    await archive.remember(tab.sessionId, tab.tool, tab.cwd)
    const key = (tab.tool === 'codex' ? 'codex:' : 'claude:') + tab.sessionId
    return handoffDraft(await archive.detail(key))
  })

  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const next = saveSettings(patch)
    if (patch.refreshSeconds) scheduleLimits()
    return next
  })

  ipcMain.handle('tabs:session', (_e, id: string) => getSavedTab(id)?.sessionId || null)
  ipcMain.handle('tabs:load', () => loadTabs())
  ipcMain.on('tabs:save', (_e, tabs: TabInfo[], activeId: string | null) => saveTabs(tabs, activeId))

  ipcMain.handle('dialog:folder', async (_e, current?: string) => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      defaultPath: current && existsSync(current) ? current : undefined
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.on('shell:open', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })
  ipcMain.on('shell:reveal', (_e, p: string) => {
    if (existsSync(p)) shell.openPath(p)
  })
}

// İkinci kez açılırsa mevcut pencereyi öne getir
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.tahaefe.roun')
  Menu.setApplicationMenu(null)
  archive = new SessionArchive(app.getPath('userData'), join(CLAUDE_DIR, 'projects'), SESSIONS)
  history = new UsageHistory(join(app.getPath('userData'), 'usage-history.json'))
  setSessionRecorder((id, tool, cwd) => { void archive.remember(id, tool, cwd).catch(() => {}) })
  registerIpc()
  reminderTimer = setInterval(() => {
    const settings = loadSettings()
    for (const alert of history.resetAlerts(settings)) if (notificationPolicy.allow(alert.key, settings)) notify(alert.title, alert.body)
  }, 30000)
  startHookServer((tabId, state, sessionId) => {
    if (sessionId) noteSession(tabId, sessionId)
    reportState(tabId, state)
    if (win && !win.isDestroyed()) win.webContents.send('tab:state', tabId, state)
  })
  createWindow()
  createTray()
  refreshLimits()
  scheduleLimits()
})

app.on('window-all-closed', () => {
  killAll()
  app.quit()
})

// Roun'un başlattığı OmniRoute uygulamayla birlikte kapansın
app.on('will-quit', () => {
  if (limitTimer) clearInterval(limitTimer)
  if (reminderTimer) clearInterval(reminderTimer)
  stopOmniRoute()
})
