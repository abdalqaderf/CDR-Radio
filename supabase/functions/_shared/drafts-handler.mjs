import { webAccess } from './web-origin.mjs'

const operations = new Set([
  'radio_workspace',
  'radio_preview_window',
  'radio_save_draft',
  'radio_save_daily',
  'radio_save_collection',
  'radio_save_program_edit',
  'radio_delete_program_draft',
])
const safeErrors = new Set(['invalid_draft', 'invalid_tracks', 'invalid_window', 'revision_conflict', 'sync_busy'])

async function requestBody(request) {
  const reader = request.body?.getReader()
  if (!reader) throw Error('invalid_request')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0,
    text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) {
        await reader.cancel()
        throw Error('too_large')
      }
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally {
    reader.releaseLock()
  }
}

// Auth's /user endpoint validates the bearer. PostgREST receives that same bearer,
// so the RPC checks the verified auth.uid() under the caller's database role.
export function draftsHandler({ url, publicKey, origin, deployedOrigin, sync, dailyOrder }, requestService = fetch) {
  return async (request) => {
    const access = webAccess(request, origin, deployedOrigin)
    const headers = {
      ...access.headers,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
    const send = (status, error) => Response.json({ error }, { status, headers })
    if (!url || !publicKey || !access.configured) return send(503, 'unavailable')
    if (!access.allowed) return send(403, 'forbidden')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return send(405, 'invalid_request')
    const bearer = request.headers.get('authorization') ?? ''
    if (bearer.length > 16384 || !/^Bearer [^\s]+$/i.test(bearer)) return send(401, 'admin_required')
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return send(415, 'invalid_request')
    if (Number(request.headers.get('content-length')) > 65536) return send(413, 'too_large')
    let payload
    try {
      payload = await requestBody(request)
    } catch (e) {
      return send(e.message === 'too_large' ? 413 : 400, 'invalid_request')
    }
    if (
      !(operations.has(payload?.name) || (sync && payload?.name === 'program_sync') ||
        (dailyOrder && payload?.name === 'daily_order')) ||
      !payload.args ||
      typeof payload.args !== 'object' ||
      Array.isArray(payload.args)
    )
      return send(400, 'invalid_request')
    const options = {
      headers: { Authorization: bearer, apikey: publicKey, 'Content-Type': 'application/json' },
      redirect: 'error',
    }
    try {
      const user = await requestService(new URL('/auth/v1/user', url), {
        ...options,
        signal: AbortSignal.timeout(8000),
      })
      if (user.status === 401 || user.status === 403) return send(401, 'admin_required')
      if (!user.ok) return send(503, 'unavailable')
      const actor = (await user.json())?.id
      if (!actor) return send(503, 'unavailable')
      if (payload.name === 'program_sync') {
        const { status, data } = await sync(actor, payload.args)
        return Response.json(data, { status, headers })
      }
      if (payload.name === 'daily_order') {
        const { status, data } = await dailyOrder(actor, payload.args)
        return Response.json(data, { status, headers })
      }
      const result = await requestService(new URL('/rest/v1/rpc/' + payload.name, url), {
        ...options,
        method: 'POST',
        body: JSON.stringify(payload.args),
        signal: AbortSignal.timeout(8000),
      })
      if (!result.ok) {
        const detail = await result.json()
        if (result.status === 401 || detail.code === '42501') return send(403, 'admin_required')
        const error = safeErrors.has(detail.message)
          ? detail.message
          : detail.code?.startsWith('22')
            ? 'invalid_window'
            : 'invalid_request'
        return send(result.status >= 500 ? 503 : ['revision_conflict', 'sync_busy'].includes(error) ? 409 : 400, error)
      }
      return Response.json(await result.json(), { headers })
    } catch {
      return send(503, 'unavailable')
    }
  }
}
