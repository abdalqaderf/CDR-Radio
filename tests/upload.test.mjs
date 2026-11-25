import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { maxUpload, validMp3 } from '../scripts/mp3.mjs'

test('fixture upload validates actual bytes, names, MIME and inclusive size limit', async () => {
  const clip = await readFile(new URL('./media/a-low-single.mp3', import.meta.url))
  const check = (data, name = 'marker.mp3', type = 'audio/mpeg') => validMp3(name, type, data)
  assert.equal(check(clip), true)
  for (const data of [
    Buffer.alloc(0),
    Buffer.from('fake audio'),
    Buffer.from('ID3'),
    clip.subarray(0, 6),
  ])
    assert.equal(check(data), false)
  for (const name of ['../marker.mp3', 'a.wav', 'a\u0001.mp3']) assert.equal(check(clip, name), false)
  assert.equal(check(clip, 'marker.mp3', 'text/html'), false)
  const boundary = Buffer.alloc(maxUpload, clip)
  assert.equal(check(boundary), true)
  assert.equal(check(Buffer.concat([boundary, Buffer.alloc(1)])), false)
})
