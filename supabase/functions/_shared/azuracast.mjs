import { dailyCandidate, mediaLabels, protectedDaily } from './media-labels.mjs'
import { maxUpload } from './mp3.mjs'

export class ProbeError extends Error {}

export function httpsUrl(value, label) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new ProbeError('Invalid ' + label)
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new ProbeError('Expected credential-free HTTPS ' + label)
  }
  return url
}

export class AzuraCastAdapter {
  constructor(env, request = fetch) {
    this.origin = httpsUrl(env.AZURACAST_ORIGIN, 'station origin')
    if (this.origin.pathname !== '/' || this.origin.search)
      throw new ProbeError('Expected a bare station origin')
    this.id = env.AZURACAST_STATION_ID
    if (!/^[1-9]\d*$/.test(this.id)) throw new ProbeError('Expected numeric station ID')
    this.key = env.AZURACAST_API_KEY
    this.dailyPlaylistId = /^[1-9]\d*$/.test(env.AZURACAST_DAILY_PLAYLIST_ID ?? '') ? env.AZURACAST_DAILY_PLAYLIST_ID : ''
    this.recoveryPlaylistId = /^[1-9]\d*$/.test(env.AZURACAST_RECOVERY_PLAYLIST_ID ?? '') ? env.AZURACAST_RECOVERY_PLAYLIST_ID : ''
    this.protectedPlaylists = [this.dailyPlaylistId, this.recoveryPlaylistId].filter(Boolean)
    this.previewOnly = new Set((env.AZURACAST_PREVIEW_ONLY_MEDIA_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean))
    this.request = request
  }

  get(url, headers = {}) {
    return this.request(url, { headers, redirect: 'error', signal: AbortSignal.timeout(10000) })
  }

  playlists(authenticated) {
    const url = new URL('/api/station/' + this.id + '/playlists', this.origin)
    if (authenticated && !this.key) throw new ProbeError('Missing AZURACAST_API_KEY')
    return this.get(url, authenticated ? { Authorization: 'Bearer ' + this.key } : {})
  }

