import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const directory = process.argv[2]
if (!directory) throw Error('Supply the saved spoken-window artifact directory.')
const read = async (name) => JSON.parse(await readFile(join(directory, name), 'utf8'))
const [state, audio, tones, history, chunks] = await Promise.all([
  read('state.json'), read(process.argv[3] ?? 'public-analysis-short.json'), read('public-tones.json'),
  read('history.json'), read('public-times.json'),
])

// These particular artifacts were captured after confirming the station timezone was UTC.
function scheduleEndpoint(item, endpoint) {
  const hhmm = String(item[`${endpoint}_time`]).padStart(4, '0')
  return Date.parse(`${item[`${endpoint}_date`]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`)
}
const [before, after] = state.targets.daily.scheduleReadback.toSorted((a, b) =>
  scheduleEndpoint(a, 'start') - scheduleEndpoint(b, 'start'))
const [special] = state.targets.special.scheduleReadback
assert.equal(scheduleEndpoint(before, 'end'), scheduleEndpoint(special, 'start'))
assert.equal(scheduleEndpoint(special, 'end'), scheduleEndpoint(after, 'start'))

const playlistNames = Object.values(state.targets).map((target) => target.name)
const sortedHistory = history.toSorted((a, b) => a.historyId - b.historyId)
const speechHistory = sortedHistory.filter((row) => playlistNames.includes(row.playlist))
const spokenLabels = speechHistory.map((row) => row.title.replace(/^CDR-spoken-/, ''))
assert.deepEqual(audio.matches.map((match) => match.label), spokenLabels)

const speech = audio.matches.map((match, i) => ({ ...match, row: speechHistory[i] }))
const groups = []
for (const hit of speech) {
  if (groups.at(-1)?.at(-1)?.row.playlist !== hit.row.playlist) groups.push([])
  groups.at(-1).push(hit)
}
assert.deepEqual(groups.map((group) => group[0].row.playlist), [
  state.targets.daily.name, state.targets.special.name, state.targets.daily.name,
])

function deltas(hit, scheduledAt, itemId) {
  const recorder = Date.parse(hit.arrival)
  const provider = Date.parse(hit.row.time)
  return {
    itemId, scheduledUtc: new Date(scheduledAt).toISOString(), label: hit.label,
    recordedArrivalUtc: hit.arrival, recorderDeltaMs: recorder - scheduledAt,
    historyId: hit.row.historyId, historyAtUtc: hit.row.time, historyDeltaMs: provider - scheduledAt,
    historyMinusRecorderMs: provider - recorder,
  }
}

const end = scheduleEndpoint(after, 'end')
const lastSpeech = groups.at(-1).at(-1)
// Short, isolated tone detections also occur inside speech. Require a sustained marker group.
const firstTone = tones.find((tone) => Date.parse(tone.arrival) > Date.parse(lastSpeech.arrival) &&
  Date.parse(tone.end) - Date.parse(tone.arrival) >= 3000 && tone.detectedPulses >= 12)
const firstToneRow = sortedHistory.find((row) => row.historyId > lastSpeech.row.historyId)
assert.ok(firstTone && firstToneRow?.title.includes(firstTone.marker === 'A' ? 'a-low-single' : 'b-high-double'))

const transitions = [
  deltas(groups[0][0], scheduleEndpoint(before, 'start'), before.id),
  deltas(groups[1][0], scheduleEndpoint(special, 'start'), special.id),
  deltas(groups[2][0], scheduleEndpoint(after, 'start'), after.id),
  deltas({ label: firstTone.marker, arrival: firstTone.arrival, row: firstToneRow }, end, after.id),
]
console.log(JSON.stringify({
  decodedSeconds: audio.duration,
  recorderFirstByteUtc: new Date(chunks[0][0]).toISOString(),
  recorderLastByteUtc: new Date(chunks.at(-1)[0]).toISOString(),
  maxChunkGapMs: Math.max(...chunks.slice(1).map((chunk, i) => chunk[0] - chunks[i][0])),
  speechGroups: groups.map((hits) => {
    const differences = hits.map((hit) => Date.parse(hit.row.time) - Date.parse(hit.arrival))
    return { playlist: hits[0].row.playlist, count: hits.length,
      historyMinusRecorderMsRange: [Math.min(...differences), Math.max(...differences)] }
  }),
  transitions,
  precedingClip: {
    label: lastSpeech.label, recordedArrivalUtc: lastSpeech.arrival, nominalSeconds: lastSpeech.row.duration,
    msToFirstTone: Date.parse(firstTone.arrival) - Date.parse(lastSpeech.arrival),
  },
}, null, 2))
