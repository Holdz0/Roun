import { useEffect, useState } from 'react'
import type { ContextResult, Tab } from './types'
export function useUsageContext(tab: Tab | null): { context: ContextResult | null; error: string } {
  const [context, setContext] = useState<ContextResult | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    setContext(null); setError('')
    if (!tab || tab.tool === 'shell') return
    let alive = true, pending = false
    const read = async (): Promise<void> => {
      if (pending) return
      pending = true
      try {
        const result = await window.roun.usage.context(tab.tool, tab.cwd, tab.startedAt, tab.args, tab.id)
        if (alive) { setContext(result); setError('') }
      } catch (e) { if (alive) setError((e as Error).message) }
      finally { pending = false }
    }
    void read()
    const timer = setInterval(() => void read(), 3000)
    return () => { alive = false; clearInterval(timer) }
  }, [tab?.id, tab?.startedAt, tab?.tool, tab?.cwd, tab?.args])
  return { context, error }
}
