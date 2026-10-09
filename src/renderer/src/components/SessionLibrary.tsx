import { useEffect, useMemo, useRef, useState } from 'react'
import { Pin, RefreshCw } from 'lucide-react'
import FeatureDialog from './FeatureDialog'
import { TOOL_NAMES, baseName, type SessionEntry, type SessionDetail } from '../types'
export default function SessionLibrary({ onResume, onHandoff, onClose }: { onResume: (entry: SessionEntry) => void; onHandoff: (entry: SessionEntry) => void; onClose: () => void }) {
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [query, setQuery] = useState('')
  const [tool, setTool] = useState('')
  const [project, setProject] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pinned, setPinned] = useState(false)
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = async (): Promise<void> => {
    const request = ++generation.current
    setBusy(true); setError('')
    try { const result = await window.roun.sessions.list(); if (request === generation.current) setEntries(result) }
    catch (e) { if (request === generation.current) setError((e as Error).message) }
    finally { if (request === generation.current) setBusy(false) }
  }
  useEffect(() => { void refresh(); return () => { generation.current++ } }, [])
  const projects = useMemo(() => [...new Set(entries.map((e) => e.cwd))].sort(), [entries])
  const filtered = entries.filter((e) => (!tool || e.tool === tool) && (!project || e.cwd === project) && (!pinned || e.pinned)
    && (!from || e.updatedAt >= new Date(from + 'T00:00:00').getTime()) && (!to || e.updatedAt <= new Date(to + 'T23:59:59.999').getTime())
    && [e.title, e.cwd, e.preview, e.id].join(' ').toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')))
  useEffect(() => {
    let alive = true
    setDetail(null)
    if (selected) window.roun.sessions.detail(selected).then((d: SessionDetail) => { if (alive) { setDetail(d); setTitle(d.entry.title) } }).catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [selected, entries])
  const update = async (entry: SessionEntry, patch: { title?: string; pinned?: boolean }): Promise<void> => {
    setBusy(true); setError('')
    try { await window.roun.sessions.update(entry.key, patch); await refresh() }
    catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return <FeatureDialog title="Oturum arşivi" wide onClose={onClose}>
    <div className="library-filters">
      <input aria-label="Oturum ara" placeholder="Ad, proje veya son istekte ara…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <select aria-label="Araç filtresi" value={tool} onChange={(e) => setTool(e.target.value)}><option value="">Tüm araçlar</option>{(['claude', 'codex', 'openrouter'] as const).map((t) => <option key={t} value={t}>{TOOL_NAMES[t]}</option>)}</select>
      <select aria-label="Proje filtresi" value={project} onChange={(e) => setProject(e.target.value)}><option value="">Tüm projeler</option>{projects.map((p) => <option key={p} value={p}>{baseName(p)} · {p}</option>)}</select>
      <label className="inline-field">Başlangıç<input aria-label="Başlangıç tarihi" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="inline-field">Bitiş<input aria-label="Bitiş tarihi" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label className="inline-field"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Sabitlenenler</label>
      <button className="btn ghost" disabled={busy} onClick={() => void refresh()}><RefreshCw size={14} /> Yenile</button>
    </div>
    {error && <div className="feature-error" role="alert">{error}</div>}
    <div className="library-body">
      <div className="session-list">
        {busy && <div className="muted small pad">Yükleniyor…</div>}
        {!busy && !filtered.length && <div className="muted small pad">Eşleşen oturum yok.</div>}
        {filtered.map((e) => <div key={e.key} className={'session-card' + (selected === e.key ? ' selected' : '')}>
          <button className="session-select" onClick={() => setSelected(e.key)}><strong>{e.title}</strong><span>{TOOL_NAMES[e.tool]} · {baseName(e.cwd)}</span><span>{new Date(e.updatedAt).toLocaleString('tr-TR')}</span><span className="session-preview">{e.preview}</span></button>
          <button className={'icon-btn pin' + (e.pinned ? ' on' : '')} aria-label={e.pinned ? 'Sabitlemeyi kaldır' : 'Oturumu sabitle'} disabled={busy} onClick={() => void update(e, { pinned: !e.pinned })}><Pin size={14} /></button>
        </div>)}
      </div>
      <div className="session-detail">
        {!detail && <p className="muted">{selected ? 'Oturum yükleniyor…' : 'Önizlemek veya devam etmek için bir oturum seçin.'}</p>}
        {detail && <>
          <div className="row"><input aria-label="Oturum adı" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /><button className="btn" disabled={busy} onClick={() => void update(detail.entry, { title })}>Adı kaydet</button></div>
          <div className="path-label">{detail.entry.cwd}</div>
          <div className="row"><button className="btn primary" onClick={() => { onResume(detail.entry); onClose() }}>Oturuma devam et</button><button className="btn" onClick={() => onHandoff(detail.entry)}>Görevi devret</button></div>
          {detail.truncated && <p className="muted small">Uzun kaydın başlangıcı ve son bölümü gösteriliyor.</p>}
          <div className="transcript">{detail.messages.map((m, i) => <div key={i} className={'message ' + m.role}><strong>{m.role === 'user' ? 'Siz' : 'Ajan'}</strong><pre>{m.text}</pre></div>)}</div>
        </>}
      </div>
    </div>
    <div className="muted tiny">Yerel Claude ve Codex kayıtları · En güncel 250 oturum ve sabitlenenler</div>
  </FeatureDialog>
}
