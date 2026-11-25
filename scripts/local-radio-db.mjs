import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

export const fixtureAdmin = '00000000-0000-4000-8000-000000000001'
const migrations = new URL('../supabase/migrations/', import.meta.url)

export async function openFixtureDb(directory) {
  const db = new PGlite(directory)
  await db.waitReady
  try {
    await db.transaction(async (tx) => {
      const initialized = await tx.query("select to_regclass('public.fixture_migrations') as present")
      if (!initialized.rows[0].present)
        await tx.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table fixture_migrations(name text primary key);
  `)
      const applied = new Set(
        (await tx.query('select name from fixture_migrations')).rows.map((row) => row.name),
      )
      for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
        if (applied.has(name)) continue
        const sql = (await readFile(new URL(name, migrations), 'utf8')).trim()
        await tx.exec(sql.replace(/^begin;/i, '').replace(/commit;$/i, ''))
        await tx.query('insert into fixture_migrations values ($1)', [name])
      }
      if (initialized.rows[0].present) return
      await tx.query('insert into auth.users values ($1)', [fixtureAdmin])
      await tx.query('insert into radio_private.admin(user_id) values ($1)', [fixtureAdmin])
      await tx.exec(
        'create table fixture_media(id text primary key, title text not null, bytes bytea not null)',
      )
      for (const [name, title] of [
        ['a-low-single', 'إشارة منخفضة'],
        ['b-high-double', 'إشارة مزدوجة'],
      ]) {
        const bytes = await readFile(new URL('../tests/media/' + name + '.mp3', import.meta.url))
        await tx.query('insert into fixture_media values ($1,$2,$3)', [name, title, bytes])
      }
    })
  } catch (error) {
    await db.close()
    throw error
  }
  return db
}

const calls = {
  radio_workspace: [],
  radio_save_draft: ['p_kind', 'p_id', 'p_revision', 'p_doc'],
  radio_save_daily: ['p_id', 'p_revision', 'p_doc'],
  radio_save_collection: ['p_id', 'p_revision', 'p_doc'],
  radio_save_program_edit: ['p_id', 'p_revision', 'p_doc'],
  radio_preview_window: ['p_window', 'p_id'],
  radio_delete_program_draft: ['p_id', 'p_revision'],
}

export async function fixtureRpc(db, name, args, actor = fixtureAdmin) {
  if (!Object.hasOwn(calls, name)) throw Error('unknown_rpc')
  const values = calls[name].map((key) => args[key])
  const params = values.map((_, i) => '$' + (i + 1)).join(',')
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor])
    const result = await tx.query('select public.' + name + '(' + params + ') as value', values)
    return result.rows[0].value
  })
}
