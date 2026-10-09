import { useEffect, useState } from 'react'
import FeatureDialog from './FeatureDialog'
import { TOOL_NAMES, type Tool } from '../types'
export default function HandoffDialog({ source, load, onTransfer, onClose }: { source: { cwd: string; tool: Tool }; load: () => Promise<string>; onTransfer: (tool: Tool, cwd: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState('')
  const [target, setTarget] = useState<Tool>(source.tool === 'codex' ? 'claude' : 'codex')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let alive = true
    load().then((s) => { if (alive) setDraft(s) }).catch((e) => { if (alive) setError(e.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [load])
  const copy = async (open: boolean): Promise<void> => {
    try { await navigator.clipboard.writeText(draft); setCopied(true); if (open) { onTransfer(target, source.cwd); onClose() } }
    catch (e) { setError('Metin kopyalanamadı: ' + (e as Error).message) }
  }
  return <FeatureDialog title="Görev devri hazırlayın" wide onClose={onClose}>
    <p className="muted small">Taslak yerel kayıttan hazırlanır. Tamamlanan işleri ve kalan görevleri düzenleyin. Metin panoya kopyalanır; yeni oturumda Ctrl+V ile yapıştırın.</p>
    <div className="path-label">{source.cwd}</div>
    {loading && <p className="muted">Oturum okunuyor…</p>}
    <textarea className="handoff-draft" aria-label="Görev devir metni" disabled={loading} value={draft} onChange={(e) => { setDraft(e.target.value); setCopied(false) }} />
    {error && <div className="feature-error" role="alert">{error}</div>}
    <div className="modal-foot"><select aria-label="Hedef ajan" value={target} onChange={(e) => setTarget(e.target.value as Tool)}>{(['claude', 'codex', 'openrouter'] as const).map((t) => <option key={t} value={t}>{TOOL_NAMES[t]}</option>)}</select><button className="btn" disabled={loading || !draft} onClick={() => void copy(false)}>{copied ? 'Kopyalandı' : 'Metni kopyala'}</button><button className="btn primary" disabled={loading || !draft} onClick={() => void copy(true)}>Kopyala ve {TOOL_NAMES[target]}’i aç</button></div>
  </FeatureDialog>
}
