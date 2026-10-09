import { useState } from 'react'
import FeatureDialog from './FeatureDialog'
import type { UsageInsight } from '../types'
export function UsageSparkline({ insight }: { insight: UsageInsight }) {
  const samples = insight.history
  if (samples.length < 2) return <div className="muted tiny">Grafik için ölçüm birikiyor.</div>
  const start = samples[0].at, span = Math.max(1, samples.at(-1)!.at - start)
  const points = samples.map((s) => (4 + (s.at - start) / span * 212).toFixed(1) + ',' + (52 - Math.max(0, Math.min(100, s.percent)) * 0.48).toFixed(1)).join(' ')
  return <svg className="usage-sparkline" viewBox="0 0 220 56" role="img" aria-label={insight.tool + ' ' + insight.label + ' kullanım geçmişi'}><title>{samples.length} ölçüm · %{Math.round(samples[0].percent)} → %{Math.round(samples.at(-1)!.percent)}</title><path d="M4 52H216 M4 28H216 M4 4H216" stroke="var(--line)" fill="none" /><polyline points={points} fill="none" stroke={insight.tool === 'claude' ? 'var(--claude)' : 'var(--codex)'} strokeWidth="2" /></svg>
}
export default function UsageHistoryDialog({ insights, onClose }: { insights: UsageInsight[]; onClose: () => void }) {
  const [selected, setSelected] = useState(0)
  const current = insights[selected]
  return <FeatureDialog title="Yerel kullanım geçmişi" wide onClose={onClose}>
    <p className="muted small">Son 24 saatteki ölçümler. Her pencerenin son 90 ölçümü gösterilir. Tahminler yalnızca güncel API verisi, aynı sıfırlanma dönemi ve en az 5 dakikalık geçmiş ile hesaplanır.</p>
    {!insights.length && <div className="muted">Henüz ölçüm yok.</div>}
    {!!insights.length && <select aria-label="Kullanım penceresi" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>{insights.map((s, i) => <option key={s.tool + s.label} value={i}>{s.tool} · {s.label}</option>)}</select>}
    {current && <><UsageSparkline insight={current} /><div className="history-table"><table><thead><tr><th>Zaman</th><th>Kullanım</th><th>Sıfırlanma</th><th>Kaynak</th></tr></thead><tbody>{[...current.history].reverse().map((s, i) => <tr key={i}><td>{new Date(s.at).toLocaleString('tr-TR')}</td><td>%{Math.round(s.percent)}</td><td>{s.resetsAt ? new Date(s.resetsAt).toLocaleString('tr-TR') : '—'}</td><td>{s.source === 'api' ? 'API' : 'Oturum kaydı'}</td></tr>)}</tbody></table></div></>}
  </FeatureDialog>
}
