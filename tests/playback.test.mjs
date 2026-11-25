import assert from 'node:assert/strict'
import test from 'node:test'
import { startPlayback } from '../src/playback.ts'

function mockAudio(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const elements = []
  class TestAudio {
    currentTime = 0
    constructor() { elements.push(this) }
    play() { return Promise.resolve() }
    pause() {}
    removeAttribute() {}
    load() {}
  }
  globalThis.Audio = TestAudio
  t.after(() => { delete globalThis.Audio })
  return elements
}

test('repeated waiting events cannot extend a stalled connection, and stop cancels the pending rejoin', (t) => {
  const elements = mockAudio(t)
  const states = []
  const session = startPlayback('fixture', false, () => ({
    muted: true, volume: 0.3, canSetVolume: true,
  }), (state) => states.push(state))
  const first = elements[0]
  first.onplaying()
  first.onwaiting()
  t.mock.timers.tick(8000)
  first.onwaiting()
  assert.equal(states.at(-1), 'buffering')
  t.mock.timers.tick(2000)
  assert.equal(states.at(-1), 'retry')
  t.mock.timers.tick(1000)
  assert.equal(elements.length, 2)
  assert.equal(elements[1].muted, true)
  assert.equal(elements[1].volume, 0.3)
  elements[1].onerror()
  session.stop()
  t.mock.timers.tick(30000)
  assert.equal(elements.length, 2)
})

test('the retry cap survives brief recoveries and resets after sustained playback', (t) => {
  const elements = mockAudio(t)
  const states = []
  const session = startPlayback('fixture', false, () => ({
    muted: false, volume: 0.7, canSetVolume: true,
  }), (state) => states.push(state))
  t.after(() => session.stop())

  for (const delay of [1000, 2000, 4000]) {
    const audio = elements.at(-1)
    audio.onplaying()
    audio.currentTime = 29
    audio.ontimeupdate()
    audio.onerror()
    t.mock.timers.tick(delay)
  }
  assert.equal(elements.length, 4)
  const recovered = elements.at(-1)
  recovered.onplaying()
  recovered.currentTime = 15
  recovered.onwaiting()
  recovered.currentTime = 32
  recovered.ontimeupdate()
  recovered.onplaying()
  recovered.currentTime = 62
  recovered.ontimeupdate()
  recovered.onerror()
  assert.equal(states.at(-1), 'retry')
  t.mock.timers.tick(1000)
  assert.equal(elements.length, 5)

  for (const delay of [2000, 4000]) {
    elements.at(-1).onerror()
    t.mock.timers.tick(delay)
  }
  elements.at(-1).onerror()
  assert.equal(states.at(-1), 'failed')
  t.mock.timers.tick(10000)
  assert.equal(elements.length, 7)
})
