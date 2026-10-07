import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ChevronDown, Folder, Moon, PanelLeftClose, PanelLeftOpen, Plus, Settings as Gear, Sparkles, Sun, SquareTerminal, X } from 'lucide-react'
import TerminalView from './components/TerminalView'
import UsagePanel from './components/UsagePanel'
import SettingsDialog from './components/SettingsDialog'
import { baseName, TOOL_NAMES, type Limits, type Settings, type Tab, type Tool } from './types'

const TOOL_ICON: Record<Tool, typeof Bot> = { claude: Sparkles, codex: Bot, shell: SquareTerminal }

const QUICK_ARGS: Record<Tool, { label: string; value: string }[]> = {
  claude: [
    { label: 'Devam et', value: '--continue' },
    { label: 'Oturum seç', value: '--resume' }
  ],
  codex: [{ label: 'Oturum seç', value: 'resume' }],
  shell: []
}

let seq = 0
const newId = (): string => `t${Date.now().toString(36)}${(seq++).toString(36)}`

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('claude')
  const [cwd, setCwd] = useState('')
  const [args, setArgs] = useState('')
  const [limits, setLimits] = useState<Limits | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  const [restored, setRestored] = useState(false)
  const recentRef = useRef<HTMLDivElement>(null)

  // Başlangıç: ayarlar ve önceki çalıştırmadan kalan sekmeler
  useEffect(() => {
    Promise.all([window.roun.settings.get(), window.roun.tabs.load()]).then(([s, saved]) => {
      setSettings(s as Settings)
      setTool((s as Settings).defaultTool)
      setCwd((s as Settings).defaultCwd)
      const prev = saved as { tabs: Omit<Tab, 'exitCode' | 'run'>[]; activeId: string | null }
      const now = Date.now()
      const restoredTabs = prev.tabs.map((t) => ({ ...t, startedAt: now, exitCode: null, run: 0 }))
      setTabs(restoredTabs)
      setActiveId(restoredTabs.some((t) => t.id === prev.activeId) ? prev.activeId : (restoredTabs[0]?.id ?? null))
      setRestored(true)
    })
    window.roun.usage.limits().then((l: Limits) => setLimits(l))
    return window.roun.usage.onLimits((l) => setLimits(l as Limits))
  }, [])

  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.theme
  }, [settings?.theme])

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = (await window.roun.settings.set(patch)) as Settings
    setSettings(next)
  }, [])

  const openTab = useCallback(
    (t: Tool = tool, dir: string = cwd, extra: string = args) => {
      if (!settings) return
      const defaults = t === 'claude' ? settings.claudeArgs : t === 'codex' ? settings.codexArgs : ''
      let tabArgs = [defaults, extra].filter((x) => x.trim()).join(' ')
      // Yeni Claude oturumunun kimliğini baştan ver ki uygulama yeniden açılınca aynı oturuma dönülebilsin
      if (t === 'claude' && !/(^|\s)(-c|--continue|-r|--resume|--session-id)(\s|$)/.test(tabArgs)) {
        tabArgs = `--session-id ${crypto.randomUUID()} ${tabArgs}`.trim()
      }
      const tab: Tab = {
        id: newId(),
        tool: t,
        cwd: dir || settings.defaultCwd,
        args: tabArgs,
        startedAt: Date.now(),
        exitCode: null,
        run: 0
      }
      setTabs((p) => [...p, tab])
      setActiveId(tab.id)
      setArgs('')
      const recent = [tab.cwd, ...settings.recentDirs.filter((d) => d !== tab.cwd)].slice(0, 8)
      saveSettings({ recentDirs: recent, defaultTool: t, defaultCwd: tab.cwd })
    },
    [tool, cwd, args, settings, saveSettings]
  )

  const closeTab = useCallback(
    (id: string) => {
      const i = tabs.findIndex((t) => t.id === id)
      const next = tabs.filter((t) => t.id !== id)
      setTabs(next)
      if (activeId === id) setActiveId(next[Math.min(i, next.length - 1)]?.id ?? null)
    },
    [tabs, activeId]
  )

  const onExit = useCallback((id: string, code: number) => {
    setTabs((p) => p.map((t) => (t.id === id ? { ...t, exitCode: code } : t)))
  }, [])

  const onRestart = useCallback((id: string) => {
    setTabs((p) =>
      p.map((t) =>
        t.id === id
          ? {
              ...t,
              // Aynı --session-id ikinci kez kullanılamaz; yeniden başlatma yeni oturum açar
              args: t.args.replace(/--session-id\s+\S+/, () => `--session-id ${crypto.randomUUID()}`),
              exitCode: null,
              run: t.run + 1,
              startedAt: Date.now()
            }
          : t
      )
    )
  }, [])

  // Sekme listesini kaydet; uygulama kapanıp açılınca geri yüklenir
  useEffect(() => {
    if (!restored) return
    window.roun.tabs.save(
      tabs.map(({ id, tool, cwd, args, startedAt }) => ({ id, tool, cwd, args, startedAt })),
      activeId
    )
  }, [tabs, activeId, restored])

  const pickFolder = async (): Promise<void> => {
    const p = await window.roun.pickFolder(cwd)
    if (p) setCwd(p)
  }

  // Kısayollar
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase()
      if (e.ctrlKey && e.shiftKey && k === 't') {
        e.preventDefault()
        openTab()
      } else if (e.ctrlKey && e.shiftKey && k === 'w') {
        e.preventDefault()
        if (activeId) closeTab(activeId)
      } else if (e.ctrlKey && e.shiftKey && k === 'b') {
        e.preventDefault()
        if (settings) saveSettings({ sidebarCollapsed: !settings.sidebarCollapsed })
      } else if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        setShowSettings(true)
      } else if (e.ctrlKey && e.key === 'Tab' && tabs.length > 1) {
        e.preventDefault()
        const i = tabs.findIndex((t) => t.id === activeId)
        const n = (i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length
        setActiveId(tabs[n].id)
      } else if (e.altKey && !e.ctrlKey && /^[1-9]$/.test(e.key)) {
        const t = tabs[Number(e.key) - 1]
        if (t) {
          e.preventDefault()
          setActiveId(t.id)
        }
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [openTab, closeTab, activeId, tabs, settings, saveSettings])

  useEffect(() => {
    if (!showRecent) return
    const h = (e: MouseEvent): void => {
      if (!recentRef.current?.contains(e.target as Node)) setShowRecent(false)
    }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [showRecent])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId])

  if (!settings) return <div className="boot" />

  const collapsed = settings.sidebarCollapsed

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      {/* Üst çubuk */}
      <header className="toolbar">
        <div className="brand">
          <span className="logo">&gt;_</span>
          <span>Roun</span>
        </div>

        <div className="segmented" role="tablist">
          {(['claude', 'codex', 'shell'] as Tool[]).map((t) => {
            const Icon = TOOL_ICON[t]
            return (
              <button key={t} className={`seg ${t} ${tool === t ? 'on' : ''}`} onClick={() => setTool(t)}>
                <Icon size={14} />
                {TOOL_NAMES[t]}
              </button>
            )
          })}
        </div>

        <div className="folder" ref={recentRef}>
          <button className="folder-btn" onClick={pickFolder} title={cwd}>
            <Folder size={14} />
            <span className="folder-name">{baseName(cwd) || 'Klasör seç'}</span>
          </button>
          <button className="folder-more" onClick={() => setShowRecent((v) => !v)} title="Son klasörler">
            <ChevronDown size={14} />
          </button>
          {showRecent && (
            <div className="dropdown">
              {settings.recentDirs.length === 0 && <div className="muted small pad">Henüz yok</div>}
              {settings.recentDirs.map((d) => (
                <button
                  key={d}
                  className="dropdown-item"
                  onClick={() => {
                    setCwd(d)
                    setShowRecent(false)
                  }}
                >
                  <span className="dd-name">{baseName(d)}</span>
                  <span className="dd-path">{d}</span>
                </button>
              ))}
              <button
                className="dropdown-item"
                onClick={() => {
                  setShowRecent(false)
                  pickFolder()
                }}
              >
                <span className="dd-name">Gözat…</span>
              </button>
            </div>
          )}
        </div>

        <div className="args">
          <input
            value={args}
            placeholder={tool === 'shell' ? '' : 'ek argümanlar'}
            disabled={tool === 'shell'}
            onChange={(e) => setArgs(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && openTab()}
          />
          {QUICK_ARGS[tool].map((q) => (
            <button
              key={q.value}
              className={`chip ${args.split(' ').includes(q.value) ? 'on' : ''}`}
              onClick={() => setArgs((a) => (a.split(' ').includes(q.value) ? a.split(' ').filter((x) => x !== q.value).join(' ') : `${a} ${q.value}`.trim()))}
            >
              {q.label}
            </button>
          ))}
        </div>

        <button className="btn primary" onClick={() => openTab()} title="Yeni sekme (Ctrl+Shift+T)">
          <Plus size={15} /> Aç
        </button>

        <div className="toolbar-right">
          <button
            className="icon-btn"
            title="Tema"
            onClick={() => saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          >
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="icon-btn" title="Ayarlar (Ctrl+,)" onClick={() => setShowSettings(true)}>
            <Gear size={16} />
          </button>
        </div>
      </header>

      {/* Kenar çubuğu */}
      <aside className="sidebar">
        <div className="sidebar-top">
          {!collapsed && <span className="section-title">Sekmeler</span>}
          <button
            className="icon-btn"
            title="Kenar çubuğu (Ctrl+Shift+B)"
            onClick={() => saveSettings({ sidebarCollapsed: !collapsed })}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className="tabs">
          {tabs.map((t, i) => {
            const Icon = TOOL_ICON[t.tool]
            return (
              <div
                key={t.id}
                className={`tab ${t.id === activeId ? 'on' : ''} ${t.tool}`}
                onClick={() => setActiveId(t.id)}
                title={`${TOOL_NAMES[t.tool]} — ${t.cwd}${t.args ? ' ' + t.args : ''}`}
                onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
              >
                <Icon size={15} className="tab-icon" />
                {!collapsed && (
                  <>
                    <div className="tab-text">
                      <span className="tab-title">{baseName(t.cwd)}</span>
                      <span className="tab-sub">
                        {TOOL_NAMES[t.tool]}
                        {t.exitCode !== null ? ' · kapandı' : ''}
                      </span>
                    </div>
                    {i < 9 && <kbd>Alt+{i + 1}</kbd>}
                    <button
                      className="icon-btn tab-close"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTab(t.id)
                      }}
                    >
                      <X size={13} />
                    </button>
                  </>
                )}
                <span className={`status ${t.exitCode === null ? 'live' : 'dead'}`} />
              </div>
            )
          })}
          {tabs.length === 0 && !collapsed && <div className="muted small pad">Açık sekme yok</div>}
        </nav>

        {!collapsed && (
          <UsagePanel
            limits={limits}
            activeTab={activeTab}
            onRefresh={async () => setLimits((await window.roun.usage.limits(true)) as Limits)}
          />
        )}
      </aside>

      {/* Terminal alanı */}
      <main className="stage">
        {tabs.map((t) => (
          <TerminalView
            key={t.id}
            tab={t}
            active={t.id === activeId}
            settings={settings}
            onExit={onExit}
            onRestart={onRestart}
            onClose={closeTab}
          />
        ))}
        {tabs.length === 0 && (
          <div className="empty">
            <div className="empty-card">
              <h1>Ne ile çalışalım?</h1>
              <p className="muted">Klasör: {cwd}</p>
              <div className="empty-actions">
                {(['claude', 'codex', 'shell'] as Tool[]).map((t) => {
                  const Icon = TOOL_ICON[t]
                  return (
                    <button key={t} className={`big ${t}`} onClick={() => openTab(t)}>
                      <Icon size={22} />
                      <span>{TOOL_NAMES[t]}</span>
                    </button>
                  )
                })}
              </div>
              <div className="hints muted small">
                <span><kbd>Ctrl+Shift+T</kbd> yeni sekme</span>
                <span><kbd>Ctrl+Tab</kbd> sekme değiştir</span>
                <span><kbd>Ctrl+Shift+F</kbd> ara</span>
                <span><kbd>Shift+Enter</kbd> yeni satır</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {showSettings && <SettingsDialog settings={settings} onSave={saveSettings} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
