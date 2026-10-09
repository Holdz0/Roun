import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, readdir } from 'node:fs/promises'
import { join, basename, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { SessionArchive, parseSession, handoffDraft, readSessionParts } from '../src/main/sessions.ts'
import { NotificationPolicy } from '../src/main/notification-policy.ts'
import { UsageHistory, usageInsights } from '../src/main/usage/history.ts'
import { createWorktree, listWorktrees, parseWorktrees } from '../src/main/worktrees.ts'
const run = promisify(execFile)
const settings = { notificationsEnabled: true, quietMode: false, notificationCooldownSeconds: 60, usageAlerts: true, usageAlertPercent: 85, contextAlertPercent: 85, resetReminders: true }
const uuid = '12345678-1234-1234-1234-123456789abc'
const jsonl = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n'
async function fixture(fn) {
  const base = await realpath(tmpdir())
  const dir = await mkdtemp(join(base, 'roun-features-'))
  try { return await fn(dir) } finally {
    const target = await realpath(dir)
    assert.equal(resolve(target), resolve(dir))
    assert.equal(resolve(join(target, '..')), resolve(base))
    assert.match(basename(target), /^roun-features-/)
    await rm(target, { recursive: true, force: true })
  }
}
const result = (percent, at, reset, source = 'api') => ({ claude: { ok: true, fetchedAt: at, source, windows: [{ label: '5 saat', percent, resetsAt: reset }] }, codex: { ok: false, fetchedAt: at, source: 'none', windows: [] } })

test('Claude kayıtları araç sonuçlarını ve bozuk son satırı metne katmaz', () => {
  const data = parseSession(jsonl([
    { type: 'user', sessionId: uuid, cwd: 'C:/proje', message: { role: 'user', content: 'Hata düzelt' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash' }, { type: 'text', text: 'Düzeltildi' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'secret tool output' }] } },
    { type: 'assistant', isSidechain: true, message: { role: 'assistant', content: 'Alt ajan' } }
  ]).split('\n').concat('{broken'), 'claude')
  assert.equal(data.id, uuid); assert.equal(data.cwd, 'C:/proje')
  assert.deepEqual(data.messages, [{ role: 'user', text: 'Hata düzelt' }, { role: 'assistant', text: 'Düzeltildi' }])
})
test('Codex mesajları olay kayıtlarıyla iki kez gösterilmez', () => {
  const data = parseSession(jsonl([
    { type: 'session_meta', payload: { id: uuid, cwd: 'C:/codex' } },
    { type: 'event_msg', payload: { type: 'user_message', message: 'İstek' } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'İstek' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Sonuç' }] } }
  ]).split('\n'), 'codex')
  assert.equal(data.messages.length, 2); assert.equal(data.cwd, 'C:/codex')
})
test('Eski Codex olay biçimi de okunur', () => {
  const data = parseSession(jsonl([{ type: 'event_msg', payload: { type: 'agent_message', message: 'Eski çıktı' } }]).split('\n'), 'codex')
  assert.equal(data.messages[0].text, 'Eski çıktı')
})
test('Arşiv yeniden açılınca ad, sabitleme ve OpenRouter kaynağı korunur', async () => fixture(async (dir) => {
  const claude = join(dir, 'claude'), codex = join(dir, 'codex'), storage = join(dir, 'store')
  await mkdir(join(claude, 'project'), { recursive: true })
  await writeFile(join(claude, 'project', uuid + '.jsonl'), jsonl([{ type: 'user', sessionId: uuid, cwd: 'C:/proje', message: { role: 'user', content: 'Test amacı' } }]))
  const archive = new SessionArchive(storage, claude, codex)
  await archive.remember(uuid, 'openrouter', 'C:/proje')
  const entry = (await archive.list())[0]
  await archive.update(entry.key, { title: 'Önemli görev', pinned: true })
  const reloaded = new SessionArchive(storage, claude, codex)
  const saved = (await reloaded.list())[0]
  assert.equal(saved.title, 'Önemli görev'); assert.equal(saved.pinned, true); assert.equal(saved.tool, 'openrouter')
  await assert.rejects(() => reloaded.detail('../../outside'), /bulunamadı/)
  const draft = handoffDraft(await reloaded.detail(saved.key))
  assert.match(draft, /Test amacı/); assert.match(draft, /Kalan görevler/); assert.match(draft, /Henüz ajan çıktısı yok/)
}))
test('Uzun kayıtta başlangıç ve son mesaj kalır; kırpılma belirtilir', async () => fixture(async (dir) => {
  const file = join(dir, 'long.jsonl')
  const first = { type: 'user', message: { role: 'user', content: 'İlk amaç' } }
  const last = { type: 'assistant', message: { role: 'assistant', content: 'Son durum' } }
  await writeFile(file, jsonl([first]) + jsonl(Array.from({ length: 2000 }, () => ({ type: 'tool', data: 'x'.repeat(1000) }))) + jsonl([last]))
  const parts = await readSessionParts(file)
  const parsed = parseSession(parts.lines, 'claude')
  assert.equal(parts.truncated, true)
  assert.equal(parsed.messages[0].text, 'İlk amaç'); assert.equal(parsed.messages.at(-1).text, 'Son durum')
  assert.ok(parts.lines.join('\n').length < 200000)
}))
test('Başlangıçtaki bitti durumu bildirim üretmez; gerçek tur tamamlanması üretir', () => {
  const p = new NotificationPolicy()
  assert.equal(p.transition('a', 'done', settings, 1000), false)
  assert.equal(p.transition('a', 'working', settings, 2000), false)
  assert.equal(p.transition('a', 'done', settings, 3000), true)
  assert.equal(p.transition('a', 'done', settings, 4000), false)
})
test('Yanıt bekleme ve hata bildirimleri sekme bazında tekrar sınırına uyar', () => {
  const p = new NotificationPolicy()
  assert.equal(p.transition('a', 'waiting', settings, 1000), true)
  p.transition('a', 'working', settings, 2000)
  assert.equal(p.transition('a', 'waiting', settings, 3000), false)
  assert.equal(p.transition('b', 'waiting', settings, 3000), true)
  assert.equal(p.transition('a', 'error', settings, 4000), true)
  p.transition('a', 'working', settings, 61000)
  assert.equal(p.transition('a', 'waiting', settings, 62000), true)
})
test('Sessiz mod ve kapalı bildirimler tüm masaüstü uyarılarını durdurur', () => {
  const p = new NotificationPolicy()
  assert.equal(p.allow('limit', { ...settings, quietMode: true }, 1), false)
  assert.equal(p.transition('a', 'waiting', { ...settings, notificationsEnabled: false }, 2), false)
  assert.equal(p.allow('limit', settings, 3), true)
})
test('Limit uyarısı aynı dönemde bir kez gelir; yeni dönemde yeniden gelir', () => {
  const h = new UsageHistory(), now = 1700000000000, reset = new Date(now + 3600000).toISOString()
  assert.equal(h.record(result(84, now, reset), settings, now).length, 0)
  assert.equal(h.record(result(86, now + 60000, reset), settings, now + 60000).length, 1)
  assert.equal(h.record(result(90, now + 120000, reset), settings, now + 120000).length, 0)
  const next = new Date(now + 2 * 3600000).toISOString()
  assert.equal(h.record(result(86, now + 3600000, next), settings, now + 3600000).length, 1)
})
test('Kayıt verisi ve kapalı uyarılar limit bildirimi üretmez', () => {
  const h = new UsageHistory(), now = 1700000000000, reset = new Date(now + 3600000).toISOString()
  assert.equal(h.record(result(99, now, reset, 'log'), settings, now).length, 0)
  assert.equal(h.record(result(99, now + 60000, reset), { ...settings, usageAlerts: false }, now + 60000).length, 0)
})
test('Sıfırlanma hatırlatması tek kez gelir ve yeniden başlatmada yinelenmez', async () => fixture(async (dir) => {
  const file = join(dir, 'history.json'), now = 1700000000000, reset = new Date(now + 60000).toISOString()
  const h = new UsageHistory(file)
  h.record(result(90, now, reset), settings, now)
  assert.equal(h.resetAlerts(settings, now + 59000).length, 0)
  assert.equal(h.resetAlerts(settings, now + 60000).length, 1)
  const reopened = new UsageHistory(file)
  assert.equal(reopened.resetAlerts(settings, now + 61000).length, 0)
  assert.equal(reopened.insights(now + 61000).length, 1)
}))
test('Tüketim tahmini en az 3 güncel ölçüm ve 5 dakikalık veri gerektirir', () => {
  const now = 1700000000000, reset = new Date(now + 3600000).toISOString()
  const sample = (percent, at, source = 'api') => ({ tool: 'claude', label: '5 saat', percent, at, source, resetsAt: reset })
  const samples = [sample(20, now - 600000), sample(25, now - 300000), sample(30, now)]
  const insight = usageInsights(samples, now)[0]
  assert.equal(insight.ratePerHour, 60); assert.equal(insight.minutesLeft, 70)
  assert.equal(usageInsights(samples.slice(1), now)[0].ratePerHour, null)
  assert.equal(usageInsights(samples, now + 600000)[0].ratePerHour, null)
  assert.equal(usageInsights(samples.map((s) => ({ ...s, source: 'log' })), now)[0].ratePerHour, null)
})
test('Sıfırlanan veya azalan yüzde önceki hızla birleştirilmez', () => {
  const now = 1700000000000, reset = new Date(now + 3600000).toISOString()
  const samples = [80, 85, 5].map((percent, i) => ({ tool: 'codex', label: '5 saat', percent, at: now - (2 - i) * 300000, source: 'api', resetsAt: reset }))
  assert.equal(usageInsights(samples, now)[0].ratePerHour, null)
  samples[2].resetsAt = new Date(now + 7200000).toISOString()
  assert.equal(usageInsights(samples, now)[0].ratePerHour, null)
})
test('Boşluklu worktree yolları ve ayrık HEAD ayrıştırılır', () => {
  const entries = parseWorktrees('worktree C:/my repo\0HEAD abc\0branch refs/heads/main\0\0worktree C:/other\0HEAD def\0detached\0\0')
  assert.equal(entries[0].path, 'C:/my repo'); assert.equal(entries[0].branch, 'main'); assert.equal(entries[1].branch, '(ayrık HEAD)')
})
test('Gerçek Git worktree ayrı dalda açılır, ana dosyalar korunur ve geçersiz dal reddedilir', async () => fixture(async (dir) => {
  const repo = join(dir, 'project with spaces'), storage = join(dir, 'worktrees')
  await mkdir(repo)
  const git = (args) => run('git', ['-C', repo, ...args], { windowsHide: true })
  await git(['init', '-b', 'main'])
  await writeFile(join(repo, 'hello.txt'), 'original')
  await git(['add', 'hello.txt'])
  await git(['-c', 'user.name=Roun Test', '-c', 'user.email=roun-test@example.invalid', 'commit', '-m', 'fixture'])
  const created = await createWorktree(repo, 'roun/task', storage)
  assert.equal(created.branch, 'roun/task')
  assert.equal(await readFile(join(created.path, 'hello.txt'), 'utf8'), 'original')
  await writeFile(join(created.path, 'hello.txt'), 'agent change')
  assert.equal(await readFile(join(repo, 'hello.txt'), 'utf8'), 'original')
  assert.equal((await listWorktrees(repo)).length, 2)
  await assert.rejects(() => createWorktree(repo, '--force', storage), /Geçerli/)
  await assert.rejects(() => createWorktree(repo, 'bad..branch', storage))
  await assert.rejects(() => createWorktree(repo, 'roun/task', storage))
  assert.equal((await readdir(storage)).length, 1)
}))


test('Devir taslağı son 40 mesajın dışında kalan ilk amacı korur', async () => fixture(async (dir) => {
  const claude = join(dir, 'claude'), codex = join(dir, 'codex')
  await mkdir(join(claude, 'project'), { recursive: true })
  await writeFile(join(claude, 'project', uuid + '.jsonl'), jsonl([
    { type: 'user', sessionId: uuid, cwd: 'C:/proje', message: { role: 'user', content: 'İlk özel amaç' } },
    ...Array.from({ length: 50 }, (_, i) => ({ type: 'assistant', message: { role: 'assistant', content: 'Yanıt ' + i } }))
  ]))
  const archive = new SessionArchive(join(dir, 'store'), claude, codex)
  const entry = (await archive.list())[0], detail = await archive.detail(entry.key)
  assert.equal(detail.messages.length, 40); assert.equal(detail.truncated, true)
  assert.match(handoffDraft(detail), /İlk özel amaç/)
}))
test('Aynı eski kayıt yenilendikçe yeni ölçüm gibi geçmişe eklenmez', () => {
  const h = new UsageHistory(), now = 1700000000000, reset = new Date(now + 3600000).toISOString()
  for (let i = 0; i < 5; i++) {
    const limits = result(90, now + i * 60000, reset, 'log')
    limits.claude.measuredAt = now - 3600000
    h.record(limits, settings, now + i * 60000)
  }
  const insight = h.insights(now + 300000)[0]
  assert.equal(insight.history.length, 1); assert.equal(insight.history[0].at, now - 3600000)
  assert.equal(insight.ratePerHour, null)
})
