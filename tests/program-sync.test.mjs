import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { fixtureAdmin, fixtureRpc, openFixtureDb } from '../scripts/local-radio-db.mjs'
import { providerWindow, syncPlaylist } from '../supabase/functions/_shared/program-sync.mjs'

test('one provider item represents only one UTC start date, including overnight', () => {
  assert.deepEqual(providerWindow('2099-05-01T23:45Z', '2099-05-02T00:15Z'), {
    start_date: '2099-05-01', end_date: '2099-05-01', start_time: 2345, end_time: 15,
    loop_once: false, days: [], prevent_requests: false, reset_queue_at_start: true,
  })
  assert.throws(() => providerWindow('2099-05-01T21:00Z', '2099-05-02T21:00Z'), /unsupported_policy/)
})

test('scheduling protects daily media, recording-specific rights and readiness before writes', async () => {
  const daily = { id: 188, name: 'CDR daily - Ghammas Baladi' }
  const other = { id: 1375, song_id: 'other', length: 8, playlists: [] }
  const protectedFiles = [
    [{ id: 1381, song_id: 'welcome', length: 9, playlists: [{ id: daily.id }] }, 'protected_daily_media'],
    [{ id: 1386, song_id: 'ikh', length: 33, playlists: [] }, 'recording_restricted'],
    [{ id: 1387, song_id: 'processing', length: 0, playlists: [] }, 'media_not_ready'],
  ]
  for (const [file, reason] of protectedFiles) {
    const adapter = { id: '12', protectedPlaylists: ['188'], previewOnly: new Set(['1386']), async programRequest(path, method) {
      assert.equal(method, 'GET')
      if (path === 'playlists') return [daily]
      if (path === 'profile') return { station: { id: 12, timezone: 'UTC' } }
      if (path === 'files') return [other, file]
      assert.fail(path)
    } }
    const job = { id: randomUUID(), action: 'apply', startsAt: '2099-05-01T10:00Z', endsAt: '2099-05-01T11:00Z',
      tracks: [String(other.id), String(file.id)] }
    await assert.rejects(syncPlaylist(adapter, job, AbortSignal.timeout(3000), () => assert.fail()), { message: reason })
  }
})

test('restricted sync reserves atomically, protects uncertainty, and persists only verified outcomes', async () => {
  const db = await openFixtureDb()
  const id = randomUUID()
  const other = randomUUID()
  const doc = {
    title: 'Verification', window: { date: '2099-05-01', wholeDay: false, start: '23:45', end: '00:15' },
    tracks: ['1375', '1376'], playback: 'repeat', endPolicy: 'daily', transition: 'finish',
  }
  const save = (p_id) => fixtureRpc(db, 'radio_save_draft', { p_kind: 'program', p_id, p_revision: 0, p_doc: doc })
  const begin = (program, revision, operation, action, fields = null) => db.query(
    'select public.radio_begin_program_sync($1,$2,$3,$4,$5,$6) as value',
    [fixtureAdmin, program, revision, operation, action, fields],
  ).then(({ rows }) => rows[0].value)
  const finish = (operation, outcome, playlist = '185') => db.query(
    'select public.radio_finish_program_sync($1,$2,$3,$4,$5) as value', [fixtureAdmin, id, operation, outcome, playlist],
  ).then(({ rows }) => rows[0].value)
  const current = async () => (await fixtureRpc(db, 'radio_workspace', {})).programs.find((p) => p.id === id)
  try {
    await save(id)
    await save(other)
    let operation = randomUUID()
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec('set local role authenticated')
      await tx.query('select public.radio_begin_program_sync($1,$2,1,$3,\'publish\',null)', [fixtureAdmin, id, operation])
    }), { code: '42501' })
    assert.equal((await begin(id, 1, operation, 'publish')).action, 'apply')
    await assert.rejects(begin(other, 1, randomUUID(), 'publish'), /sync_busy/)
    await assert.rejects(finish(randomUUID(), 'scheduled'), /revision_conflict/)
    assert.equal((await finish(operation, 'sync_failed')).status, 'sync_failed')
    assert.equal((await current()).pendingAction, 'apply')
    assert.equal((await current()).verifiedAt, null)
    await assert.rejects(begin(id, 3, randomUUID(), 'retry'), /sync_busy/)
    await db.query('update radio_private.programs set sync_lease_until=now() where id=$1', [id])
    await assert.rejects(begin(other, 1, randomUUID(), 'publish'), /sync_busy/)
    operation = randomUUID()
    assert.equal((await begin(id, 3, operation, 'retry')).playlistId, '185')
    await assert.rejects(finish(operation, 'scheduled', '176'), /invalid_outcome/)
    assert.equal((await finish(operation, 'scheduled')).status, 'scheduled')
    await assert.rejects(begin(other, 1, randomUUID(), 'publish'), { code: '23P01' })
    const pendingEdit = { ...doc, tracks: ['1376', '1375'] }
    const saveEdit = (revision) => fixtureRpc(db, 'radio_save_program_edit', {
      p_id: id, p_revision: revision, p_doc: pendingEdit,
    })
    assert.equal(await saveEdit(5), 6)
    await assert.rejects(saveEdit(5), /revision_conflict/)
    assert.deepEqual((await current()).unpublishedEdit, pendingEdit)
    assert.deepEqual((await current()).tracks, doc.tracks)
    assert.equal((await current()).status, 'scheduled')
    operation = randomUUID()
    const edit = await begin(id, 6, operation, 'edit', pendingEdit)
    assert.deepEqual(edit.tracks, ['1376', '1375'])
    assert.deepEqual((await current()).unpublishedEdit, pendingEdit)
    await finish(operation, 'scheduled')
    assert.equal((await current()).unpublishedEdit, null)
    operation = randomUUID()
    assert.equal((await begin(id, 8, operation, 'cancel')).action, 'cancel')
    await finish(operation, 'cancelled')
    assert.equal((await current()).status, 'cancelled')
    assert.ok((await current()).verifiedAt)
    assert.equal((await current()).pendingAction, null)
    assert.equal((await begin(other, 1, randomUUID(), 'publish')).action, 'apply')
  } finally {
    await db.close()
  }
})

