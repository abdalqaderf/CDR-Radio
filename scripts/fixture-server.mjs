import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { openFixtureDb, fixtureRpc } from './local-radio-db.mjs'
import { validMp3, maxUpload } from './mp3.mjs'

async function body(req, limit) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > limit) throw Error('too_large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// Only attached by the explicit loopback dev:fixture command.
export function fixturePlugin() {
  return {
    name: 'local-radio-fixture',
    async configureServer(server) {
      await mkdir('.verification', { recursive: true })
      const db = await openFixtureDb(process.env.RADIO_FIXTURE_DB || '.verification/radio-preview')
      const sessions = new Set()
      server.httpServer?.once('close', () => {
        void db.close()
      })
      server.middlewares.use('/__fixture', async (req, res) => {
        const url = new URL(req.url, 'http://localhost')
        const send = (status, value) => {
          res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(value))
        }
        const localHost = /^(localhost|127\.0\.0\.1):\d+$/.test(req.headers.host ?? '')
        if (!localHost || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress))
          return send(403, { error: 'forbidden' })
        const post = req.method === 'POST'
        if (post && req.headers.origin !== 'http://' + req.headers.host)
          return send(403, { error: 'forbidden' })
        const token = /(?:^|; )radio_fixture=([a-f\d-]+)/.exec(req.headers.cookie ?? '')?.[1]
        try {
          if (post && url.pathname === '/login') {
            const id = randomUUID()
            if (token) sessions.delete(token)
            sessions.add(id)
            res.setHeader(
              'Set-Cookie',
              'radio_fixture=' + id + '; HttpOnly; SameSite=Strict; Path=/__fixture',
            )
            return send(200, {})
          }
          if (!post && req.method === 'GET' && url.pathname === '/marker') {
            const result = await db.query("select bytes from fixture_media where id='a-low-single'")
            res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' })
            return res.end(Buffer.from(result.rows[0].bytes))
          }
          if (!sessions.has(token)) return send(401, { error: 'admin_required' })
          if (post && url.pathname === '/logout') {
            sessions.delete(token)
            res.setHeader(
              'Set-Cookie',
              'radio_fixture=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/__fixture',
            )
            return send(200, {})
          }
          if (post && url.pathname.startsWith('/rpc/')) {
            const args = JSON.parse((await body(req, 65536)).toString('utf8'))
            if (url.pathname === '/rpc/radio_save_draft') {
              const ids = args.p_doc?.tracks
              if (!Array.isArray(ids) || ids.length > 250) throw Error('invalid_tracks')
              const known = await db.query('select id from fixture_media where id=any($1::text[])', [
                ids,
              ])
              if (new Set(ids).size !== known.rows.length) throw Error('invalid_tracks')
            }
            return send(200, await fixtureRpc(db, url.pathname.slice(5), args))
          }
          if (req.method === 'GET' && url.pathname === '/media') {
            return send(
              200,
              (await db.query('select id,title from fixture_media order by title,id')).rows,
            )
          }
          if (post && url.pathname === '/media') {
            const name = url.searchParams.get('name') ?? ''
            const bytes = await body(req, maxUpload)
            if (!validMp3(name, req.headers['content-type'], bytes)) throw Error('invalid_mp3')
            const id = randomUUID()
            await db.query('insert into fixture_media values ($1,$2,$3)', [id, name, bytes])
            return send(201, { id, title: name })
          }
          send(404, { error: 'unknown_route' })
        } catch (e) {
          const known = [
            'invalid_mp3',
            'invalid_tracks',
            'invalid_window',
            'invalid_draft',
            'revision_conflict',
            'too_large',
          ]
          const error = known.includes(e.message) ? e.message : 'invalid_request'
          send(error === 'revision_conflict' ? 409 : error === 'too_large' ? 413 : 400, { error })
        }
      })
    },
  }
}
