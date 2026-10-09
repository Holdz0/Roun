import { useState } from 'react'
import { ArrowRight, Bot, Check, FolderOpen, Route, Sparkles, SquareTerminal } from 'lucide-react'
import FeatureDialog from './FeatureDialog'
import { baseName, TOOL_NAMES, TOOLS, type Settings, type Tool } from '../types'

const TOOL_ICON = { claude: Sparkles, codex: Bot, openrouter: Route, shell: SquareTerminal }
const TOOL_DESCRIPTION: Record<Tool, string> = {
  claude: 'Anthropic ile çalışın',
  codex: 'OpenAI ile çalışın',
  openrouter: 'OmniRoute üzerinden bağlanın',
  shell: 'Bir terminal açın'
}
const CLAUDE_QUICK = [{ label: 'Devam et', value: '--continue' }, { label: 'Oturum seç', value: '--resume' }]
const QUICK_ARGS: Record<Tool, { label: string; value: string }[]> = {
  claude: CLAUDE_QUICK,
  codex: [{ label: 'Oturum seç', value: 'resume' }],
  openrouter: CLAUDE_QUICK,
  shell: []
}

interface Props {
  settings: Settings
  initialTool: Tool
  initialCwd: string
  onOpen: (tool: Tool, cwd: string, args: string) => void
  onClose: () => void
}

export default function NewTabDialog({ settings, initialTool, initialCwd, onOpen, onClose }: Props) {
  const [tool, setTool] = useState(initialTool)
  const [cwd, setCwd] = useState(initialCwd || settings.defaultCwd)
  const [argsByTool, setArgsByTool] = useState<Partial<Record<Tool, string>>>({})
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const args = argsByTool[tool] || ''
  const defaults = tool === 'claude' ? settings.claudeArgs : tool === 'codex' ? settings.codexArgs : ''
  const setArgs = (value: string): void => setArgsByTool((previous) => ({ ...previous, [tool]: value }))
  const pickFolder = async (): Promise<void> => {
    setPicking(true)
    setError('')
    try {
      const path = await window.roun.pickFolder(cwd)
      if (path) setCwd(path)
    } catch (e) { setError((e as Error).message) }
    finally { setPicking(false) }
  }

  return <FeatureDialog title="Yeni oturum" onClose={onClose} className="new-session-modal">
    <form className="new-session-form" onSubmit={(e) => { e.preventDefault(); if (!picking && cwd.trim()) onOpen(tool, cwd.trim(), tool === 'shell' ? '' : args.trim()) }}>
      <p className="muted small">Çalışmaya başlamak için aracınızı ve klasörünüzü seçin.</p>
      <fieldset className="new-session-tools">
        <legend>AI aracı</legend>
        <div className="tool-options">
          {TOOLS.map((t) => {
            const Icon = TOOL_ICON[t]
            return <button type="button" key={t} className={`tool-option ${t}${tool === t ? ' selected' : ''}`} aria-pressed={tool === t} onClick={() => setTool(t)}>
              <Icon size={20} className="tool-option-icon" />
              <span><strong>{TOOL_NAMES[t]}</strong><small>{TOOL_DESCRIPTION[t]}</small></span>
              {tool === t && <Check size={15} className="tool-option-check" />}
            </button>
          })}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="new-session-cwd">Çalışma klasörü</label>
        <div className="new-session-path">
          <input id="new-session-cwd" value={cwd} required spellCheck={false} placeholder="Klasör yolunu girin" onChange={(e) => setCwd(e.target.value)} />
          <button type="button" className="btn ghost" disabled={picking} onClick={() => void pickFolder()}><FolderOpen size={16} />{picking ? 'Seçiliyor…' : 'Gözat'}</button>
        </div>
        {settings.recentDirs.length > 0 && <div className="recent-folders" aria-label="Son klasörler">
          <span className="tiny muted">Son kullanılanlar</span>
          {settings.recentDirs.map((dir) => <button type="button" key={dir} className={'chip' + (cwd === dir ? ' on' : '')} title={dir} onClick={() => setCwd(dir)}>{baseName(dir)}</button>)}
        </div>}
      </div>
      {tool !== 'shell' && <div className="field">
        <label htmlFor="new-session-args">Ek parametreler <span className="muted">· isteğe bağlı</span></label>
        <input id="new-session-args" value={args} spellCheck={false} placeholder={tool === 'codex' ? 'Örn. --model …' : 'Örn. --model opus'} onChange={(e) => setArgs(e.target.value)} />
        {QUICK_ARGS[tool].length > 0 && <div className="quick-parameters">{QUICK_ARGS[tool].map((q) => {
          const selected = args.split(/\s+/).includes(q.value)
          return <button type="button" key={q.value} className={'chip' + (selected ? ' on' : '')} aria-pressed={selected} onClick={() => setArgs(selected ? args.split(/\s+/).filter((x) => x !== q.value).join(' ') : `${args} ${q.value}`.trim())}>{q.label}</button>
        })}</div>}
        {defaults.trim() && <small className="muted">Ayarlardaki varsayılan parametreler de eklenir: <code>{defaults}</code></small>}
      </div>}
      {error && <div className="feature-error" role="alert">{error}</div>}
      <div className="modal-foot new-session-footer">
        <button type="button" className="btn ghost" onClick={onClose}>Vazgeç</button>
        <button type="submit" className="btn primary" disabled={picking || !cwd.trim()}>Oturumu aç <ArrowRight size={16} /></button>
      </div>
    </form>
  </FeatureDialog>
}
