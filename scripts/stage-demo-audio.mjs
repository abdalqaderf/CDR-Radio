import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as wait } from 'node:timers/promises'
import { AzuraCastAdapter } from '../supabase/functions/_shared/azuracast.mjs'
import { demoDailyPlaylist } from '../supabase/functions/_shared/media-labels.mjs'
import { maxUpload, validMp3 } from '../supabase/functions/_shared/mp3.mjs'

// Run from the project root with the existing private station configuration.
const action = process.argv[2]
assert.ok(['stage', 'activate', 'rollback'].includes(action), 'Choose stage, activate or rollback')
const adapter = new AzuraCastAdapter(process.env)
assert.equal(adapter.origin.origin, 'https://quintastream.cl')
assert.equal(adapter.id, '12')
const api = (route, method = 'GET', body) => adapter.programRequest(route, method, body, AbortSignal.timeout(10000))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const out = 'output/demo-audio/'
const catalog = JSON.parse(await readFile(out + 'catalog.json', 'utf8'))
const evidenceDir = '.verification/brand-audit'
const receiptPath = evidenceDir + '/station-content.json'
await mkdir(evidenceDir, { recursive: true })
let receipt
try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')) } catch (error) {
  if (error.code !== 'ENOENT') throw error
  receipt = { tracks: {}, playlists: {} }
}
const record = () => writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n')
const baseline = 'playlist/176'
const order = (id) => api('playlist/' + id + '/order')
const ids = (rows) => rows.map((row) => row.media.id)
const headers = { Authorization: 'Bearer ' + adapter.key }
const download = async (file) => {
  const url = new URL('/api/station/12/files/download', adapter.origin)
  url.searchParams.set('file', file.path)
  const response = await adapter.get(url, headers)
  assert.ok(response.ok)
  return Buffer.from(await response.arrayBuffer())
}

async function checkBaseline(enabled) {
  const original = JSON.parse(await readFile('.verification/station-backup/daily-176/manifest.json', 'utf8'))
  const [playlist, ordered] = await Promise.all([api(baseline), order(176)])
  assert.equal(playlist.is_enabled, enabled)
  assert.equal(playlist.order, 'sequential')
  assert.deepEqual(playlist.schedule_items, [])
  assert.deepEqual(ids(ordered), original.files.map((file) => file.id))
  for (const file of original.files) {
    const metadata = await api('file/' + file.id)
    assert.equal(sha(await download(metadata)), file.sha256)
  }
}

const names = { daily: demoDailyPlaylist, quran: 'CDR collection - Quran' }
async function checkPlaylist(group, enabled) {
  const id = receipt.playlists[group]
  assert.ok(Number.isInteger(id) && id !== 176)
  const [playlist, ordered] = await Promise.all([api('playlist/' + id), order(id)])
  assert.deepEqual([playlist.name, playlist.is_enabled, playlist.type, playlist.order, playlist.schedule_items],
    [names[group], enabled, 'default', 'sequential', []])
  assert.deepEqual(ids(ordered), catalog[group].map(({ file }) => receipt.tracks[file].id))
}

