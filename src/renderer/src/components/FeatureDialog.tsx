import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
export default function FeatureDialog({ title, onClose, children, wide = false, className = '' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const id = useId()
  const host = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    host.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRef.current(); return }
      if (e.key !== 'Tab') return
      e.stopPropagation()
      const nodes = [...host.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((n) => n.offsetParent !== null)
      const first = nodes[0], last = nodes.at(-1)
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('keydown', key, true); previous?.focus() }
  }, [])
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div ref={host} className={'modal feature-modal' + (wide ? ' wide' : '') + (className ? ' ' + className : '')} role="dialog" aria-modal="true" aria-labelledby={id} onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><h2 id={id}>{title}</h2><button className="icon-btn" aria-label="Kapat" onClick={onClose}><X size={16} /></button></div>
      {children}
    </div>
  </div>
}
