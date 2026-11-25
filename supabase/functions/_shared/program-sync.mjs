import { AzuraCastAdapter } from './azuracast.mjs'

const numericId = (value) => /^[1-9][0-9]{0,14}$/.test(String(value))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const settings = {
  type: 'default', source: 'songs', order: 'sequential', avoid_duplicates: false, backend_options: [],
}

export function providerWindow(startsAt, endsAt) {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const duration = +end - +start
  if (!(duration > 0 && duration < 86400000) || +start % 60000 || +end % 60000)
    throw Error('unsupported_policy')
  const day = start.toISOString().slice(0, 10)
  const time = (date) => date.getUTCHours() * 100 + date.getUTCMinutes()
  // The provider's date range applies to the window's start day. Setting
  // end_date to tomorrow on an overnight item would allow a second occurrence.
  return {
    start_date: day, end_date: day, start_time: time(start), end_time: time(end),
    loop_once: false, days: [], prevent_requests: false, reset_queue_at_start: true,
  }
}

export async function syncPlaylist(adapter, job, signal, setPlaylist) {
  const api = (path, method = 'GET', body) => adapter.programRequest(path, method, body, signal)
  if (!/^[0-9a-f-]{36}$/.test(job.id)) throw Error('provider_identity_mismatch')
  const name = 'CDR program ' + job.id
  const matches = (await api('playlists')).filter((p) => p.name === name)
  if (matches.length > 1 || (job.playlistId && matches.length && String(matches[0].id) !== job.playlistId))
    throw Error('provider_identity_mismatch')
  if (job.action === 'cancel' && !matches.length) {
    if (!job.playlistId) return
    // An existing ID with a different name no longer belongs to this program.
    // A missing recorded ID must be independently confirmed by the list.
    const playlists = await api('playlists')
    if (playlists.some((p) => String(p.id) === job.playlistId || p.name === name))
      throw Error('provider_identity_mismatch')
    return
  }
  if (job.playlistId && !matches.length) throw Error('provider_identity_mismatch')
  let playlist = matches[0]
  let media
  let expected
  if (job.action === 'apply') {
    const profile = await api('profile')
    if (String(profile.station?.id) !== adapter.id || profile.station?.timezone !== 'UTC')
      throw Error('unsupported_policy')
    expected = providerWindow(job.startsAt, job.endsAt)
    const files = await api('files')
    const library = new Map(files.map((file) => [String(file.id), file]))
    const desired = job.tracks.map((id) => library.get(id))
    if (desired.some((file) => !file?.song_id || !(file.length > 0) || file.playlists?.some((p) => p.id === 176)) ||
      new Set(desired.map((file) => file.song_id)).size !== job.tracks.length)
      throw Error('unsupported_tracks')
    media = job.tracks.map(Number)
  }
  if (!playlist) {
    // POST creates a disabled playlist. If its response is lost, a retry
    // searches by the persisted program UUID before sending another create.
    playlist = await api('playlists', 'POST', { name, ...settings, is_enabled: false })
  }
  const id = Number(playlist.id)
  if (!numericId(id) || id === 176 || playlist.name !== name) throw Error('provider_identity_mismatch')
  setPlaylist(String(id))
  const path = 'playlist/' + id
  const read = async () => {
    const current = await api(path)
    if (current.id !== id || current.name !== name) throw Error('provider_identity_mismatch')
    return current
  }
  playlist = await read()
  const currentOrder = await api(path + '/order')
  const orderIds = (order) => order.map((row) => row.media.id)
  const hasSchedule = (actual) => actual.length === 1 &&
    Object.entries(expected).every(([key, value]) => same(value, actual[0][key]))
  const hasSettings = (actual) => actual.type === settings.type && actual.source === settings.source &&
    actual.order === settings.order && actual.avoid_duplicates === settings.avoid_duplicates &&
    same((actual.backend_options ?? []).filter(Boolean), settings.backend_options)
  const matchesDesired = (actual, order) => hasSettings(actual) &&
    hasSchedule(actual.schedule_items) && same(orderIds(order), media)
  if (job.action === 'apply' && playlist.is_enabled && matchesDesired(playlist, currentOrder)) return

  if (playlist.is_enabled || (job.action === 'cancel' && playlist.schedule_items.length)) {
    await api(path, 'PUT', { is_enabled: false, ...(job.action === 'cancel' && { schedule_items: [] }) })
    playlist = await read()
    if (playlist.is_enabled || (job.action === 'cancel' && playlist.schedule_items.length))
      throw Error('provider_unconfirmed')
  }
  const wanted = new Set(media ?? [])
  const current = new Set(orderIds(currentOrder))
  const changed = [...new Set([...wanted, ...current])].filter((track) => wanted.has(track) !== current.has(track))
  for (let offset = 0; offset < changed.length; offset += 6) {
    const batch = changed.slice(offset, offset + 6)
    const results = await Promise.allSettled(batch.map(async (track) => {
      if (!numericId(track) || track === 1350 || track === 1351) throw Error('provider_unconfirmed')
      const filePath = 'file/' + track
      const file = await api(filePath)
      if (file.id !== track || file.playlists.some((p) => p.id === 176)) throw Error('provider_unconfirmed')
      const memberships = file.playlists.map((p) => p.id).filter((playlistId) => playlistId !== id)
      if (wanted.has(track)) memberships.push(id)
      await api(filePath, 'PUT', { playlists: memberships })
    }))
    const rejected = results.find((result) => result.status === 'rejected')
    if (rejected) throw rejected.reason
  }
  const assigned = await api(path + '/order')
  if (job.action === 'cancel') {
    // Keep the empty disabled provider object as the independently readable
    // cancellation receipt. It holds no schedule and references no audio.
    playlist = await read()
    if (playlist.is_enabled || playlist.schedule_items.length || assigned.length)
      throw Error('provider_unconfirmed')
    return
  }
  if (assigned.length !== media.length || assigned.some((row) => !wanted.has(row.media.id) || !numericId(row.id)))
    throw Error('provider_unconfirmed')
  if (!same(orderIds(assigned), media))
    await api(path + '/order', 'PUT', {
      order: Object.fromEntries(assigned.map((row) => [row.id, media.indexOf(row.media.id) + 1])),
    })
  await api(path, 'PUT', { ...settings, is_enabled: false, schedule_items: [expected] })
  const [staged, order] = await Promise.all([read(), api(path + '/order')])
  if (staged.is_enabled || !matchesDesired(staged, order)) throw Error('provider_unconfirmed')
  if (Date.parse(job.startsAt) <= Date.now() + 20000) throw Error('window_too_soon')
  await api(path, 'PUT', { is_enabled: true })
  const [enabled, verified] = await Promise.all([read(), api(path + '/order')])
  if (!enabled.is_enabled || !matchesDesired(enabled, verified)) throw Error('provider_unconfirmed')
}

