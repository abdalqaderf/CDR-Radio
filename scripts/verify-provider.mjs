import { pathToFileURL } from 'node:url'

import { AzuraCastAdapter, ProbeError } from '../supabase/functions/_shared/azuracast.mjs'

export async function probe(env, request = fetch, log = console.log) {
  for (const name of ['AZURACAST_ORIGIN', 'AZURACAST_STATION_ID', 'AZURACAST_API_KEY']) {
    if (!env[name]?.trim()) throw new ProbeError('Missing ' + name)
  }
  const adapter = new AzuraCastAdapter(env, request)
  const anonymous = await adapter.playlists(false)
  await anonymous.body?.cancel()
  if (![401, 403].includes(anonymous.status)) {
    throw new ProbeError('Playlist authorization baseline inconclusive (HTTP ' + anonymous.status + ')')
  }
  const library = await adapter.playlists(true)
  if (!library.ok) throw new ProbeError('Playlist read failed (HTTP ' + library.status + ')')
  if (!Array.isArray(await library.json())) throw new ProbeError('Unexpected playlist list format')
  log('Anonymous playlist read denied. Authorized playlist list returned.')

  const station = await adapter.snapshot()
  log('Station ' + adapter.id + ' now-playing status: ' +
    (station.online === null ? 'unknown' : station.online ? 'online' : 'offline'))
  const stream = await adapter.get(new URL(station.url))
  if (!stream.ok || !stream.headers.get('content-type')?.startsWith('audio/')) {
    await stream.body?.cancel()
    throw new ProbeError('Mount did not return a successful audio response')
  }
  const reader = stream.body?.getReader()
  if (!reader) throw new ProbeError('Missing stream body')
  try {
    const first = await reader.read()
    if (!first.value?.byteLength) throw new ProbeError('No stream bytes received')
  } finally { await reader.cancel() }
  log('Station ID matched. HTTPS mount returned audio-labeled bytes.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await probe(process.env)
    console.log('Read preflight complete. Live writes and audible checks require separate evidence.')
  } catch (error) {
    console.error(error instanceof ProbeError ? error.message : 'Provider request or response parsing failed.')
    process.exitCode = 1
  }
}
