import { app } from 'electron'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { openSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { resolveCommand } from './cli'

export type OmniResult = { ok: true; started: boolean } | { ok: false; error: string }

let proc: ChildProcess | null = null
let pending: Promise<OmniResult> | null = null

const logFile = (): string => join(app.getPath('userData'), 'omniroute.log')

/** Başlangıç komutlarındaki yerel adresin portu (ör. ANTHROPIC_BASE_URL=http://localhost:20128/v1). */
export function portFrom(startup: string): number | null {
  const m = startup.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i)
  return m ? Number(m[1]) : null
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = connect({ port, host: '127.0.0.1' })
    const done = (ok: boolean): void => {
      s.destroy()
      resolve(ok)
    }
    s.setTimeout(500, () => done(false))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
  })
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Bazı makinelerde OmniRoute'un portu açması bir dakikayı geçebiliyor
const START_TIMEOUT = 180_000

function launch(): ChildProcess | string {
  const cmd = resolveCommand('omniroute')
  if (!cmd) return 'omniroute komutu bulunamadı (PATH\'te olmalı).'

  const log = openSync(logFile(), 'a')
  const opts = { windowsHide: true, stdio: ['ignore', log, log] as ('ignore' | number)[] }
  const child = cmd.toLowerCase().endsWith('.cmd')
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${cmd}"`], { ...opts, windowsVerbatimArguments: true })
    : spawn(cmd, [], opts)
  proc = child
  child.once('exit', () => {
    if (proc === child) proc = null
  })
  child.once('error', () => {
    if (proc === child) proc = null
  })
  return child
}

async function start(startup: string, onWait?: (seconds: number) => void): Promise<OmniResult> {
  const port = portFrom(startup)
  if (port && (await portOpen(port))) return { ok: true, started: false }

  // Önceki deneme zaman aşımına uğradıysa süreç hâlâ açılıyor olabilir: ikinci kopyayı başlatma
  const running = proc && proc.exitCode === null
  if (running && !port) return { ok: true, started: false }
  const child = running ? proc! : launch()
  if (typeof child === 'string') return { ok: false, error: child }

  // Port biliniyorsa açılana kadar bekle; bilinmiyorsa kısa bir süre tanı
  const begin = Date.now()
  const deadline = begin + (port ? START_TIMEOUT : 3_000)
  let lastReport = begin
  while (Date.now() < deadline) {
    if (proc !== child) return { ok: false, error: `OmniRoute başlarken kapandı. Ayrıntı: ${logFile()}` }
    if (port && (await portOpen(port))) return { ok: true, started: true }
    if (onWait && Date.now() - lastReport >= 10_000) {
      lastReport = Date.now()
      onWait(Math.round((lastReport - begin) / 1000))
    }
    await wait(300)
  }
  if (port)
    return {
      ok: false,
      error: `OmniRoute ${port} portunda ${START_TIMEOUT / 1000} sn içinde yanıt vermedi; arka planda açılmaya devam ediyor olabilir, sekmeyi yeniden açmayı deneyin. Ayrıntı: ${logFile()}`
    }
  return { ok: true, started: true }
}

/** OmniRoute çalışmıyorsa arka planda başlatır; aynı anda gelen istekler tek başlatmayı paylaşır. */
export function ensureOmniRoute(startup: string, onWait?: (seconds: number) => void): Promise<OmniResult> {
  if (!pending) pending = start(startup, onWait).finally(() => (pending = null))
  return pending
}

/** Yalnızca Roun'un başlattığı OmniRoute'u (alt süreçleriyle) kapatır. */
export function stopOmniRoute(): void {
  const p = proc
  proc = null
  if (!p?.pid || p.exitCode !== null) return
  // Uygulama hemen kapanacağı için eşzamanlı çalıştır
  try {
    execFileSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  } catch {
    /* zaten kapanmış */
  }
}
