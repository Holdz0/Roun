import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type Tool = 'claude' | 'codex' | 'openrouter' | 'shell'

/** OpenRouter sekmesi, OmniRoute üzerinden çalışan bir Claude Code oturumudur. */
export const isClaudeLike = (tool: string): boolean => tool === 'claude' || tool === 'openrouter'

const cache = new Map<string, string | null>()

/** Bir komutun tam yolunu bulur; .exe tercih edilir, yoksa .cmd. */
export function resolveCommand(name: string): string | null {
  if (cache.has(name)) return cache.get(name)!
  let found: string | null = null
  try {
    const out = execFileSync('where.exe', [name], { encoding: 'utf8', windowsHide: true })
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    found =
      lines.find((l) => l.toLowerCase().endsWith('.exe')) ??
      lines.find((l) => l.toLowerCase().endsWith('.cmd')) ??
      null
  } catch {
    const npmCmd = join(process.env.APPDATA ?? '', 'npm', `${name}.cmd`)
    if (existsSync(npmCmd)) found = npmCmd
  }
  cache.set(name, found)
  return found
}

/** Bir sekme için çalıştırılacak dosya ve argümanları döndürür. */
export function commandFor(tool: Tool, extraArgs: string, startup = ''): { file: string; args: string[] | string } {
  const comspec = process.env.ComSpec || 'cmd.exe'
  if (tool === 'shell') {
    return { file: 'powershell.exe', args: ['-NoLogo'] }
  }
  const name = isClaudeLike(tool) ? 'claude' : 'codex'
  const resolved = resolveCommand(name)
  if (!resolved) {
    const msg = `echo ${name} bulunamadi. Kurmak icin: npm i -g ${name === 'claude' ? '@anthropic-ai/claude-code' : '@openai/codex'} & pause`
    return { file: comspec, args: ['/d', '/c', msg] }
  }
  if (tool === 'openrouter') {
    // Kullanıcının başlangıç komutları ve Claude aynı PowerShell oturumunda çalışır ki ortam değişkenleri geçsin
    const script = [
      "$ErrorActionPreference = 'Stop'",
      startup,
      "$ErrorActionPreference = 'Continue'",
      `& '${resolved.replace(/'/g, "''")}' ${extraArgs.trim()}`,
      'exit $LASTEXITCODE'
    ].join('\r\n')
    return { file: 'powershell.exe', args: ['-NoLogo', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] }
  }
  if (resolved.toLowerCase().endsWith('.exe')) {
    // Windows'ta node-pty string argümanı komut satırına olduğu gibi koyar.
    return { file: resolved, args: extraArgs.trim() }
  }
  // .cmd dosyaları cmd.exe üzerinden çalışmalı
  return { file: comspec, args: `/d /s /c ""${resolved}" ${extraArgs.trim()}"` }
}
