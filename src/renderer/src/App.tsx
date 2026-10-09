import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Moon, PanelLeftClose, PanelLeftOpen, Plus, Route, Settings as Gear, Sparkles, Sun, SquareTerminal, X, Columns2, GitBranch, History, ArrowRightLeft, BellOff } from 'lucide-react'
import TerminalView from './components/TerminalView'
import UsagePanel from './components/UsagePanel'
import SettingsDialog from './components/SettingsDialog'
import WorktreeDialog from './components/WorktreeDialog'
import SessionLibrary from './components/SessionLibrary'
import HandoffDialog from './components/HandoffDialog'
import NewTabDialog from './components/NewTabDialog'
import { useUsageContext } from './useUsageContext'
import { baseName, isClaudeLike, STATE_NAMES, TOOL_NAMES, TOOLS, type Limits, type Settings, type Tab, type TabState, type Tool, type SessionEntry } from './types'

const TOOL_ICON: Record<Tool, typeof Bot> = { claude: Sparkles, codex: Bot, openrouter: Route, shell: SquareTerminal }

let seq = 0
const newId = (): string => `t${Date.now().toString(36)}${(seq++).toString(36)}`

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('claude')
  const [cwd, setCwd] = useState('')
  const [limits, setLimits] = useState<Limits | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [newTab, setNewTab] = useState<{ tool: Tool; cwd: string; beside: boolean } | null>(null)
  const [restored, setRestored] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [leftId, setLeftId] = useState<string | null>(null)
  const [rightId, setRightId] = useState<string | null>(null)
  const [showWorktrees, setShowWorktrees] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [handoff, setHandoff] = useState<{ cwd: string; tool: Tool; load: () => Promise<string> } | null>(null)
  const [notice, setNotice] = useState('')

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
      setLeftId(restoredTabs.some((t) => t.id === prev.activeId) ? prev.activeId : (restoredTabs[0]?.id ?? null))
      setRestored(true)
    })
    window.roun.usage.limits().then((l: Limits) => setLimits(l))
    return window.roun.usage.onLimits((l) => setLimits(l as Limits))
  }, [])

  // Claude hook'larından gelen konuşma durumları
  const onState = useCallback((id: string, state: TabState, confirmed = true) => {
    if (confirmed) window.roun.notifications.state(id, state)
    setTabs((p) => p.map((t) => (t.id === id && t.exitCode === null && t.state !== state ? { ...t, state } : t)))
  }, [])
  useEffect(() => window.roun.tabs.onState((id, state) => onState(id, state as TabState)), [onState])

  /** Sürüklenen sekmeyi üzerine gelinen sekmenin yerine taşır. */
  const moveTab = useCallback((from: string, to: string) => {
    if (from === to) return
    setTabs((p) => {
      const i = p.findIndex((t) => t.id === from)
      const j = p.findIndex((t) => t.id === to)
      if (i < 0 || j < 0) return p
      const next = [...p]
      next.splice(j, 0, next.splice(i, 1)[0])
      return next
    })
  }, [])

  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.theme
  }, [settings?.theme])

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = (await window.roun.settings.set(patch)) as Settings
    setSettings(next)
  }, [])

  const openTab = useCallback(
    (t: Tool = tool, dir: string = cwd, extra = '', beside = false, skipDefaults = false) => {
      if (!settings) return
      const defaults = skipDefaults ? '' : t === 'claude' ? settings.claudeArgs : t === 'codex' ? settings.codexArgs : ''
      let tabArgs = [defaults, extra].filter((x) => x.trim()).join(' ')
      // Yeni Claude oturumunun kimliğini baştan ver ki uygulama yeniden açılınca aynı oturuma dönülebilsin
      if (isClaudeLike(t) && !/(^|\s)(-c|--continue|-r|--resume|--session-id)(\s|$)/.test(tabArgs)) {
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
      if ((beside && leftId) || (rightId && activeId === rightId)) setRightId(tab.id)
      else setLeftId(tab.id)
      setActiveId(tab.id)
      setTool(t)
      setCwd(tab.cwd)
      const recent = [tab.cwd, ...settings.recentDirs.filter((d) => d !== tab.cwd)].slice(0, 8)
      saveSettings({ recentDirs: recent, defaultTool: t, defaultCwd: tab.cwd })
      return tab.id
    },
    [tool, cwd, settings, saveSettings, leftId, rightId, activeId]
  )

  const openNew = useCallback((t: Tool = tool, dir: string = cwd, beside = false) => {
    setNewTab({ tool: t, cwd: dir, beside })
  }, [tool, cwd])

  const selectTab = useCallback((id: string) => {
    if (id !== leftId && id !== rightId) {
      if (rightId && activeId === rightId) setRightId(id)
      else setLeftId(id)
    }
    setActiveId(id)
  }, [leftId, rightId, activeId])
  useEffect(() => window.roun.notifications.onActivate((id) => {
    if (id && tabs.some((t) => t.id === id)) selectTab(id)
    else if (id) setNotice('Bu bildirimin sekmesi kapatılmış. Oturumu arşivden açabilirsiniz.')
    else saveSettings({ sidebarCollapsed: false })
  }), [tabs, selectTab, saveSettings])
  useEffect(() => window.roun.notifications.onError(setNotice), [])
  const resumeEntry = (entry: SessionEntry): void => {
    void (async () => {
      try {
        const candidates = tabs.filter((t) => t.tool === entry.tool && t.exitCode === null)
        const sessions = await Promise.all(candidates.map(async (t) => ({ tab: t, id: await window.roun.tabs.session(t.id) })))
        const existing = sessions.find((s) => s.id === entry.id || s.tab.args.includes(entry.id))?.tab
        if (existing) selectTab(existing.id)
        else openTab(entry.tool, entry.cwd, (entry.tool === 'codex' ? 'resume ' : '--resume ') + entry.id, false, true)
      } catch (e) { setNotice((e as Error).message) }
    })()
  }
  const prepareHandoff = (entry?: SessionEntry): void => {
    const source = entry || tabs.find((t) => t.id === activeId)
    if (!source || source.tool === 'shell') return
    setShowLibrary(false)
    setHandoff({ cwd: source.cwd, tool: source.tool, load: entry ? () => window.roun.sessions.draft(entry.key) : () => window.roun.sessions.handoff((source as Tab).id) })
  }

  const closeTab = useCallback(
    (id: string) => {
      const i = tabs.findIndex((t) => t.id === id)
      const next = tabs.filter((t) => t.id !== id)
      setTabs(next)
      if (id === rightId) setRightId(null)
      if (id === leftId) { setLeftId(rightId && rightId !== id ? rightId : (next[0]?.id ?? null)); setRightId(null) }
      if (activeId === id) setActiveId(id === leftId ? (rightId || next[0]?.id || null) : id === rightId ? (leftId || next[0]?.id || null) : (next[Math.min(i, next.length - 1)]?.id ?? null))
    },
    [tabs, activeId, leftId, rightId]
  )

  const onExit = useCallback((id: string, code: number) => {
    if (code !== 0) window.roun.notifications.state(id, 'error')
    setTabs((p) => p.map((t) => (t.id === id ? { ...t, exitCode: code, state: code !== 0 ? 'error' : undefined } : t)))
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
              state: undefined,
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

  // Kısayollar
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (showSettings || showWorktrees || showLibrary || handoff || newTab) return
      const k = e.key.toLowerCase()
      if (e.ctrlKey && e.shiftKey && k === 't') {
        e.preventDefault()
        openNew()
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
        selectTab(tabs[n].id)
      } else if (e.altKey && !e.ctrlKey && /^[1-9]$/.test(e.key)) {
        const t = tabs[Number(e.key) - 1]
        if (t) {
          e.preventDefault()
          selectTab(t.id)
        }
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [openNew, closeTab, activeId, tabs, settings, saveSettings, selectTab, showSettings, showWorktrees, showLibrary, handoff, newTab])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId])

  const { context, error: contextError } = useUsageContext(activeTab)

  if (!settings) return <div className="boot" />

  const collapsed = settings.sidebarCollapsed
  const left = tabs.some((t) => t.id === leftId) ? leftId : (tabs[0]?.id ?? null)
  const right = rightId && rightId !== left && tabs.some((t) => t.id === rightId) ? rightId : null

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      {/* Üst çubuk */}
      <header className="toolbar">
        <div className="brand">
          <span className="logo">&gt;_</span>
          <span>Roun</span>
        </div>

        <div className="toolbar-right">
          <button
            className="icon-btn"
            title={settings.theme === 'dark' ? 'Açık tema' : 'Gece modu'}
            aria-label={settings.theme === 'dark' ? 'Açık tema' : 'Gece modu'}
            onClick={() => saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          >
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="icon-btn" title="Ayarlar (Ctrl+,)" aria-label="Ayarlar" onClick={() => setShowSettings(true)}>
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

        <div className="sidebar-actions">
          <button className="btn primary new-tab-button" onClick={() => openNew()} title="Yeni oturum (Ctrl+Shift+T)" aria-label="Yeni oturum">
            <Plus size={17} />{!collapsed && <><span>Yeni</span><kbd>Ctrl+Shift+T</kbd></>}
          </button>
        </div>

        <nav className="tabs">
          {tabs.map((t, i) => {
            const Icon = TOOL_ICON[t.tool]
            const status = t.state ?? (t.exitCode === null ? 'live' : 'dead')
            return (
              <div
                key={t.id}
                className={`tab ${t.id === activeId ? 'on' : ''} ${t.tool} ${dragId === t.id ? 'dragging' : ''}`}
                onClick={() => selectTab(t.id)}
                title={`${TOOL_NAMES[t.tool]} — ${t.cwd}${t.args ? ' ' + t.args : ''}`}
                onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('application/x-roun-tab', t.id)
                  setDragId(t.id)
                }}
                onDragOver={(e) => {
                  if (!dragId) return
                  e.preventDefault()
                  moveTab(dragId, t.id)
                }}
                onDrop={(e) => e.preventDefault()}
                onDragEnd={() => setDragId(null)}
              >
                <Icon size={15} className="tab-icon" />
                {!collapsed && (
                  <>
                    <div className="tab-text">
                      <span className="tab-title">{baseName(t.cwd)}</span>
                      <span className="tab-sub">
                        {TOOL_NAMES[t.tool]}
                        {t.state ? ` · ${STATE_NAMES[t.state]}` : t.exitCode !== null ? ' · kapandı' : ''}
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
                <span className={`status ${status}`} title={t.state ? STATE_NAMES[t.state] : undefined} />
              </div>
            )
          })}
          {tabs.length === 0 && !collapsed && <div className="muted small pad">Açık sekme yok</div>}
        </nav>

        <div className="sidebar-utilities">
          <button className={collapsed ? 'icon-btn' : 'btn ghost archive-button'} title="Oturum arşivi" aria-label="Oturum arşivi" onClick={() => setShowLibrary(true)}><History size={16} />{!collapsed && <span>Oturum arşivi</span>}</button>
          <button className="icon-btn" title={settings.quietMode ? 'Sessiz modu kapat' : 'Sessiz mod'} aria-label="Sessiz mod" aria-pressed={settings.quietMode} onClick={() => saveSettings({ quietMode: !settings.quietMode })}><BellOff size={16} /></button>
        </div>

        {!collapsed && (
          <UsagePanel
            limits={limits}
            activeTab={activeTab}
            settings={settings}
            context={context}
            contextError={contextError}
            onRefresh={async () => setLimits((await window.roun.usage.limits(true)) as Limits)}
          />
        )}
      </aside>

      {/* Terminal alanı */}
      <main className="stage">
        <div className="workspace-toolbar">
          <button className={'btn ghost' + (right ? ' selected' : '')} disabled={tabs.length < 2} title="İki açık sekmeyi yan yana göster" onClick={() => {
            if (right) { setLeftId(activeId); setRightId(null) }
            else setRightId(tabs.find((t) => t.id !== left)?.id ?? null)
          }}><Columns2 size={14} /> Yan yana</button>
          {right && <select aria-label="Sağ panel oturumu" value={right} onChange={(e) => { setRightId(e.target.value); setActiveId(e.target.value) }}>{tabs.filter((t) => t.id !== left).map((t) => <option key={t.id} value={t.id}>{TOOL_NAMES[t.tool]} · {baseName(t.cwd)}</option>)}</select>}
          <button className="btn ghost" onClick={() => setShowWorktrees(true)}><GitBranch size={14} /> Worktree ile aç</button>
          <button className="btn ghost" disabled={!activeTab || activeTab.tool === 'shell'} onClick={() => prepareHandoff()}><ArrowRightLeft size={14} /> Görevi devret</button>
        </div>
        {notice && <div className="notice" role="status"><span>{notice}</span><button className="icon-btn" aria-label="Mesajı kapat" onClick={() => setNotice('')}><X size={14} /></button></div>}
        <div className="terminal-grid">
        {tabs.map((t) => (
          <section key={t.id} className={'terminal-pane ' + (t.id === left ? (right ? 'pane-left' : 'pane-full') : t.id === right ? 'pane-right' : 'pane-hidden') + (t.id === activeId ? ' focused' : '')} onFocusCapture={() => selectTab(t.id)}>
            <button className="pane-heading" onClick={() => selectTab(t.id)} title={t.cwd}><span>{TOOL_NAMES[t.tool]} · {baseName(t.cwd)}</span><span className="muted tiny">{t.state ? STATE_NAMES[t.state] : t.exitCode !== null ? 'kapandı' : 'hazır'}</span></button>
            <div className="pane-terminal"><TerminalView
              tab={t}
              active={t.id === left || t.id === right}
              focused={t.id === activeId}
              settings={settings}
              onExit={onExit}
              onRestart={onRestart}
              onClose={closeTab}
              onState={onState}
            /></div>
          </section>
        ))}
        {tabs.length === 0 && (
          <div className="empty">
            <div className="empty-card">
              <h1>Ne ile çalışalım?</h1>
              <p className="muted">Bir araç seçin, çalışma klasörünü ve parametreleri belirleyin.</p>
              <div className="empty-actions">
                {TOOLS.map((t) => {
                  const Icon = TOOL_ICON[t]
                  return (
                    <button key={t} className={`big ${t}`} onClick={() => openNew(t)}>
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
        </div>
      </main>

      {newTab && <NewTabDialog settings={settings} initialTool={newTab.tool} initialCwd={newTab.cwd} onOpen={(t, dir, extra) => { openTab(t, dir, extra, newTab.beside); setNewTab(null) }} onClose={() => setNewTab(null)} />}
      {showWorktrees && <WorktreeDialog cwd={cwd || settings.defaultCwd} tool={tool} onOpen={(dir) => openNew(tool, dir, true)} onClose={() => setShowWorktrees(false)} />}
      {showLibrary && <SessionLibrary onResume={resumeEntry} onHandoff={(entry) => prepareHandoff(entry)} onClose={() => setShowLibrary(false)} />}
      {handoff && <HandoffDialog source={handoff} load={handoff.load} onTransfer={(target, dir) => { openTab(target, dir, '', true); setNotice('Devir metni kopyalandı. Yeni oturumda Ctrl+V ile yapıştırıp gönderin.') }} onClose={() => setHandoff(null)} />}
      {showSettings && <SettingsDialog settings={settings} onSave={saveSettings} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
