import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openFixtureDb, fixtureAdmin, fixtureRpc } from '../scripts/local-radio-db.mjs'

let db
let directory
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cdr-radio-test-'))
  db = await openFixtureDb(directory)
})
after(async () => {
  await db?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

const windowSpec = (date = '2099-05-01', start = '21:00', end = '22:00', wholeDay = false) => ({
  date,
  start,
  end,
  wholeDay,
})
const document = (window = windowSpec()) => ({
  title: 'مناسبة',
  tracks: ['B', 'A'],
  window,
  playback: 'repeat',
  endPolicy: 'daily',
  transition: 'finish',
})
const read = () => fixtureRpc(db, 'radio_workspace', {})
const save = (kind, id, rev, doc) =>
  fixtureRpc(db, 'radio_save_draft', { p_kind: kind, p_id: id, p_revision: rev, p_doc: doc })
const preview = (window) => fixtureRpc(db, 'radio_preview_window', { p_window: window, p_id: null })
const reserve = (id, operation) =>
  db.query('select radio_reserve_publication($1,$2,1,$3) as acquired', [fixtureAdmin, id, operation])
const settle = (id, operation, outcome, provider) =>
  db.query('select radio_record_publication($1,$2,$3,$4,$5) as changed', [
    fixtureAdmin,
    id,
    operation,
    outcome,
    provider,
  ])

test('anonymous, non-admin and direct table writes are denied', async () => {
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec('set local role anon')
      await tx.query('select public.radio_workspace()')
    }),
    { code: '42501' },
  )
  await assert.rejects(fixtureRpc(db, 'radio_workspace', {}, randomUUID()), { code: '42501' })
  const collection = { p_id: randomUUID(), p_revision: 0, p_doc: { title: 'Verification', tracks: ['A'] } }
  await assert.rejects(fixtureRpc(db, 'radio_save_collection', collection, randomUUID()), { code: '42501' })
  await assert.rejects(db.transaction(async (tx) => {
    await tx.exec('set local role anon')
    await tx.query('select public.radio_save_collection($1,$2,$3)', [
      collection.p_id, collection.p_revision, collection.p_doc,
    ])
  }), { code: '42501' })
  await assert.rejects(
    fixtureRpc(
      db,
      'radio_save_draft',
      { p_kind: 'program', p_id: randomUUID(), p_revision: 0, p_doc: document() },
      randomUUID(),
    ),
    { code: '42501' },
  )
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec('set local role authenticated')
      await tx.query('delete from radio_private.programs')
    }),
    { code: '42501' },
  )
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec('set local role authenticated')
      await tx.query('select radio_reserve_publication($1,$2,1,$3)', [
        fixtureAdmin,
        randomUUID(),
        randomUUID(),
      ])
    }),
    { code: '42501' },
  )
})

test('UTC instants respect Amman across overnight and whole-day windows and historic offsets', async () => {
  await db.exec("set time zone 'America/Los_Angeles'")
  const overnight = await preview(windowSpec('2026-11-24', '23:45', '00:15'))
  assert.equal(new Date(overnight.startsAt).toISOString(), '2026-11-24T20:45:00.000Z')
  assert.equal(new Date(overnight.endsAt).toISOString(), '2026-11-24T21:15:00.000Z')
  const historical = await preview(windowSpec('2019-01-04', '', '', true))
  assert.equal(new Date(historical.startsAt).toISOString(), '2019-01-03T22:00:00.000Z')
  assert.equal(new Date(historical.endsAt).toISOString(), '2019-01-04T22:00:00.000Z')
  for (const [day, start, end] of [
    ['2019-03-29', '2019-03-28T22:00:00.000Z', '2019-03-29T21:00:00.000Z'],
    ['2019-10-25', '2019-10-24T21:00:00.000Z', '2019-10-25T22:00:00.000Z'],
  ]) {
    const result = await preview(windowSpec(day, '', '', true))
    assert.equal(new Date(result.startsAt).toISOString(), start)
    assert.equal(new Date(result.endsAt).toISOString(), end)
  }
  for (const value of [
    windowSpec('2026-02-30'),
    windowSpec('2026-01-01', '24:00', '12:00'),
    windowSpec('2026-01-01', '10:00', '10:00'),
    windowSpec('2019-03-29', '00:15', '02:00'),
  ]) {
    await assert.rejects(preview(value))
  }
})

