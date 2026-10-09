import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, realpath } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { WorktreeInfo } from '../shared/features'

const run = promisify(execFile)
async function git(cwd: string, args: string[]): Promise<string> {
  try {
    return (await run('git', ['-C', cwd, ...args], { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 })).stdout
  } catch (error) {
    const e = error as Error & { stderr?: string; code?: string }
    throw new Error(e.code === 'ENOENT' ? 'Git bulunamadı. Git kurulumunu kontrol edin.' : (e.stderr?.trim() || e.message))
  }
}
export function parseWorktrees(raw: string): WorktreeInfo[] {
  return raw.split('\0\0').filter(Boolean).flatMap((block) => {
    const fields = block.split('\0')
    const location = fields.find((f) => f.startsWith('worktree '))?.slice(9)
    return location ? [{ path: location, branch: fields.find((f) => f.startsWith('branch '))?.slice(7).replace(/^refs\/heads\//, '') || '(ayrık HEAD)', bare: fields.includes('bare') }] : []
  })
}
export async function listWorktrees(cwd: string): Promise<WorktreeInfo[]> {
  return parseWorktrees(await git(await realpath(cwd), ['worktree', 'list', '--porcelain', '-z']))
}
export async function createWorktree(cwd: string, branch: string, storage: string): Promise<WorktreeInfo> {
  branch = branch.trim()
  if (!branch || branch.startsWith('-') || branch.length > 120) throw new Error('Geçerli bir yeni dal adı girin.')
  const repo = (await git(await realpath(cwd), ['rev-parse', '--show-toplevel'])).trim()
  await git(repo, ['check-ref-format', '--branch', branch])
  await mkdir(storage, { recursive: true })
  const target = join(storage, basename(repo).replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + randomUUID().slice(0, 8))
  await git(repo, ['worktree', 'add', '-b', branch, target, 'HEAD'])
  return { path: target, branch, bare: false }
}
