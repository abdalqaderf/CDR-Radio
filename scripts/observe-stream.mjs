import { mkdir, open, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const seconds = Number(process.argv[2] ?? 3600)
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 10800)
  throw Error('Enter a whole observation duration from 1 to 10800 seconds.')

const url = 'https://quintastream.cl/listen/cdr_radio_demo/radio.mp3'
const timestamp = new Date().toISOString().replaceAll(':', '-')
const directory = `.verification/stream-observations/${timestamp}-${randomUUID().slice(0, 8)}`
await mkdir(directory, { recursive: true })
const file = await open(directory + '/stream.mp3', 'wx')
const control = new AbortController()
const clock = () => ({ utc: new Date().toISOString(), elapsed: performance.now() })
const requestedAt = clock()
const gapThresholdMs = 3000
const gaps = []
let first, last, bytes = 0, chunks = 0, status, completed = false
let outcome = 'connect_timeout', maxGapMs = 0
let timer = setTimeout(() => control.abort(), 15000)

function trackGap(from, to) {
  const ms = Math.round(to.elapsed - from.elapsed)
  maxGapMs = Math.max(maxGapMs, ms)
  if (ms >= gapThresholdMs) gaps.push({ fromUtc: from.utc, toUtc: to.utc, ms })
}

try {
  const response = await fetch(url, { redirect: 'error', signal: control.signal })
  status = response.status
  if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) {
    outcome = 'stream_unavailable'
    await response.body?.cancel()
  } else {
    for await (const chunk of response.body) {
      const now = clock()
      if (last) trackGap(last, now)
      else {
        first = now
        clearTimeout(timer)
        timer = setTimeout(() => { completed = true; control.abort() }, seconds * 1000)
      }
      last = now
      await file.writeFile(chunk)
      chunks++
      bytes += chunk.length
    }
    outcome = completed ? 'completed' : 'stream_ended'
  }
} catch {
  outcome = completed ? 'completed' : first ? 'stream_error' : control.signal.aborted ? 'connect_timeout' : 'connect_error'
} finally {
  clearTimeout(timer)
  const end = clock()
  if (last) trackGap(last, end)
  await file.close()
  const summary = {
    source: url, requestedSeconds: seconds, outcome, status,
    openedAtUtc: requestedAt.utc, firstByteAtUtc: first?.utc, lastByteAtUtc: last?.utc, endedAtUtc: end.utc,
    observedSeconds: first ? (end.elapsed - first.elapsed) / 1000 : 0,
    bytes, chunks, maxGapMs, gaps, gapThresholdMs,
  }
  await writeFile(directory + '/observation.json', JSON.stringify(summary, null, 2) + '\n')
  console.log(outcome, `${chunks} chunks`, `${bytes} bytes`, directory)
}
if (outcome !== 'completed' || !bytes) process.exitCode = 1
