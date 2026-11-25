// Expects { email, password, publicKey } on private stdin. Never print sessions or responses.
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const { email, password, publicKey } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
const url = 'https://krsnebibuqbldyirfzhi.supabase.co'
const client = () => createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
function check(ok, label) { if (!ok) throw Error(label) }
async function signIn(auth) {
  const { data, error } = await auth.signInWithPassword({ email, password })
  check(!error && data.session, 'Password sign-in failed')
  const verified = await auth.getUser(data.session.access_token)
  check(!verified.error && verified.data.user?.id === data.user.id, 'Auth user mismatch')
  return data.session
}
async function rpc(token, name, args, status = 200) {
  const headers = { apikey: publicKey, Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token
  const response = await fetch(url + '/functions/v1/admin-drafts', {
    method: 'POST', headers, body: JSON.stringify({ name, args }), redirect: 'error', signal: AbortSignal.timeout(20000),
  })
  const body = await response.json()
  check(response.status === status, name + ' expected ' + status + ', received ' + response.status)
  return body
}
const first = client(), second = client()
const id = randomUUID()
const doc = {
  title: 'Phase 2 verification fixture ' + id, tracks: ['fixture-b', 'fixture-a'],
  window: { date: '2099-03-06', start: '23:45', end: '00:15', wholeDay: false },
  playback: 'repeat', endPolicy: 'daily', transition: 'finish',
}
let token, attempted = false
try {
  check((await rpc(null, 'radio_workspace', {}, 401)).error === 'admin_required', 'Missing-token check')
  await rpc('invalid-test-token', 'radio_workspace', {}, 401)
  const session = await signIn(first.auth)
  token = session.access_token
  const args = { p_kind: 'program', p_id: id, p_revision: 0, p_doc: doc }
  attempted = true
  check(await rpc(token, 'radio_save_draft', args) === 1, 'Create revision')
  doc.tracks = ['fixture-a', 'fixture-b', 'fixture-a']
  args.p_revision = 1
  check(await rpc(token, 'radio_save_draft', args) === 2, 'Edit revision')
  check((await rpc(token, 'radio_save_draft', args, 409)).error === 'revision_conflict', 'Stale edit')
  const other = await signIn(second.auth)
  check(other.user.id === session.user.id && other.refresh_token !== session.refresh_token, 'Expected independent sessions')
  token = other.access_token
  const row = (await rpc(token, 'radio_workspace', {})).programs.find((p) => p.id === id)
  check(row?.status === 'draft' && row.revision === 2 && JSON.stringify(row.tracks) === JSON.stringify(doc.tracks), 'Persistent ordered read-back')
  check(Date.parse(row.startsAt) === Date.parse('2099-03-06T20:45Z') && Date.parse(row.endsAt) === Date.parse('2099-03-06T21:15Z'), 'Persisted overnight UTC window')
  await rpc(token, 'radio_delete_program_draft', { p_id: id, p_revision: 1 }, 409)
  check(await rpc(token, 'radio_delete_program_draft', { p_id: id, p_revision: 2 }) === true, 'Delete fixture draft')
  check(!(await rpc(token, 'radio_workspace', {})).programs.some((p) => p.id === id), 'Deletion read-back')
  attempted = false
  console.log('Hosted Auth and admin-drafts passed: two independent password sessions, identity verification, anonymous/invalid bearer denial, create, edit, persisted order and UTC window, stale edit/delete, delete and re-read.')
} finally {
  try {
    if (attempted && token) {
      const row = (await rpc(token, 'radio_workspace', {})).programs.find((p) => p.id === id)
      if (row?.title === doc.title && row.status === 'draft')
        await rpc(token, 'radio_delete_program_draft', { p_id: id, p_revision: row.revision })
    }
  } finally {
    await Promise.all([first.auth.signOut({ scope: 'local' }), second.auth.signOut({ scope: 'local' })])
  }
}
