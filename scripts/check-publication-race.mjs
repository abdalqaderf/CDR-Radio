import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import EmbeddedPostgres from '../.verification/native-pg/node_modules/embedded-postgres/dist/index.js'

// Optional native test. Own the cluster and never accept a database URL.
const portProbe = createServer()
await new Promise((resolve, reject) => portProbe.once('error', reject).listen(0, '127.0.0.1', resolve))
const port = portProbe.address().port
await new Promise((resolve) => portProbe.close(resolve))
const pg = new EmbeddedPostgres({
  databaseDir: await mkdtemp(join(tmpdir(), 'cdr-native-postgres-')),
  password: randomUUID(),
  port,
  persistent: false,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog() {},
})
const writer = pg.getPgClient('postgres', '127.0.0.1')
const contender = pg.getPgClient('postgres', '127.0.0.1')
try {
  await pg.initialise()
  await pg.start()
  await Promise.all([writer.connect(), contender.connect()])
  await writer.query(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select current_setting('request.jwt.claim.sub',true)::uuid $$;
  `)
  const migrations = new URL('../supabase/migrations/', import.meta.url)
  for (const name of (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort())
    await writer.query(await readFile(new URL(name, migrations), 'utf8'))
  const actor = randomUUID(), first = randomUUID(), second = randomUUID(), operation = randomUUID()
  await writer.query('insert into auth.users values ($1)', [actor])
  await writer.query('insert into radio_private.admin(user_id) values ($1)', [actor])
  await writer.query('set role authenticated')
  await writer.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
  for (const id of [first, second]) {
    await writer.query("select radio_save_draft('program',$1,0,$2)", [id, {
      title: 'Concurrent fixture', tracks: ['A'], window: { date: '2099-03-06', wholeDay: true },
      playback: 'repeat', endPolicy: 'daily', transition: 'finish',
    }])
  }
  await writer.query('set role service_role')
  await contender.query("set role service_role; set statement_timeout = '10s'")
  const reserve = 'select radio_reserve_publication($1,$2,1,$3) as acquired'
  const pid = (await contender.query('select pg_backend_pid() as pid')).rows[0].pid
  await writer.query('begin')
  await writer.query(reserve, [actor, first, operation])
  const rejected = assert.rejects(contender.query(reserve, [actor, second, randomUUID()]), { code: '23P01' })
  let blocked = false
  try {
    for (let i = 0; i < 80 && !blocked; i++) {
      const result = await writer.query('select pg_backend_pid() = any(pg_blocking_pids($1)) as blocked', [pid])
      blocked = result.rows[0].blocked
      if (!blocked) await delay(25)
    }
  } finally {
    await writer.query('commit')
    await rejected
  }
  assert.ok(blocked, 'PostgreSQL observed the contender waiting on the uncommitted reservation')
  assert.equal((await contender.query(reserve, [actor, first, operation])).rows[0].acquired, false)
  const version = (await writer.query('show server_version')).rows[0].server_version
  console.log('PostgreSQL ' + version + ': observed lock wait, overlap rejection (23P01), idempotent retry.')
} finally {
  await Promise.allSettled([writer.end(), contender.end()])
  await pg.stop()
}
