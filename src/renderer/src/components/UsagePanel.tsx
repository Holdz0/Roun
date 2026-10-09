import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { ContextResult, Limits, LimitsResult, Tab, Settings, UsageInsight } from '../types'
import UsageHistoryDialog, { UsageSparkline } from './UsageHistoryDialog'

function level(p: number): string {
  return p >= 85 ? 'bad' : p >= 60 ? 'warn' : 'good'
}

function untilText(iso: string | null, now: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (ms <= 0) return 'zamanı geldi'
  const m = Math.floor(ms / 60000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  if (d > 0) return `${d}g ${h}s`
  if (h > 0) return `${h}s ${mm}dk`
  return `${mm}dk`
}

function agoText(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'şimdi'
  if (s < 60) return `${s} sn önce`
  return `${Math.round(s / 60)} dk önce`
}

const fmtK = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `${Math.round(n / 1000)}k`)

export function Meter({ label, percent, right, title }: { label: string; percent: number; right?: string; title?: string }) {
  const p = Math.max(0, Math.min(100, percent))
  return (
    <div className="meter" title={title}>
      <div className="meter-row">
        <span className="meter-label">{label}</span>
        <span className="meter-value">%{Math.round(percent)}</span>
      </div>
      <div className="meter-track">
        <div className={`meter-fill ${level(p)}`} style={{ width: `${p}%` }} />
      </div>
      {right && <div className="meter-sub">{right}</div>}
    </div>
  )
}

function LimitBlock({ name, accent, r, now, settings, insights }: { name: string; accent: string; r?: LimitsResult; now: number; settings: Settings; insights: UsageInsight[] }) {
  return (
    <section className="usage-block">
      <header>
        <span className={`dot ${accent}`} />
        <span className="usage-name">{name}</span>
        {r?.plan && <span className="badge">{r.plan}</span>}
        {r?.source === 'log' && (
          <span className="badge muted" title={r.measuredAt ? 'Son oturum kaydı: ' + new Date(r.measuredAt).toLocaleString('tr-TR') : 'Son oturum kaydından okundu'}>
            kayıt
          </span>
        )}
      </header>
      {!r && <div className="muted small">Yükleniyor…</div>}
      {r && !r.ok && <div className="muted small">{r.error}</div>}
      {r?.ok &&
        r.windows.map((w) => (
          <div key={w.label}>
          <Meter
            label={w.label}
            percent={w.percent}
            right={w.resetsAt ? Date.parse(w.resetsAt) > now ? `${untilText(w.resetsAt, now)} sonra sıfırlanır` : 'Sıfırlanma zamanı geldi; limitleri yenileyin.' : undefined}
            title={w.resetsAt ? new Date(w.resetsAt).toLocaleString('tr-TR') : undefined}
          />
          {settings.usageAlerts && w.percent >= settings.usageAlertPercent && <div className="usage-warning">Uyarı eşiği aşıldı (%{settings.usageAlertPercent}).</div>}
          {(() => {
            const insight = insights.find((s) => s.tool === accent && s.label === w.label)
            if (!insight) return null
            return <><UsageSparkline insight={insight} />{r.source === 'api' && insight.minutesLeft !== null && insight.minutesLeft < 1440 && <div className="muted tiny">Tahmin: mevcut hızla yaklaşık {Math.max(1, Math.round(insight.minutesLeft))} dk sonra %100{w.resetsAt && Date.parse(w.resetsAt) < now + insight.minutesLeft * 60000 ? ' (öncesinde limit sıfırlanacak)' : ''}.</div>}</>
          })()}
          </div>
        ))}
    </section>
  )
}

interface Props {
  limits: Limits | null
  activeTab: Tab | null
  settings: Settings
  context: ContextResult | null
  contextError: string
  onRefresh: () => Promise<void>
}

export default function UsagePanel({ limits, activeTab, settings, context: ctx, contextError, onRefresh }: Props) {
  const [now, setNow] = useState(Date.now())
  const [insights, setInsights] = useState<UsageInsight[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [error, setError] = useState('')
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let alive = true
    window.roun.usage.history().then((data) => { if (alive) setInsights(data) }).catch((e) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [limits])

  return (
    <div className="usage">
      <div className="usage-head">
        <span className="section-title">Kullanım</span>
        <button
          className={`icon-btn ${spinning ? 'spin' : ''}`}
          title="Limitleri yenile"
          onClick={async () => {
            setSpinning(true)
            try { await onRefresh(); setError('') } catch (e) { setError((e as Error).message) } finally { setSpinning(false) }
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {activeTab && activeTab.tool !== 'shell' && (
        <section className="usage-block">
          <header>
            <span className="usage-name">Aktif oturum bağlamı</span>
          </header>
          {ctx?.ok ? (
            <><Meter
              label={ctx.model ? ctx.model.replace(/^claude-/, '') : 'Bağlam'}
              percent={ctx.percent}
              right={`${fmtK(ctx.used)} / ${fmtK(ctx.window)} token`}
            />{settings.usageAlerts && ctx.percent >= settings.contextAlertPercent && <div className="usage-warning">Bağlam eşiği aşıldı (%{settings.contextAlertPercent}). Görev devri hazırlayabilirsiniz.</div>}</>
          ) : (
            <div className="muted small">{contextError || 'İlk yanıttan sonra görünür.'}</div>
          )}
        </section>
      )}

      <LimitBlock name="Claude" accent="claude" r={limits?.claude} now={now} settings={settings} insights={insights} />
      <LimitBlock name="Codex" accent="codex" r={limits?.codex} now={now} settings={settings} insights={insights} />

      <button className="btn ghost" onClick={() => setShowHistory(true)}>Kullanım geçmişi</button>
      {showHistory && <UsageHistoryDialog insights={insights} onClose={() => setShowHistory(false)} />}
      {error && <div className="feature-error" role="alert">{error}</div>}
      {limits && <div className="muted tiny">Güncellendi: {agoText(limits.claude.fetchedAt, now)}</div>}
    </div>
  )
}
