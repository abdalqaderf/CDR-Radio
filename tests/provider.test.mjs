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
