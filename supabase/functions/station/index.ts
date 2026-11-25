import { AzuraCastAdapter } from '../_shared/azuracast.mjs'
import { webAccess } from '../_shared/web-origin.mjs'

Deno.serve(async (request) => {
  const { allowed, headers } = webAccess(request, Deno.env.get('RADIO_WEB_ORIGIN'), Deno.env.get('RADIO_DEPLOYED_ORIGIN'))
  if (!allowed) return new Response(null, { status: 403, headers })
  if (request.method !== 'GET') return new Response(null, { status: 405, headers })
  try {
    const adapter = new AzuraCastAdapter({
      AZURACAST_ORIGIN: Deno.env.get('AZURACAST_ORIGIN'),
      AZURACAST_STATION_ID: Deno.env.get('AZURACAST_STATION_ID'),
    })
    return Response.json(await adapter.snapshot(), { headers })
  } catch {
    return Response.json({ error: 'station_unavailable' }, { status: 503, headers })
  }
})
