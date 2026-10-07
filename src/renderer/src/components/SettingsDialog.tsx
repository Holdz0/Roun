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
          <span>Limit yenileme aralığı (sn)</span>
          <input
            type="number"
            min={30}
            max={3600}
            value={s.refreshSeconds}
            onChange={(e) => set('refreshSeconds', Math.max(30, Number(e.target.value) || 60))}
          />
        </label>

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
