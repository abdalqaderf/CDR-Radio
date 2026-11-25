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
    const files = await this.media('files')
    return files.map(file => ({ id: String(file.id), title: file.title || file.path }))
  }

  async upload(name, bytes) {
    // Each request gets a fresh path so an existing provider file cannot be overwritten.
    const path = crypto.randomUUID() + '-' + name
    const parts = []
    for (let i = 0; i < bytes.length; i += 0x6000)
      parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 0x6000))))
    const file = await this.media('files', { path, file: parts.join('') })
    if (!Number.isSafeInteger(file.id) || file.id <= 0) throw new ProbeError('Missing media ID')
    const stored = await this.media('file/' + file.id)
    if (stored.path !== path || stored.id !== file.id || stored.size !== bytes.length || !(stored.length > 0))
      throw new ProbeError('Media processing unconfirmed')
    return { id: String(file.id), title: stored.title || name, path, size: stored.size, seconds: stored.length }
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
      current: label(playing?.song?.text),
      next: label(raw.playing_next?.song?.text),
      checked: Date.now(),
      trackEndsAt: Number.isFinite(ends) && ends > 0 ? ends : null,
    }
  }
}
