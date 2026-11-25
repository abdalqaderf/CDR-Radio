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
    })
    if (request.method === 'GET') return Response.json(await adapter.library(), { headers })
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
    const name = new URL(request.url).searchParams.get('name') || ''
    if (!validMp3(name, request.headers.get('content-type'), data)) return fail(400, 'invalid_mp3')
    try {
      return Response.json(await adapter.upload(name, data), { status: 201, headers })
    } catch {
      return fail(502, 'upload_unconfirmed')
    }
  } catch { return fail(503, 'unavailable') }
})
