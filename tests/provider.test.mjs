import assert from 'node:assert/strict'
import test from 'node:test'
import { probe } from '../scripts/verify-provider.mjs'
import { AzuraCastAdapter } from '../supabase/functions/_shared/azuracast.mjs'

const config = {
  AZURACAST_ORIGIN: 'https://station.invalid',
  AZURACAST_STATION_ID: '17',
  AZURACAST_API_KEY: 'unit-test-marker',
}

function responses(anonymousStatus = 403, stationId = 17) {
  return [
    new Response(null, { status: anonymousStatus }),
    Response.json([]),
    Response.json({ station: { id: stationId, listen_url: 'https://stream.invalid/radio.mp3' } }),
    new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mpeg' } }),
  ]
}

test('rejects incomplete or unsafe configuration before any request', async () => {
  for (const changes of [
    { AZURACAST_API_KEY: '' }, { AZURACAST_ORIGIN: 'http://station.invalid' },
    { AZURACAST_ORIGIN: 'https://user:password@station.invalid' },
    { AZURACAST_STATION_ID: '../other' },
  ]) {
    let calls = 0
    await assert.rejects(probe({ ...config, ...changes }, () => { calls++ }))
    assert.equal(calls, 0)
  }
})

test('only the private same-origin read receives the key and redirects are refused', async () => {
  const queue = responses()
  const calls = []
  const logs = []
  await probe(config, (url, options) => {
    calls.push({ url, ...options })
    return queue.shift()
  }, line => logs.push(line))
  assert.equal(calls.length, 4)
  assert.ok(calls.every(call => call.redirect === 'error'))
  assert.deepEqual(calls.filter(call => call.headers.Authorization).map(call => call.url.href),
    ['https://station.invalid/api/station/17/playlists'])
  assert.equal(calls[1].headers.Authorization, 'Bearer ' + config.AZURACAST_API_KEY)
  assert.equal(calls[3].url.host, 'stream.invalid')
  assert.ok(!logs.join(' ').includes(config.AZURACAST_API_KEY))
})

test('public playlist reads and incorrect station identity cannot pass', async () => {
  for (const queue of [responses(200), responses(403, 18)]) {
    await assert.rejects(probe(config, () => queue.shift(), () => {}), /inconclusive|mismatch/)
  }
})

test('upload preserves every byte across encoding chunks and requires a processed read-back', async () => {
  const bytes = Uint8Array.from({ length: 100001 }, (_, i) => i % 251)
  let savedPath, duration = 6
  const adapter = new AzuraCastAdapter(config, (url, options) => {
    assert.equal(url.origin, config.AZURACAST_ORIGIN)
    assert.equal(options.redirect, 'error')
    if (options.method === 'POST') {
      assert.equal(url.pathname, '/api/station/17/files')
      const payload = JSON.parse(options.body)
      savedPath = payload.path
      assert.ok(savedPath.endsWith('-marker.mp3'))
      assert.deepEqual(Buffer.from(payload.file, 'base64'), Buffer.from(bytes))
      return Response.json({ id: 42 })
    }
    assert.equal(url.pathname, '/api/station/17/file/42')
    return Response.json({ id: 42, path: savedPath, size: bytes.length, length: duration })
  })
  assert.equal((await adapter.upload('marker.mp3', bytes)).id, '42')
  duration = 0
  await assert.rejects(adapter.upload('marker.mp3', bytes), /processing unconfirmed/)
})

test('private previews use the stored media path with a bounded response', async () => {
  const path = 'CDR-quran-سورة الإخلاص.mp3'
  let bytes = new Uint8Array([10, 20, 30])
  const adapter = new AzuraCastAdapter(config, (url, options) => {
    assert.equal(url.origin, config.AZURACAST_ORIGIN)
    assert.equal(options.headers.Authorization, 'Bearer ' + config.AZURACAST_API_KEY)
    if (url.pathname.endsWith('/file/42')) return Response.json({ id: 42, path, size: 3 })
    assert.equal(url.pathname, '/api/station/17/files/download')
    assert.equal(url.searchParams.get('file'), path)
    return new Response(bytes)
  })
  assert.equal(await adapter.previewMedia('42', 2), null)
  assert.deepEqual(new Uint8Array(await new Response(await adapter.previewMedia('42', 3)).arrayBuffer()), bytes)
  bytes = new Uint8Array(4)
  await assert.rejects(new Response(await adapter.previewMedia('42', 3)).arrayBuffer(), /exceeded stored size/)
})

test('upload reconciliation recovers just the original provider media after an uncertain response', async () => {
  const key = 'f7e0ef28-4a6c-41a9-9d3e-92e25b7c2a9e'
  const path = key + '-marker.mp3'
  const bytes = new Uint8Array(62)
  let file
  let writes = 0
  const adapter = new AzuraCastAdapter(config, (url, options) => {
    if (options.method === 'POST') {
      writes++
      assert.equal(JSON.parse(options.body).path, path)
      file = { id: 42, path, size: bytes.length, length: 0 }
      throw Error('response lost')
    }
    return Response.json(url.pathname.endsWith('/files') ? file ? [file] : [] : file)
  })
  await assert.rejects(adapter.upload('marker.mp3', bytes, key), /response lost/)
  assert.equal(await adapter.uploadedTrack(path, bytes.length), null)
  file.length = 6
  for (const expected of [await adapter.uploadedTrack(path, bytes.length), await adapter.upload('marker.mp3', bytes, key)])
    assert.equal(expected.id, '42')
  assert.equal(await adapter.uploadedTrack(path, bytes.length + 1), null)
  assert.equal(writes, 1)
})

test('daily playback reports only a verified, enabled fallback order', async () => {
  const daily = { id: 176, name: 'Daily', is_enabled: true, type: 'default', source: 'songs',
    order: 'sequential', num_songs: 2, schedule_items: [] }
  let candidates = [daily]
  const adapter = new AzuraCastAdapter({ ...config, AZURACAST_DAILY_PLAYLIST_ID: '90', AZURACAST_RECOVERY_PLAYLIST_ID: '176' }, (url, options) => {
    assert.equal(options.method, 'GET')
    if (url.pathname.endsWith('/playlists')) return Response.json(candidates)
    if (url.pathname.endsWith('/order')) return Response.json([{ media: { id: 23 } }, { media: { id: 24 } }])
    return Response.json(daily)
  })
  assert.deepEqual((await adapter.dailyPlayback()).tracks, ['23', '24'])
  assert.equal((await adapter.dailyPlayback()).canReorder, false)
  candidates = [daily, { ...daily, id: 45, name: 'Another fallback' }]
  assert.equal(await adapter.dailyPlayback(), null)
})
