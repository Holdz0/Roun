import { useState } from 'react'
import { X } from 'lucide-react'
import type { Settings } from '../types'

interface Props {
  settings: Settings
  onSave: (patch: Partial<Settings>) => void
  onClose: () => void
}

export default function SettingsDialog({ settings, onSave, onClose }: Props) {
  const [s, setS] = useState(settings)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]): void => setS((p) => ({ ...p, [k]: v }))

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Ayarlar</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <label className="field">
          <span>Tema</span>
          <select value={s.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'])}>
            <option value="dark">Koyu</option>
            <option value="light">Açık</option>
          </select>
        </label>
        <label className="field">
          <span>Yazı tipi</span>
          <input value={s.fontFamily} onChange={(e) => set('fontFamily', e.target.value)} />
        </label>
        <label className="field">
          <span>Yazı boyutu</span>
          <input type="number" min={9} max={28} value={s.fontSize} onChange={(e) => set('fontSize', Number(e.target.value) || 14)} />
        </label>
        <label className="field">
          <span>Claude varsayılan argümanları</span>
          <input value={s.claudeArgs} placeholder="örn. --model opus" onChange={(e) => set('claudeArgs', e.target.value)} />
        </label>
        <label className="field">
          <span>Codex varsayılan argümanları</span>
          <input value={s.codexArgs} placeholder="örn. -m gpt-5-codex" onChange={(e) => set('codexArgs', e.target.value)} />
        </label>
        <label className="field">
          <span>OpenRouter başlangıcı</span>
          <textarea
            rows={5}
            spellCheck={false}
            value={s.openrouterStartup}
            placeholder={'$env:ANTHROPIC_BASE_URL = "http://localhost:20128/v1"\n$env:ANTHROPIC_AUTH_TOKEN = "..."'}
            onChange={(e) => set('openrouterStartup', e.target.value)}
          />
          <small className="muted">
            PowerShell komutları. OmniRoute arka planda başlatıldıktan sonra, Claude Code'dan önce sırayla çalışır.
            Adresteki port OmniRoute'un hazır olmasını beklemek için kullanılır. %APPDATA%\Roun\settings.json içinde düz
            metin olarak saklanır.
          </small>
        </label>
        <label className="field">
          <span>Limit yenileme aralığı (sn)</span>
          <input
            type="number"
            min={30}
            max={3600}
            value={s.refreshSeconds}
            onChange={(e) => set('refreshSeconds', Math.max(30, Number(e.target.value) || 60))}
          />
        </label>

        <fieldset className="settings-group"><legend>Bildirimler</legend>
          <label className="inline-field"><input type="checkbox" checked={s.notificationsEnabled} onChange={(e) => set('notificationsEnabled', e.target.checked)} /> Masaüstü bildirimleri</label>
          <label className="inline-field"><input type="checkbox" checked={s.quietMode} onChange={(e) => set('quietMode', e.target.checked)} /> Sessiz mod (tüm masaüstü bildirimlerini durdur)</label>
          <label className="field"><span>Aynı bildirim için bekleme süresi (sn)</span><input type="number" min={10} max={3600} value={s.notificationCooldownSeconds} onChange={(e) => set('notificationCooldownSeconds', Math.max(10, Math.min(3600, Number(e.target.value) || 60)))} /></label>
        </fieldset>
        <fieldset className="settings-group"><legend>Kullanım ve bağlam uyarıları</legend>
          <label className="inline-field"><input type="checkbox" checked={s.usageAlerts} onChange={(e) => set('usageAlerts', e.target.checked)} /> Eşik uyarıları</label>
          <label className="field"><span>Abonelik kullanım eşiği (%)</span><input type="number" min={1} max={100} value={s.usageAlertPercent} onChange={(e) => set('usageAlertPercent', Math.max(1, Math.min(100, Number(e.target.value) || 85)))} /></label>
          <label className="field"><span>Oturum bağlamı eşiği (%)</span><input type="number" min={1} max={100} value={s.contextAlertPercent} onChange={(e) => set('contextAlertPercent', Math.max(1, Math.min(100, Number(e.target.value) || 85)))} /></label>
          <label className="inline-field"><input type="checkbox" checked={s.resetReminders} onChange={(e) => set('resetReminders', e.target.checked)} /> Eşiği aşan limit için sıfırlanma hatırlatması</label>
        </fieldset>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            onClick={() => {
              onSave(s)
              onClose()
            }}
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}