  async media(path, body) {
    if (!this.key) throw new ProbeError('Missing AZURACAST_API_KEY')
    const response = await this.request(new URL('/api/station/' + this.id + '/' + path, this.origin), {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new ProbeError('Media request failed (HTTP ' + response.status + ')')
    return response.json()
  }

  async programRequest(path, method, body, signal) {
    if (!this.key) throw new ProbeError('Missing AZURACAST_API_KEY')
    const response = await this.request(new URL('/api/station/' + this.id + '/' + path, this.origin), {
      method,
      headers: { Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    })
    if (!response.ok) throw new ProbeError('Program request failed (HTTP ' + response.status + ')')
    return response.json()
  }

  async library() {
    const [files, playlists] = await Promise.all([this.media('files'), this.media('playlists')])
    const protectedIds = new Set(playlists.filter((playlist) => protectedDaily(playlist, this.protectedPlaylists))
      .map((playlist) => String(playlist.id)))
    // App uploads use a generated path. Keep those files out of the picker
    // while the provider is still extracting their duration.
    return files.filter((file) => !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}-/i.test(file.path) ||
      Number(file.length) > 0).map(file => ({
      id: String(file.id),
      ...mediaLabels(file.title, file.path),
      seconds: Number(file.length) || undefined,
      daily: file.playlists?.some((playlist) => protectedIds.has(String(playlist.id))) || undefined,
      broadcastRestricted: this.previewOnly.has(String(file.id)) || undefined,
      previewable: file.path?.toLowerCase().endsWith('.mp3') && Number.isSafeInteger(file.size) &&
        file.size > 0 && file.size <= maxUpload,
    }))
  }

  async dailyPlayback() {
    const { configuration } = await this.readDaily()
    return configuration
  }

  async readDaily(signal = AbortSignal.timeout(18000)) {
    const read = (path) => this.programRequest(path, 'GET', undefined, signal)
    const active = (await read('playlists')).filter(dailyCandidate)
    if (active.length !== 1) return { configuration: null }
    const { id, name } = active[0]
    const path = 'playlist/' + id
    const [playlist, order] = await Promise.all([read(path), read(path + '/order')])
    if (!/^[1-9]\d*$/.test(String(id)) || playlist.id !== id || playlist.name !== name || !playlist.is_enabled ||
      playlist.type !== 'default' || playlist.source !== 'songs' || playlist.order !== 'sequential' ||
      playlist.schedule_items.length || order.length !== active[0].num_songs ||
      order.some((row) => !Number.isSafeInteger(row.media?.id) || row.media.id <= 0))
      return { configuration: null }
    const recovery = String(id) === this.recoveryPlaylistId
    return { configuration: { playlistId: String(id), providerName: name,
      canReorder: !recovery && String(id) === this.dailyPlaylistId,
      title: recovery ? 'القائمة اليومية الاحتياطية' : 'غماس بلدي · البث اليومي',
      tracks: order.map((row) => String(row.media.id)), verifiedAt: new Date().toISOString() }, order }
  }

  async previewMedia(id, limit) {
    const file = await this.media('file/' + id)
    if (String(file.id) !== id || !file.path?.toLowerCase().endsWith('.mp3') ||
      !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > limit) return null
    const url = new URL('/api/station/' + this.id + '/files/download', this.origin)
    url.searchParams.set('file', file.path)
    const response = await this.get(url, { Authorization: 'Bearer ' + this.key })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      return null
    }
    const length = Number(response.headers.get('content-length'))
    if (length && length !== file.size) {
      await response.body.cancel()
      return null
    }
    let read = 0
    return response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        read += chunk.byteLength
        if (read > file.size) throw new ProbeError('Preview exceeded stored size')
        controller.enqueue(chunk)
      },
      flush() {
        if (read !== file.size) throw new ProbeError('Incomplete preview')
      },
    }))
  }

  async uploadedTrack(path, size, id) {
    if (!id) {
      const matches = (await this.media('files')).filter((item) => item.path === path)
      if (matches.length !== 1) return null
      id = matches[0].id
    }
    if (!Number.isSafeInteger(id) || id <= 0) return null
    const stored = await this.media('file/' + id)
    if (stored.path !== path || stored.id !== id || stored.size !== size || !(stored.length > 0)) return null
    return { id: String(id), ...mediaLabels(stored.title || path, path), path, size: stored.size, seconds: Number(stored.length) }
  }

  async upload(name, bytes, key) {
    const path = (key || crypto.randomUUID()) + '-' + name
    if (key) {
      const matches = (await this.media('files')).filter((item) => item.path === path)
      if (matches.length) return matches.length === 1 ? this.uploadedTrack(path, bytes.length, matches[0].id) : null
    }
    const parts = []
    for (let i = 0; i < bytes.length; i += 0x6000)
      parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 0x6000))))
    const file = await this.media('files', { path, file: parts.join('') })
    if (!Number.isSafeInteger(file.id) || file.id <= 0) {
      if (key) return null
      throw new ProbeError('Missing media ID')
    }
    const track = await this.uploadedTrack(path, bytes.length, file.id)
    if (!track && !key) throw new ProbeError('Media processing unconfirmed')
    return track
  }

  async snapshot() {
    const response = await this.get(new URL('/api/nowplaying/' + this.id, this.origin))
    if (!response.ok) throw new ProbeError('Now-playing read failed (HTTP ' + response.status + ')')
    const raw = await response.json()
    if (String(raw.station?.id) !== this.id) throw new ProbeError('Station identity mismatch')
    const url = httpsUrl(raw.station.listen_url, 'listening URL')
    if (url.search) throw new ProbeError('Expected public listening URL without query credentials')
    const label = (value) => (typeof value === 'string' ? value.slice(0, 240) : '')
    const playing = raw.now_playing
    const ends = (Number(playing?.played_at) + Number(playing?.duration)) * 1000
    return {
      name: label(raw.station.name),
      online: typeof raw.is_online === 'boolean' ? raw.is_online : null,
      url: url.href,
      current: label(playing?.song?.title || playing?.song?.text),
      next: label(raw.playing_next?.song?.title || raw.playing_next?.song?.text),
      checked: Date.now(),
      trackEndsAt: Number.isFinite(ends) && ends > 0 ? ends : null,
    }
  }
}
