import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { ContextResult, Limits, LimitsResult, Tab } from '../types'

function level(p: number): string {
  return p >= 85 ? 'bad' : p >= 60 ? 'warn' : 'good'
}

function untilText(iso: string | null, now: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (ms <= 0) return 'sıfırlandı'
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

function LimitBlock({ name, accent, r, now }: { name: string; accent: string; r?: LimitsResult; now: number }) {
  return (
    <section className="usage-block">
      <header>
        <span className={`dot ${accent}`} />
        <span className="usage-name">{name}</span>
        {r?.plan && <span className="badge">{r.plan}</span>}
        {r?.source === 'log' && (
          <span className="badge muted" title="Son oturum kaydından okundu">
            kayıt
          </span>
        )}
      </header>
      {!r && <div className="muted small">Yükleniyor…</div>}
      {r && !r.ok && <div className="muted small">{r.error}</div>}
      {r?.ok &&
        r.windows.map((w) => (
          <Meter
            key={w.label}
            label={w.label}
            percent={w.percent}
            right={w.resetsAt ? `${untilText(w.resetsAt, now)} sonra sıfırlanır` : undefined}
            title={w.resetsAt ? new Date(w.resetsAt).toLocaleString('tr-TR') : undefined}
          />
        ))}
    </section>
  )
}

interface Props {
  limits: Limits | null
  activeTab: Tab | null
  onRefresh: () => Promise<void>
}

export default function UsagePanel({ limits, activeTab, onRefresh }: Props) {
  const [now, setNow] = useState(Date.now())
  const [ctx, setCtx] = useState<ContextResult | null>(null)
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(t)
  }, [])

  // Aktif sekmenin bağlamını sık aralıkla yerel kayıtlardan oku
  useEffect(() => {
    setCtx(null)
    if (!activeTab || activeTab.tool === 'shell') return
    let alive = true
    const read = async (): Promise<void> => {
      const r = (await window.roun.usage.context(activeTab.tool, activeTab.cwd, activeTab.startedAt, activeTab.args)) as ContextResult | null
      if (alive) setCtx(r)
    }
    read()
    const t = setInterval(read, 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [activeTab?.id, activeTab?.startedAt, activeTab?.tool, activeTab?.cwd, activeTab?.args])

  return (
    <div className="usage">
      <div className="usage-head">
        <span className="section-title">Kullanım</span>
        <button
          className={`icon-btn ${spinning ? 'spin' : ''}`}
          title="Limitleri yenile"
          onClick={async () => {
            setSpinning(true)
            await onRefresh()
            setSpinning(false)
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
            <Meter
              label={ctx.model ? ctx.model.replace(/^claude-/, '') : 'Bağlam'}
              percent={ctx.percent}
              right={`${fmtK(ctx.used)} / ${fmtK(ctx.window)} token`}
            />
          ) : (
            <div className="muted small">İlk yanıttan sonra görünür.</div>
          )}
        </section>
      )}

      <LimitBlock name="Claude" accent="claude" r={limits?.claude} now={now} />
      <LimitBlock name="Codex" accent="codex" r={limits?.codex} now={now} />

      {limits && <div className="muted tiny">Güncellendi: {agoText(limits.claude.fetchedAt, now)}</div>}
    </div>
  )
}
