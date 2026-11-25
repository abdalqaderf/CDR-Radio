import { AzuraCastAdapter } from '../_shared/azuracast.mjs'
import { maxUpload, validMp3 } from '../_shared/mp3.mjs'
import { webAccess } from '../_shared/web-origin.mjs'

Deno.serve(async (request) => {
  const web = webAccess(request, Deno.env.get('RADIO_WEB_ORIGIN'), Deno.env.get('RADIO_DEPLOYED_ORIGIN'))
  const headers = {
    ...web.headers,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers })
  if (!web.configured) return fail(503, 'unavailable')
  if (!web.allowed) return fail(403, 'forbidden')
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (!['GET', 'POST'].includes(request.method)) return fail(405, 'invalid_request')
  const bearer = request.headers.get('authorization')
  if (!bearer || !/^Bearer [^\s]+$/i.test(bearer) || bearer.length > 16384)
    return fail(401, 'admin_required')
  try {
    // PostgREST verifies the JWT. radio_workspace checks the existing admin allowlist.
    const access = await fetch(new URL('/rest/v1/rpc/radio_workspace', Deno.env.get('SUPABASE_URL')), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { Authorization: bearer, apikey: Deno.env.get('SUPABASE_ANON_KEY') || '', 'Content-Type': 'application/json' },
      body: '{}',
    })
    await access.body?.cancel()
    if ([401, 403].includes(access.status)) return fail(access.status, 'admin_required')
    if (!access.ok) return fail(503, 'unavailable')
    const adapter = new AzuraCastAdapter({
      AZURACAST_ORIGIN: Deno.env.get('AZURACAST_ORIGIN'),
      AZURACAST_STATION_ID: Deno.env.get('AZURACAST_STATION_ID'),
      AZURACAST_API_KEY: Deno.env.get('AZURACAST_API_KEY'),
      AZURACAST_DAILY_PLAYLIST_ID: Deno.env.get('AZURACAST_DAILY_PLAYLIST_ID'),
      AZURACAST_RECOVERY_PLAYLIST_ID: Deno.env.get('AZURACAST_RECOVERY_PLAYLIST_ID'),
      AZURACAST_PREVIEW_ONLY_MEDIA_IDS: Deno.env.get('AZURACAST_PREVIEW_ONLY_MEDIA_IDS'),
    })
    const params = new URL(request.url).searchParams
    const name = params.get('name') || ''
    const key = params.get('key')
    if (key !== null && !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(key))
      return fail(400, 'invalid_request')
    if (request.method === 'GET') {
      if (params.has('daily')) return Response.json(await adapter.dailyPlayback(), { headers })
      if (key) {
        const size = Number(params.get('size'))
        if (!/\.mp3$/i.test(name) || name.length > 180 || /[\\/:*?"<>|\p{Cc}\p{Cf}]/u.test(name) ||
          !Number.isSafeInteger(size) || size <= 0 || size > maxUpload)
          return fail(400, 'invalid_request')
        const track = await adapter.uploadedTrack(key + '-' + name, size)
        return Response.json(track, { status: track ? 200 : 202, headers })
      }
      const id = params.get('preview')
      if (id === null) return Response.json(await adapter.library(), { headers })
      if (!/^[1-9]\d{0,14}$/.test(id)) return fail(400, 'invalid_request')
      const stream = await adapter.previewMedia(id, maxUpload)
      if (!stream) return fail(404, 'preview_unavailable')
      return new Response(stream, { headers: { ...headers, 'Content-Type': 'audio/mpeg', 'X-Content-Type-Options': 'nosniff' } })
    }
    const reader = request.body?.getReader()
    if (!reader) return fail(400, 'invalid_mp3')
    const bytes = new Uint8Array(maxUpload)
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (size + value.length > maxUpload) {
          // The gateway can still be forwarding the final chunk. Waiting for
          // cancellation here can withhold the rejection from the client.
          void reader.cancel().catch(() => {})
          return fail(413, 'too_large')
        }
        bytes.set(value, size)
        size += value.length
      }
    } finally { reader.releaseLock() }
    const data = bytes.subarray(0, size)
    if (!validMp3(name, request.headers.get('content-type'), data)) return fail(400, 'invalid_mp3')
    try {
      const track = await adapter.upload(name, data, key)
      if (track) return Response.json(track, { status: 201, headers })
      return key ? Response.json(null, { status: 202, headers }) : fail(502, 'upload_unconfirmed')
    } catch {
      return fail(502, 'upload_unconfirmed')
    }
  } catch { return fail(503, 'unavailable') }
})
