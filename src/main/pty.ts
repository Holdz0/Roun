import * as pty from '@lydell/node-pty'
import type { WebContents } from 'electron'
import { commandFor, type Tool } from './cli'

export interface SpawnOptions {
  id: string
  tool: Tool
  cwd: string
  args: string
  cols: number
  rows: number
  /** OpenRouter sekmesinde Claude'dan önce çalışan PowerShell komutları */
  startup?: string
}

const ptys = new Map<string, pty.IPty>()

export function spawnPty(wc: WebContents, o: SpawnOptions): void {
  const { file, args } = commandFor(o.tool, o.args, o.startup)
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '3', ROUN_TAB: o.id } as Record<string, string>
  // Uygulama başka bir Claude Code oturumunun içinden açıldıysa o oturuma ait işaretler sızmasın
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k === 'CLAUDE_PID' || k === 'CLAUDE_EFFORT' || /^CLAUDE_CODE_(CHILD_SESSION|SESSION_|ENTRYPOINT|EXECPATH|MESSAGING_|SSE_PORT)/.test(k)) {
      delete env[k]
    }
  }
  const p = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: Math.max(o.cols, 20),
    rows: Math.max(o.rows, 5),
    cwd: o.cwd,
    env,
    useConpty: true
  })
  ptys.set(o.id, p)

  // Küçük parçaları toplayıp IPC trafiğini azalt
  let buf = ''
  let timer: NodeJS.Timeout | null = null
  p.onData((d) => {
    buf += d
    if (!timer) {
      timer = setTimeout(() => {
        if (!wc.isDestroyed()) wc.send('pty:data', o.id, buf)
        buf = ''
        timer = null
      }, 4)
    }
  })
  p.onExit(({ exitCode }) => {
    ptys.delete(o.id)
    setTimeout(() => {
      if (!wc.isDestroyed()) wc.send('pty:exit', o.id, exitCode)
    }, 10)
  })
}

export function writePty(id: string, data: string): void {
  ptys.get(id)?.write(data)
}

export function resizePty(id: string, cols: number, rows: number): void {
  try {
    ptys.get(id)?.resize(Math.max(cols, 20), Math.max(rows, 5))
  } catch {
    /* süreç kapanmış olabilir */
  }
}

export function killPty(id: string): void {
  const p = ptys.get(id)
  if (!p) return
  ptys.delete(id)
  try {
    p.kill()
  } catch {
    /* zaten kapalı */
  }
}

export function killAll(): void {
  for (const id of [...ptys.keys()]) killPty(id)
}
