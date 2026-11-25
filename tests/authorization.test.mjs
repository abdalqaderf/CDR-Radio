import assert from 'node:assert/strict'
import test from 'node:test'
import { draftsHandler } from '../supabase/functions/_shared/drafts-handler.mjs'

const config = {
  url: 'https://local.invalid',
  publicKey: 'public-test-key',
  origin: 'http://localhost:5173',
}
const bearer = 'Bearer example-test-session'
function req(args = {}, opts = {}) {
  return new Request('https://edge.invalid', {
    method: 'POST',
    headers: {
      origin: config.origin,
      authorization: bearer,
      'Content-Type': 'application/json',
      ...opts,
    },
    body: JSON.stringify({ name: 'radio_workspace', args }),
  })
}
test('edge rejects unknown origins, missing token, oversized bodies and unlisted operations', async () => {
  let calls = 0
  const handler = draftsHandler(config, () => {
    calls++
  })
  assert.equal((await handler(req({}, { origin: 'https://wrong.invalid' }))).status, 403)
  assert.equal((await handler(req({}, { authorization: '' }))).status, 401)
  assert.equal((await handler(req({ value: 'x'.repeat(66000) }))).status, 413)
  const unknown = new Request(req(), {
    body: JSON.stringify({ name: 'radio_reserve_publication', args: {} }),
  })
  assert.equal((await handler(unknown)).status, 400)
  assert.equal(calls, 0)
})
test('edge rejects an Auth-rejected bearer before any database call', async () => {
  const calls = []
  const handler = draftsHandler(config, (url) => {
    calls.push(url.pathname)
    return new Response(null, { status: 401 })
  })
  assert.equal((await handler(req())).status, 401)
  assert.deepEqual(calls, ['/auth/v1/user'])
})
test('edge preflight allows the configured deployment and development origins only', async () => {
  const deployedOrigin = 'https://radio.example.invalid'
  const handler = draftsHandler({ ...config, deployedOrigin }, () => assert.fail('Unexpected upstream call'))
  for (const origin of [config.origin, deployedOrigin]) {
    const res = await handler(new Request('https://edge.invalid', { method: 'OPTIONS', headers: { Origin: origin } }))
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('access-control-allow-origin'), origin)
    assert.equal(res.headers.get('vary'), 'Origin')
  }
  for (const origin of [deployedOrigin + '.other.invalid', 'http://radio.example.invalid', 'null']) {
    const res = await handler(req({}, { origin }))
    assert.equal(res.status, 403)
    assert.equal(res.headers.get('access-control-allow-origin'), null)
  }
  const anonymous = await handler(req({}, { origin: deployedOrigin, authorization: '' }))
  assert.equal(anonymous.status, 401)
  assert.equal(anonymous.headers.get('access-control-allow-origin'), deployedOrigin)
})
test('edge retains the caller identity, honors SQL denials, and redacts upstream errors', async () => {
  for (const [status, detail, expected] of [
    [200, {}, 200],
    [403, { code: '42501', message: 'private' }, 403],
    [409, { message: 'revision_conflict' }, 409],
    [500, { message: 'private' }, 503],
  ]) {
    const calls = []
    const handler = draftsHandler(config, (url, opts) => {
      calls.push(url.pathname)
      assert.equal(opts.headers.Authorization, bearer)
      assert.equal(opts.redirect, 'error')
      return url.pathname === '/auth/v1/user'
        ? Response.json({ id: 'local-admin' })
        : Response.json(detail, { status })
    })
    const res = await handler(req())
    assert.equal(res.status, expected)
    assert.ok(!(await res.text()).includes('private'))
    assert.deepEqual(calls, ['/auth/v1/user', '/rest/v1/rpc/radio_workspace'])
  }
})
