import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { pipeline } from 'node:stream'
import { chromium } from 'playwright-core'

const file = process.argv[2]
if (!file) throw Error('Supply an MP3 capture to decode.')

const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Local audio verification</title>')
  } else if (request.url === '/recording.mp3') {
    response.writeHead(200, { 'Content-Type': 'audio/mpeg' })
    pipeline(createReadStream(file), response, () => {})
  } else {
    response.writeHead(404).end()
  }
})

let browser
try {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const metrics = await page.evaluate(async () => {
    const rate = 8000
    const decoder = new globalThis.OfflineAudioContext(1, 1, rate)
    const response = await fetch('/recording.mp3')
    const decoded = await decoder.decodeAudioData(await response.arrayBuffer())
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i))
    const blockFrames = rate / 50
    const threshold = 0.005
    let quietFrames = 0, longestQuietFrames = 0, activeBlocks = 0
    for (let start = 0; start < decoded.length; start += blockFrames) {
      const end = Math.min(start + blockFrames, decoded.length)
      const active = channels.some((pcm) => {
        for (let i = start; i < end; i++) if (Math.abs(pcm[i]) >= threshold) return true
        return false
      })
      if (active) {
        activeBlocks++
        quietFrames = 0
      } else {
        quietFrames += end - start
        longestQuietFrames = Math.max(quietFrames, longestQuietFrames)
      }
    }
    return { durationSeconds: decoded.duration, channels: channels.length, activeBlocks,
      longestBelowThresholdSeconds: longestQuietFrames / rate, amplitudeThreshold: threshold }
  })
  console.log(JSON.stringify({ decoder: browser.version(), file, ...metrics }, null, 2))
  if (!metrics.activeBlocks) process.exitCode = 1
} finally {
  await browser?.close()
  server.close()
}