test('drafts survive database reopen, preserve order, audit changes, and reject stale edits and deletion', async () => {
  const id = randomUUID(),
    playlist = randomUUID()
  assert.equal(await save('program', id, 0, document()), 1)
  const changed = { ...document(), tracks: ['A', 'B', 'A'] }
  assert.equal(await save('program', id, 1, changed), 2)
  await assert.rejects(save('program', id, 1, document()), /revision_conflict/)
  await assert.rejects(save('program', id, 2, { ...changed, tracks: [] }), /invalid_tracks/)
  await assert.rejects(save('program', id, 2, { ...changed, playback: 'unknown' }), /invalid_draft/)
  await save('playlist', playlist, 0, { title: 'يومي', tracks: ['B', 'A'], daily: true })
  await db.close()
  db = await openFixtureDb(directory)
  const workspace = await read()
  assert.equal(workspace.dailyId, playlist)
  assert.deepEqual(workspace.playlists.find((p) => p.id === playlist).tracks, ['B', 'A'])
  assert.deepEqual(workspace.programs.find((p) => p.id === id).tracks, changed.tracks)
  assert.equal(workspace.programs.find((p) => p.id === id).revision, 2)
  assert.equal(
    (
      await db.query('select count(*)::int as n from radio_private.audit_events where entity_id=$1', [
        id,
      ])
    ).rows[0].n,
    2,
  )
  await assert.rejects(
    fixtureRpc(db, 'radio_delete_program_draft', { p_id: id, p_revision: 1 }),
    /revision_conflict/,
  )
  await fixtureRpc(db, 'radio_delete_program_draft', { p_id: id, p_revision: 2 })
  assert.ok(!(await read()).programs.some((p) => p.id === id))
})

test('moving the daily selection invalidates an open editor of the former daily playlist', async () => {
  const original = randomUUID(), replacement = randomUUID()
  const doc = { title: 'يومي', tracks: ['A'], daily: true }
  const revision = await save('playlist', original, 0, doc)
  await save('playlist', replacement, 0, doc)
  await assert.rejects(save('playlist', original, revision, doc), /revision_conflict/)
  assert.equal((await read()).dailyId, replacement)
  assert.equal(await save('playlist', original, revision + 1, { ...doc, daily: false }), 3)
  assert.equal((await read()).dailyId, replacement)
})

test('the daily editor has one working copy, preserves legacy lists, and locks the saved revision while reordering', async () => {
  const before = await read()
  assert.equal(before.dailyEditorId, null)
  const workingId = randomUUID()
  const update = (p_id, p_revision) => fixtureRpc(db, 'radio_save_daily', {
    p_id, p_revision, p_doc: { title: 'البث اليومي', tracks: ['B', 'A'] },
  })
  assert.equal(await update(workingId, 0), 1)
  await assert.rejects(update(randomUUID(), 0), /revision_conflict/)
  const operation = randomUUID()
  const reserve = (actor, revision) => db.query('select radio_begin_daily_order($1,$2,$3,$4) as tracks', [
    actor, revision, workingId, operation,
  ])
  await assert.rejects(reserve(randomUUID(), 1), { code: '42501' })
  await assert.rejects(reserve(fixtureAdmin, 2), /revision_conflict/)
  assert.deepEqual((await reserve(fixtureAdmin, 1)).rows[0].tracks, ['B', 'A'])
  await assert.rejects(update(workingId, 1), /sync_busy/)
  await assert.rejects(reserve(fixtureAdmin, 1), /sync_busy/)
  await db.query('select radio_finish_daily_order($1,$2,$3,$4)', [operation, fixtureAdmin, workingId, 'verified'])
  assert.equal(await update(workingId, 1), 2)
  const after = await read()
  assert.equal(after.dailyEditorId, workingId)
  assert.equal(after.dailyId, before.dailyId)
  assert.deepEqual(after.playlists.filter((playlist) => playlist.id !== workingId), before.playlists)
})

test('overlap reservation, adjacency, retry and uncertain provider outcomes are enforced in PostgreSQL', async () => {
  const first = randomUUID(),
    conflict = randomUUID(),
    adjacent = randomUUID()
  const op = randomUUID(),
    secondOp = randomUUID()
  await save('program', first, 0, document())
  await save('program', conflict, 0, document(windowSpec('2099-05-01', '21:30', '22:30')))
  await save('program', adjacent, 0, document(windowSpec('2099-05-01', '22:00', '23:00')))
  const details = await preview(windowSpec('2099-05-01', '21:00', '21:30'))
  assert.equal(details.conflicts.length, 1)
  const [winner, loser] = await Promise.allSettled([reserve(first, op), reserve(conflict, secondOp)])
  assert.equal(winner.status, 'fulfilled')
  assert.equal(loser.status, 'rejected')
  assert.equal(loser.reason.code, '23P01')
  assert.equal((await reserve(first, op)).rows[0].acquired, false)
  await reserve(adjacent, randomUUID())
  await assert.rejects(settle(first, op, 'scheduled', null), /missing_provider_readback/)
  await settle(first, op, 'sync_failed', null)
  await assert.rejects(reserve(conflict, secondOp), { code: '23P01' })
  await settle(first, op, 'scheduled', 'test-playlist')
  await assert.rejects(settle(first, op, 'cancelled', 'other'), /provider_identity_mismatch/)
  assert.equal((await settle(first, op, 'scheduled', 'test-playlist')).rows[0].changed, false)
  await settle(first, op, 'cancelled', 'test-playlist')
  assert.equal((await read()).programs.find((p) => p.id === first).status, 'cancelled')
  await assert.rejects(settle(first, op, 'scheduled', 'test-playlist'), /invalid_transition/)
})
