import { readFile } from 'node:fs/promises'
import { request } from 'node:https'
import { createClient } from '@supabase/supabase-js'
import { AzuraCastAdapter } from '../supabase/functions/_shared/azuracast.mjs'

// Private stdin contains the existing administrator credentials. Use the linked demo only.
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const { email, password } = JSON.parse(Buffer.concat(chunks).toString())
const base = 'https://krsnebibuqbldyirfzhi.supabase.co'
const key = process.env.RADIO_HOSTED_PUBLISHABLE_KEY
const client = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } })
const station = new AzuraCastAdapter(process.env)
if (station.id !== '12' || station.origin.origin !== 'https://quintastream.cl') throw Error('Station mismatch')
const endpoint = base + '/functions/v1/admin-media'
const headers = { apikey: key, Origin: 'http://127.0.0.1:5173' }
async function confirmExisting(record, original) {
  // Editing transitions adds ID3 tags to the test markers on this installation.
  if (!(record.length > 0) || record.size < original.length || record.size > original.length + 131072)
    return false
  const url = new URL('/api/station/12/files/download', station.origin)
  url.searchParams.set('file', record.path)
  const response = await station.get(url, { Authorization: 'Bearer ' + station.key })
  if (!response.ok) return false
  const saved = Buffer.from(await response.arrayBuffer())
  return saved.length === record.size && saved.includes(original)
}
// Read an early 413 even if the gateway closes while the request body is in flight.
function upload(name, bytes) {
  return new Promise((resolve, reject) => {
    const req = request(endpoint + '?name=' + encodeURIComponent(name), {
      method: 'POST', agent: false, signal: AbortSignal.timeout(90000),
      headers: { ...headers, 'Content-Type': 'audio/mpeg', 'Content-Length': bytes.length },
    }, async (response) => {
      try {
        const parts = []
        for await (const chunk of response) parts.push(chunk)
        resolve({ status: response.statusCode, json: () => JSON.parse(Buffer.concat(parts).toString()) })
      } catch { reject(Error('Upload response interrupted')) }
    })
    req.on('error', err => reject(Error('Upload transport failed: ' + err.name)))
    req.end(bytes)
  })
}
try {
  const anonymous = await fetch(endpoint, { headers, redirect: 'error' })
  if (anonymous.status !== 401) throw Error('Anonymous denial unconfirmed, HTTP ' + anonymous.status)
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw Error('Existing admin sign-in failed')
  headers.Authorization = 'Bearer ' + data.session.access_token
  const list = await fetch(endpoint, { headers, redirect: 'error' })
  if (!list.ok || !Array.isArray(await list.json())) throw Error('Hosted library failed, HTTP ' + list.status)
  for (const [file, expected] of [
    ['tests/media/a-low-single.mp3', 201], ['tests/media/b-high-double.mp3', 201],
    ['.verification/upload-limits/at-limit.mp3', 201], ['.verification/upload-limits/over-limit.mp3', 413],
  ]) {
    const bytes = await readFile(file)
    const name = 'CDR-Phase0-' + file.split('/').pop()
    const matching = async () => (await station.media('files')).filter(item => item.path.endsWith('-' + name))
    const existing = await matching()
    if (existing.length && expected === 201) {
      if (existing.length !== 1 || !(await confirmExisting(existing[0], bytes)))
        throw Error('Prior upload requires reconciliation: ' + name)
      console.log(name, 'previously present, id', existing[0].id)
      continue
    }
    if (existing.length) throw Error('Unexpected prior oversized upload')
    console.log('Sending', name, bytes.length)
    const res = await upload(name, bytes)
    console.log(name, bytes.length, 'bytes, HTTP', res.status)
    const stored = await matching()
    if (res.status !== expected) throw Error('Unexpected upload result, matching provider records: ' + stored.length)
    if (expected === 413) {
      if (stored.length || (await res.json()).error !== 'too_large') throw Error('Boundary rejection unconfirmed')
    } else {
      const saved = await res.json()
      if (stored.length !== 1 || String(stored[0].id) !== saved.id || stored[0].size !== bytes.length || !(stored[0].length > 0))
        throw Error('Independent processing read-back failed')
      console.log('Verified media', saved.id, 'duration', stored[0].length)
    }
  }
} finally { await client.auth.signOut({ scope: 'local' }) }