export function programSync({ url, serviceKey, provider }, request = fetch) {
  return async (actor, args) => {
    if (!serviceKey) return { status: 503, data: { error: 'unavailable' } }
    const adapter = new AzuraCastAdapter(provider, request)
    if (!adapter.key) return { status: 503, data: { error: 'unavailable' } }
    const operation = crypto.randomUUID()
    const db = (name, fields) => request(new URL('/rest/v1/rpc/radio_' + name + '_program_sync', url), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: { Authorization: 'Bearer ' + serviceKey, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_actor: actor, p_id: args.p_id, p_operation: operation, ...fields }),
    })
    const deadline = AbortSignal.timeout(33000)
    const reservation = await db('begin', {
      p_revision: args.p_revision, p_action: args.p_action, p_doc: args.p_doc ?? null,
    })
    if (!reservation.ok) {
      const detail = await reservation.json()
      if (detail.code === '42501') return { status: 403, data: { error: 'admin_required' } }
      const errors = ['sync_busy', 'revision_conflict', 'window_too_soon', 'edit_window_started',
        'unsupported_policy', 'unsupported_tracks', 'invalid_tracks', 'invalid_window', 'invalid_draft']
      const error = detail.code === '23P01' ? 'overlap_conflict'
        : errors.includes(detail.message) ? detail.message : 'invalid_request'
      return { status: reservation.status >= 500 ? 503 : 409, data: { error } }
    }
    const job = await reservation.json()
    let playlistId = job.playlistId
    let outcome = job.action === 'cancel' ? 'cancelled' : 'scheduled'
    let error
    try {
      await syncPlaylist(adapter, job, deadline, (id) => { playlistId = id })
    } catch (failure) {
      outcome = 'sync_failed'
      error = ['unsupported_tracks', 'unsupported_policy', 'window_too_soon'].includes(failure.message)
        ? failure.message : 'provider_unconfirmed'
    }
    const result = await db('finish', { p_outcome: outcome, p_playlist: playlistId })
    if (!result.ok) return { status: 503, data: { error: 'provider_unconfirmed' } }
    return { status: 200, data: { ...(await result.json()), error } }
  }
}
