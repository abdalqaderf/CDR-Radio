import { AzuraCastAdapter } from './azuracast.mjs'

const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i])
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const mediaId = /^[1-9]\d{0,15}$/

export function dailyOrderSync({ url, serviceKey, provider }, request = fetch) {
  return async (actor, { p_id, p_revision, p_playlist, p_order }) => {
    const error = (status, key) => ({ status, data: { error: key } })
    if (!serviceKey || !provider.AZURACAST_API_KEY) return error(503, 'unavailable')
    if (!uuid.test(p_id) || !Number.isInteger(p_revision) || p_revision < 1 || typeof p_playlist !== 'string' || !mediaId.test(p_playlist) ||
      !Array.isArray(p_order) || !p_order.length || p_order.length > 250 ||
      p_order.some((id) => typeof id !== 'string' || !mediaId.test(id))) return error(400, 'invalid_draft')
    const adapter = new AzuraCastAdapter(provider, request)
    const operation = crypto.randomUUID()
    const db = (action, params) => request(new URL('/rest/v1/rpc/radio_' + action + '_daily_order', url), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: { Authorization: 'Bearer ' + serviceKey, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_actor: actor, p_id, p_operation: operation, ...params }),
    })
    const reserved = await db('begin', { p_revision })
    if (!reserved.ok) {
      const detail = await reserved.json()
      if (detail.code === '42501') return error(403, 'admin_required')
      if (['sync_busy', 'revision_conflict'].includes(detail.message)) return error(409, detail.message)
      return error(503, 'unavailable')
    }
    let attempted = false
    let outcome = 'rejected'
    try {
      const desired = await reserved.json()
      const deadline = AbortSignal.timeout(32000)
      const { configuration, order } = await adapter.readDaily(deadline)
      if (!configuration?.canReorder || configuration.playlistId !== p_playlist) return error(409, 'daily_changed')
      if (same(desired, configuration.tracks)) {
        outcome = 'already_current'
        return { status: 200, data: { ...configuration, outcome } }
      }
      if (!same(p_order, configuration.tracks)) return error(409, 'daily_changed')
      if (new Set(desired).size !== desired.length || !same(desired.toSorted(), configuration.tracks.toSorted()) ||
        new Set(order.map((row) => row.id)).size !== order.length ||
        order.some((row) => !Number.isSafeInteger(row.id) || row.id < 1)) return error(409, 'daily_membership')
      if (desired.some((id) => adapter.previewOnly.has(id))) return error(409, 'recording_restricted')
      const files = await adapter.programRequest('files', 'GET', undefined, deadline)
      const library = new Map(files.map((file) => [String(file.id), file]))
      if (desired.some((id) => !library.get(id)?.song_id || !(library.get(id).length > 0)))
        return error(409, 'media_not_ready')
      attempted = true
      const weights = Object.fromEntries(order.map((row) => [row.id, desired.indexOf(String(row.media.id)) + 1]))
      // The provider may commit a write even when its response is lost.
      await adapter.programRequest('playlist/' + p_playlist + '/order', 'PUT', { order: weights }, deadline).catch(() => {})
      const { configuration: observed } = await adapter.readDaily(deadline)
      if (!observed?.canReorder || observed.playlistId !== p_playlist || !same(desired, observed.tracks))
        return error(503, 'provider_unconfirmed')
      outcome = 'order_confirmed_after_write'
      return { status: 200, data: { ...observed, outcome } }
    } catch {
      return error(503, attempted ? 'provider_unconfirmed' : 'unavailable')
    } finally {
      // Keep the lease through its grace period when a write could still land.
      if (!attempted || outcome === 'order_confirmed_after_write') await db('finish', { p_outcome: outcome }).catch(() => {})
    }
  }
}