test('licensed recitation can be scheduled, a lost create reconciles by UUID, and cancellation clears the owned playlist', async () => {
  const id = randomUUID()
  const signal = AbortSignal.timeout(4000)
  const fixture = { id: 185, name: 'CDR program ' + id, is_enabled: false, schedule_items: [] }
  const files = [1375, 1376].map((track) => ({ id: track, song_id: String(track), playlists: [{ id: 181 }], length: 6 }))
  files[0].path = 'CDR-quran-سورة الإخلاص.mp3'
  const assigned = new Map()
  let exists = false
  let creates = 0
  const adapter = {
    id: '12',
    async programRequest(path, method, body) {
      if (path === 'profile') return { station: { id: 12, timezone: 'UTC' } }
      if (path === 'files') return files
      if (path === 'playlists' && method === 'GET') return exists ? [fixture] : []
      if (path === 'playlists' && method === 'POST') {
        Object.assign(fixture, body)
        creates++
        exists = true
        throw Error('lost response')
      }
      if (path === 'playlist/185') {
        if (method === 'PUT') Object.assign(fixture, body)
        return structuredClone(fixture)
      }
      if (path === 'playlist/185/order') {
        if (method === 'PUT') {
          for (const key of assigned.keys()) assigned.set(key, body.order[key])
        }
        return [...assigned.entries()].sort((a, b) => a[1] - b[1])
          .map(([track]) => ({ id: track, media: { id: track } }))
      }
      if (path.startsWith('file/')) {
        const track = Number(path.slice(5))
        const file = files.find((item) => item.id === track)
        assert.notEqual(track, 1350)
        if (method === 'PUT') {
          assert.ok(body.playlists.includes(181))
          file.playlists = body.playlists.map((p) => ({ id: p }))
          if (body.playlists.includes(185)) assigned.set(track, assigned.size + 1)
          else assigned.delete(track)
        }
        return structuredClone(file)
      }
      assert.fail(path)
    },
  }
  let playlistId = null
  const remember = (value) => { playlistId = value }
  const job = { id, action: 'apply', playlistId, startsAt: '2099-05-01T10:00Z', endsAt: '2099-05-01T11:00Z',
    tracks: ['1376', '1375'] }
  await assert.rejects(syncPlaylist(adapter, job, signal, remember), /lost response/)
  assert.equal(playlistId, null)
  await syncPlaylist(adapter, job, signal, remember)
  assert.equal(creates, 1)
  assert.equal(playlistId, '185')
  assert.equal(fixture.is_enabled, true)
  await syncPlaylist(adapter, { id, action: 'cancel', playlistId }, signal, remember)
  assert.equal(fixture.is_enabled, false)
  assert.deepEqual(fixture.schedule_items, [])
  assert.equal(assigned.size, 0)
  assert.ok(files.every((f) => f.playlists.length === 1 && f.playlists[0].id === 181))
})
