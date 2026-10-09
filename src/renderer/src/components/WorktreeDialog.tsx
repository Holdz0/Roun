import { useEffect, useState } from 'react'
import FeatureDialog from './FeatureDialog'
import { TOOL_NAMES, type Tool, type WorktreeInfo } from '../types'
export default function WorktreeDialog({ cwd, tool, onOpen, onClose }: { cwd: string; tool: Tool; onOpen: (cwd: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<WorktreeInfo[]>([])
  const [branch, setBranch] = useState('roun/gorev-' + Date.now().toString(36))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let alive = true
    window.roun.worktrees.list(cwd).then((list) => { if (alive) setItems(list) }).catch((e) => { if (alive) setError(String(e.message || e)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [cwd])
  const create = async (): Promise<void> => {
    setBusy(true); setError('')
    try { const result: WorktreeInfo = await window.roun.worktrees.create(cwd, branch); onOpen(result.path); onClose() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <FeatureDialog title="Ayrı çalışma dizininde aç" onClose={busy ? () => {} : onClose}>
    <p className="muted small">{TOOL_NAMES[tool]} için ayrı bir Git dalı ve çalışma dizini oluşturun. Yeni dizin son commit’ten başlar; kaydedilmemiş dosya değişiklikleri taşınmaz.</p>
    <div className="path-label">{cwd}</div>
    <label className="field"><span>Yeni dal adı</span><input value={branch} disabled={busy} onChange={(e) => setBranch(e.target.value)} /></label>
    <button className="btn primary" disabled={busy || !branch.trim()} onClick={() => void create()}>{busy ? 'Oluşturuluyor…' : 'Worktree oluştur ve aç'}</button>
    <div className="section-title">Mevcut çalışma dizinleri</div>
    {loading && <div className="muted small">Yükleniyor…</div>}
    <div className="worktree-list">{items.filter((w) => !w.bare).map((w) => <button key={w.path} className="dropdown-item" disabled={busy} onClick={() => { onOpen(w.path); onClose() }}>
      <strong>{w.branch}</strong><span className="dd-path" title={w.path}>{w.path}</span>
    </button>)}</div>
    {error && <div className="feature-error" role="alert">{error}</div>}
  </FeatureDialog>
}
