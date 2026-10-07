import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import icon from '../../build/icon.png?asset'
import { killAll, killPty, resizePty, spawnPty, writePty, type SpawnOptions } from './pty'
import { loadSettings, saveSettings, type Settings } from './settings'
import { finalizeTabs, loadTabs, saveTabs, type TabInfo } from './tabs'
import { getContext, getLimits, type LimitsResult } from './usage'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let limitTimer: NodeJS.Timeout | null = null

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
  ipcMain.on('pty:spawn', (e, o: SpawnOptions) => {
    const cwd = existsSync(o.cwd) ? o.cwd : app.getPath('home')
    spawnPty(e.sender, { ...o, cwd })
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => writePty(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => resizePty(id, cols, rows))
  ipcMain.on('pty:kill', (_e, id: string) => killPty(id))

  ipcMain.handle('usage:limits', async (_e, force?: boolean) => {
    const s = loadSettings()
    const l = await getLimits(s.refreshSeconds * 1000, !!force)
    tray?.setToolTip(trayText(l))
    return l
  })
  ipcMain.handle('usage:context', (_e, tool: string, cwd: string, since: number, args: string) =>
    getContext(tool, cwd, since, args)
  )

  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const next = saveSettings(patch)
    if (patch.refreshSeconds) scheduleLimits()
    return next
  })

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
  registerIpc()
  createWindow()
  createTray()
  refreshLimits()
  scheduleLimits()
})

app.on('window-all-closed', () => {
  killAll()
  app.quit()
})
