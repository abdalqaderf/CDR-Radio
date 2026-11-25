import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dailyOrderSync } from '../supabase/functions/_shared/daily-order.mjs'

const mode = (settings = {}) => ({ id: 188, name: 'CDR daily - Ghammas Baladi', is_enabled: true,
  type: 'default', source: 'songs', num_songs: 2, schedule_items: [], order: 'sequential', ...settings })
const args = { p_id: '00000000-0000-4000-8000-000000000001', p_revision: 3, p_playlist: '188', p_order: ['1', '2'] }

function provider({ current = mode(), desired = ['2', '1'], lost = false, noWrite = false, reject,
  restrictions = '', files = [{ id: 1, song_id: 'a', length: 5 }, { id: 2, song_id: 'b', length: 5 }] } = {}) {
  let order = [{ id: 10, media: { id: 1 } }, { id: 20, media: { id: 2 } }]
  const events = []
  const sync = dailyOrderSync({ url: 'https://db.test', serviceKey: 'server', provider: {
    AZURACAST_ORIGIN: 'https://provider.test', AZURACAST_STATION_ID: '12', AZURACAST_API_KEY: 'station',
    AZURACAST_DAILY_PLAYLIST_ID: '188', AZURACAST_RECOVERY_PLAYLIST_ID: '176', AZURACAST_PREVIEW_ONLY_MEDIA_IDS: restrictions,
  } }, async (url, request) => {
    const path = url.pathname.split('/').at(-1)
    events.push(path + ' ' + request.method)
    if (path === 'radio_begin_daily_order') return reject ? Response.json(reject, { status: 400 }) : Response.json(desired)
    if (path === 'radio_finish_daily_order') return Response.json(null)
    if (path === 'playlists') return Response.json([current])
    if (path === 'files') return Response.json(files)
    if (path === String(current.id)) return Response.json(current)
    if (path === 'order' && request.method === 'GET') return Response.json(order)
    if (path === 'order' && request.method === 'PUT') {
      assert.equal(url.pathname, '/api/station/12/playlist/188/order')
      const weights = JSON.parse(request.body).order
      assert.deepEqual(weights, { 10: 2, 20: 1 })
      if (!noWrite) order = order.toSorted((a, b) => weights[a.id] - weights[b.id])
      if (lost) throw Error('connection lost')
      return Response.json({ success: true })
    }
    throw Error('unexpected request')
  })
  return { call: (overrides) => sync('admin', { ...args, ...overrides }), events }
}

test('daily reorder uses saved order, verifies a lost write response and is idempotent', async () => {
  const { call, events } = provider({ lost: true })
  const updated = await call()
  assert.equal(updated.status, 200)
  assert.deepEqual(updated.data.tracks, ['2', '1'])
  assert.equal(updated.data.outcome, 'order_confirmed_after_write')
  const noOp = await call()
  assert.equal(noOp.status, 200)
  assert.equal(noOp.data.outcome, 'already_current')
  assert.equal(events.filter((event) => event === 'order PUT').length, 1)
})

test('daily reorder leaves rollback, stale configuration, stale revisions and membership changes untouched', async () => {
  for (const [options, changes, response] of [
    [{ current: mode({ id: 176 }) }, {}, 'daily_changed'],
    [{ current: mode({ id: 189 }) }, {}, 'daily_changed'],
    [{}, { p_order: ['2', '1'] }, 'daily_changed'],
    [{ desired: ['1', '3'] }, {}, 'daily_membership'],
    [{ restrictions: '2' }, {}, 'recording_restricted'],
    [{ files: [{ id: 1, song_id: 'a', length: 5 }] }, {}, 'media_not_ready'],
    [{ reject: { message: 'revision_conflict' } }, {}, 'revision_conflict'],
    [{ reject: { code: '42501' } }, {}, 'admin_required'],
  ]) {
    const { call, events } = provider(options)
    assert.equal((await call(changes)).data.error, response)
    assert.ok(!events.includes('order PUT'))
  }
})

test('a successful provider response without matching read-back keeps the lease and returns uncertainty', async () => {
  const { call, events } = provider({ noWrite: true })
  assert.equal((await call()).data.error, 'provider_unconfirmed')
  assert.ok(!events.includes('radio_finish_daily_order POST'))
})
