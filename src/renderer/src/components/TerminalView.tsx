import { useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { RotateCw, Search, X } from 'lucide-react'
import type { Settings, Tab } from '../types'

const DARK: ITheme = {
  background: '#16161a',
  foreground: '#e4e4e7',
  cursor: '#e88054',
  cursorAccent: '#16161a',
  selectionBackground: '#e8805455',
  black: '#1e1e24', red: '#f87171', green: '#86efac', yellow: '#fcd34d',
  blue: '#93c5fd', magenta: '#d8b4fe', cyan: '#67e8f9', white: '#e4e4e7',
  brightBlack: '#71717a', brightRed: '#fca5a5', brightGreen: '#bbf7d0', brightYellow: '#fde68a',
  brightBlue: '#bfdbfe', brightMagenta: '#e9d5ff', brightCyan: '#a5f3fc', brightWhite: '#fafafa'
}

const LIGHT: ITheme = {
  background: '#fbfbfa',
  foreground: '#27272a',
  cursor: '#c2410c',
  cursorAccent: '#fbfbfa',
  selectionBackground: '#c2410c33',
  black: '#27272a', red: '#b91c1c', green: '#15803d', yellow: '#a16207',
  blue: '#1d4ed8', magenta: '#7e22ce', cyan: '#0e7490', white: '#d4d4d8',
  brightBlack: '#71717a', brightRed: '#dc2626', brightGreen: '#16a34a', brightYellow: '#ca8a04',
  brightBlue: '#2563eb', brightMagenta: '#9333ea', brightCyan: '#0891b2', brightWhite: '#52525b'
}

interface Props {
  tab: Tab
  active: boolean
  settings: Settings
  onExit: (id: string, code: number) => void
  onRestart: (id: string) => void
  onClose: (id: string) => void
}

/** Yollarda boşluk varsa tırnak içine alır. */
const quotePath = (p: string): string => (/\s/.test(p) ? `"${p}"` : p)

export default function TerminalView({ tab, active, settings, onExit, onRestart, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const search = useRef<SearchAddon | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)

  // Terminal örneğini bir kez oluştur
  useEffect(() => {
    const t = new Terminal({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: 1.15,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 20000,
      theme: settings.theme === 'light' ? LIGHT : DARK,
      windowsPty: { backend: 'conpty' },
      macOptionIsMeta: true
    })
    const f = new FitAddon()
    const s = new SearchAddon()
    t.loadAddon(f)
    t.loadAddon(s)
    t.loadAddon(new WebLinksAddon((_e, uri) => window.roun.openExternal(uri)))
    const u = new Unicode11Addon()
    t.loadAddon(u)
    t.unicode.activeVersion = '11'
    t.open(host.current!)
    try {
      const gl = new WebglAddon()
      gl.onContextLoss(() => gl.dispose())
      t.loadAddon(gl)
    } catch {
      /* WebGL yoksa DOM renderer kullanılır */
    }

    t.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const k = e.key.toLowerCase()
      // Uygulama kısayolları terminale gitmesin (App dinliyor)
      if (e.ctrlKey && e.shiftKey && ['t', 'w', 'b', 'f'].includes(k)) {
        if (k === 'f') {
          setSearchOpen(true)
          setTimeout(() => searchInput.current?.focus(), 0)
        }
        e.preventDefault()
        return false
      }
      if (e.ctrlKey && (e.key === 'Tab' || e.key === ',')) return false
      if (e.altKey && !e.ctrlKey && /^[1-9]$/.test(e.key)) return false
      // Seçim varken Ctrl+C kopyalar, yoksa SIGINT gönderir
      if (e.ctrlKey && !e.shiftKey && k === 'c' && t.hasSelection()) {
        navigator.clipboard.writeText(t.getSelection())
        t.clearSelection()
        e.preventDefault()
        return false
      }
      if (e.ctrlKey && e.shiftKey && k === 'c') {
        if (t.hasSelection()) navigator.clipboard.writeText(t.getSelection())
        e.preventDefault()
        return false
      }
      // Ctrl+V: metin varsa yapıştır; yoksa (ör. görsel) tuşu CLI'ya ilet ki kendisi okusun
      if (e.ctrlKey && k === 'v') {
        e.preventDefault()
        navigator.clipboard
          .readText()
          .then((text) => (text ? t.paste(text) : window.roun.pty.write(tab.id, '\x16')))
          .catch(() => window.roun.pty.write(tab.id, '\x16'))
        return false
      }
      // Shift+Enter: Claude/Codex'te alt satıra geç
      if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'Enter') {
        e.preventDefault()
        window.roun.pty.write(tab.id, '\x1b\r')
        return false
      }
      return true
    })

    t.onData((d) => window.roun.pty.write(tab.id, d))
    t.onResize(({ cols, rows }) => window.roun.pty.resize(tab.id, cols, rows))

    term.current = t
    fit.current = f
    search.current = s

    const offData = window.roun.pty.onData((id, data) => {
      if (id === tab.id) t.write(data)
    })
    const offExit = window.roun.pty.onExit((id, code) => {
      if (id === tab.id) onExit(id, code)
    })

    const ro = new ResizeObserver(() => {
      if (host.current && host.current.offsetWidth > 0) {
        try {
          f.fit()
        } catch {
          /* gizliyken ölçülemez */
        }
      }
    })
    ro.observe(host.current!)

    return () => {
      ro.disconnect()
      offData()
      offExit()
      window.roun.pty.kill(tab.id)
      t.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Süreci başlat / yeniden başlat
  useEffect(() => {
    const t = term.current!
    if (tab.run > 0) {
      t.reset()
    }
    try {
      fit.current?.fit()
    } catch {
      /* yok say */
    }
    window.roun.pty.spawn({ id: tab.id, tool: tab.tool, cwd: tab.cwd, args: tab.args, cols: t.cols, rows: t.rows })
  }, [tab.run, tab.id, tab.tool, tab.cwd, tab.args])

  // Ayar değişiklikleri
  useEffect(() => {
    const t = term.current
    if (!t) return
    t.options.fontFamily = settings.fontFamily
    t.options.fontSize = settings.fontSize
    t.options.theme = settings.theme === 'light' ? LIGHT : DARK
    try {
      fit.current?.fit()
    } catch {
      /* yok say */
    }
  }, [settings.fontFamily, settings.fontSize, settings.theme])

  // Görünür olunca boyutla ve odakla
  useEffect(() => {
    if (!active) return
    requestAnimationFrame(() => {
      try {
        fit.current?.fit()
      } catch {
        /* yok say */
      }
      term.current?.focus()
    })
  }, [active])

  const runSearch = (dir: 'next' | 'prev'): void => {
    if (!query) return
    const opts = { decorations: { matchOverviewRuler: '#e88054', activeMatchColorOverviewRuler: '#e88054', activeMatchBackground: '#e8805488', matchBackground: '#e8805433' } }
    if (dir === 'next') search.current?.findNext(query, opts)
    else search.current?.findPrevious(query, opts)
  }

  return (
    <div
      className={`term-wrap ${active ? '' : 'hidden'} ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const paths = [...e.dataTransfer.files].map((f) => quotePath(window.roun.pathForFile(f))).filter(Boolean)
        if (paths.length) {
          term.current?.paste(paths.join(' ') + ' ')
          term.current?.focus()
        }
      }}
    >
      <div className="term-host" ref={host} />

      {searchOpen && (
        <div className="term-search">
          <Search size={14} />
          <input
            ref={searchInput}
            value={query}
            placeholder="Terminalde ara"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(e.shiftKey ? 'prev' : 'next')
              if (e.key === 'Escape') {
                setSearchOpen(false)
                search.current?.clearDecorations()
                term.current?.focus()
              }
            }}
          />
          <button
            className="icon-btn"
            title="Kapat (Esc)"
            onClick={() => {
              setSearchOpen(false)
              search.current?.clearDecorations()
              term.current?.focus()
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {tab.exitCode !== null && (
        <div className="term-exit">
          <span>Süreç sonlandı (kod {tab.exitCode})</span>
          <button className="btn" onClick={() => onRestart(tab.id)}>
            <RotateCw size={14} /> Yeniden başlat
          </button>
          <button className="btn ghost" onClick={() => onClose(tab.id)}>
            Sekmeyi kapat
          </button>
        </div>
      )}
    </div>
  )
}