if (action === 'stage') {
  await checkBaseline(true)
  const payloads = await Promise.all(Object.values(catalog).flat().map(async ({ file, title }) => {
    const bytes = await readFile(out + file)
    const name = 'CDR-' + file.split('/')[0] + '-' + title + '.mp3'
    assert.ok(validMp3(name, 'audio/mpeg', bytes), file)
    return { file, name, bytes }
  }))
  const files = await api('files')
  const used = files.reduce((total, file) => total + (Number(file.size) || 0), 0)
  const newBytes = payloads.filter(({ name }) => !files.some((file) => file.path === name))
    .reduce((total, file) => total + file.bytes.length, 0)
  assert.ok(used + newBytes < 1_000_000_000, 'Comienza AutoDJ storage budget')
  for (const { file, name, bytes } of payloads) {
    const stored = files.filter((item) => item.path === name)
    assert.ok(stored.length <= 1)
    const uploaded = stored[0] || await adapter.media('files', { path: name, file: bytes.toString('base64') })
    const media = await api('file/' + uploaded.id)
    assert.ok(Number.isInteger(media.id) && media.length > 0 && media.size <= maxUpload)
    assert.equal(media.path, name)
    assert.equal(sha(await download(media)), sha(bytes))
    receipt.tracks[file] = { id: media.id, seconds: media.length, bytes: media.size, sha256: sha(bytes) }
    await record()
    console.log('Verified media', media.id, file, media.length, 'seconds')
  }
  for (const group of Object.keys(names)) {
    const candidates = (await api('playlists')).filter((playlist) => playlist.name === names[group])
    assert.ok(candidates.length <= 1)
    const target = candidates[0] || await api('playlists', 'POST', {
      name: names[group], type: 'default', source: 'songs', order: 'sequential',
      is_enabled: false, avoid_duplicates: false, backend_options: [], schedule_items: [],
    })
    assert.ok(target.id !== 176 && !target.is_enabled && target.schedule_items.length === 0)
    receipt.playlists[group] = target.id
    await record()
    const desired = catalog[group].map(({ file }) => receipt.tracks[file].id)
    for (const id of desired) {
      const file = await api('file/' + id)
      assert.ok(file.playlists.every((playlist) => Number(playlist.id) === target.id))
      if (!file.playlists.length) await api('file/' + id, 'PUT', { playlists: [target.id] })
    }
    const ordered = await order(target.id)
    assert.deepEqual(ids(ordered).toSorted(), desired.toSorted())
    if (JSON.stringify(ids(ordered)) !== JSON.stringify(desired))
      await api('playlist/' + target.id + '/order', 'PUT', {
        order: Object.fromEntries(ordered.map((row) => [row.id, desired.indexOf(row.media.id) + 1])),
      })
    await checkPlaylist(group, false)
  }
  await checkBaseline(true)
  for (const { file } of catalog.quran) {
    const stored = receipt.tracks[file]
    assert.equal(sha(await download(await api('file/' + stored.id))), stored.sha256)
  }
  receipt.stagedAt = new Date().toISOString()
  await record()
  console.log('Verified both playlists while disabled. Baseline 176 stayed enabled.', receipt.playlists)
}

if (action !== 'stage') {
  assert.ok(receipt.stagedAt)
  const daily = 'playlist/' + receipt.playlists.daily
  const safeToSwitch = async () => {
    const playlists = await api('playlists')
    assert.ok(playlists.every((playlist) => !playlist.is_enabled || playlist.id === 176 ||
      playlist.id === receipt.playlists.daily || (!playlist.num_songs && !playlist.schedule_items.length &&
        playlist.type === 'default' && playlist.source === 'songs')), 'An unrelated playlist is enabled')
  }
  const restore = async () => {
    await api(baseline, 'PUT', { is_enabled: true })
    await api(daily, 'PUT', { is_enabled: false })
    await checkBaseline(true)
    await checkPlaylist('daily', false)
    receipt.restoredAt = new Date().toISOString()
    await record()
  }
  if (action === 'rollback') {
    await restore()
  } else {
    await safeToSwitch()
    await checkBaseline(true)
    await checkPlaylist('daily', false)
    await checkPlaylist('quran', false)
    assert.ok((await adapter.snapshot()).online)
    try {
      await api(daily, 'PUT', { is_enabled: true })
      await checkPlaylist('daily', true)
      await api(baseline, 'PUT', { is_enabled: false })
      await checkBaseline(false)
      let state
      for (let attempt = 0; attempt < 15; attempt++) {
        const now = await adapter.get(new URL('/api/nowplaying/12', adapter.origin)).then((r) => r.json())
        if (now.is_online && now.now_playing?.playlist === names.daily) {
          state = { current: now.now_playing.song?.title, next: now.playing_next?.song?.title }
          const mount = await adapter.get(new URL((await adapter.snapshot()).url))
          try {
            assert.ok(mount.ok && mount.headers.get('content-type')?.startsWith('audio/'))
            const reader = mount.body.getReader()
            try { assert.ok((await reader.read()).value?.byteLength) } finally { await reader.cancel() }
          } finally { if (!mount.body.locked) await mount.body.cancel() }
          break
        }
        await wait(4000)
      }
      assert.ok(state, 'No confirmed daily playout before deadline')
      receipt.activatedAt = new Date().toISOString()
      receipt.nowPlaying = state
      await record()
      console.log('New daily playlist on air', receipt.playlists.daily, state)
    } catch (error) {
      await restore()
      throw error
    }
  }
}
