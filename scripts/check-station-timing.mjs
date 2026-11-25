import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { AzuraCastAdapter } from '../supabase/functions/_shared/azuracast.mjs'

const station = new AzuraCastAdapter(process.env)
if (!station.key) throw Error('Missing AZURACAST_API_KEY')

async function sampleClock() {
  const url = new URL('/api/time', station.origin)
  url.searchParams.set('probe', randomUUID())
  const started = Date.now()
  const monotonicStart = performance.now()
  const response = await station.get(url, { 'Cache-Control': 'no-cache' })
  if (!response.ok) throw Error('Provider clock returned HTTP ' + response.status)
  const body = await response.json()
  const finished = Date.now()
  const provider = Date.parse(body.utc_json)
  if (!Number.isFinite(provider) || !/\.\d{3,}Z$/.test(body.utc_json) || Math.floor(provider / 1000) !== body.timestamp)
    throw Error('Invalid provider UTC clock sample')

  // The server timestamp was generated between the two local timestamps if the response is fresh.
  // Retain that interval instead of applying its midpoint as a timing correction.
  return {
    sentAtUtc: new Date(started).toISOString(), receivedAtUtc: new Date(finished).toISOString(),
    providerAtUtc: body.utc_json, roundTripMs: Math.round(performance.now() - monotonicStart),
    providerMinusLocalMs: [provider - finished, provider - started + 1],
    httpDate: response.headers.get('date'), cacheAge: response.headers.get('age'),
  }
}

async function inspect(path, project) {
  const url = new URL(`/api/station/${station.id}/${path}`, station.origin)
  const response = await station.get(url, { Authorization: 'Bearer ' + station.key })
  const result = { status: response.status }
  if (response.ok && project) result.details = project(await response.json())
  else await response.body?.cancel()
  return result
}

async function clocks() {
  const samples = []
  for (let i = 0; i < 3; i++) {
    if (i > 0) await delay(1500)
    samples.push(await sampleClock())
  }
  return samples
}

const [samples, profile, queue, logs, liquidsoapConfig] = await Promise.all([
  clocks(),
  inspect('profile', ({ station: info }) => ({ timezone: info?.timezone, backend: info?.backend })),
  inspect('queue'), inspect('logs'), inspect('liquidsoap-config'),
])
const timestampsAdvance = samples.every((sample, index) => index === 0 || sample.providerAtUtc > samples[index - 1].providerAtUtc)
const result = JSON.stringify({ stationId: Number(station.id), timestampsAdvance, samples, profile, queue, logs, liquidsoapConfig }, null, 2) + '\n'
if (process.argv[2]) await writeFile(process.argv[2], result, { flag: 'wx' })
process.stdout.write(result)
