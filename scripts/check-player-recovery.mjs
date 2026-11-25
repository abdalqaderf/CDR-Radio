import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'

// Serve the hosted build locally and substitute only the public station snapshot and audio transport.
const root = new URL('../dist/', import.meta.url)
const index = await readFile(new URL('index.html', root))
const marker = await readFile(new URL('../tests/media/a-low-single.mp3', import.meta.url))
const stationEndpoint = 'https://krsnebibuqbldyirfzhi.supabase.co/functions/v1/station'
const streams = new Set()
let available = true
let requests = 0
const server = createServer(async (req, res) => {
  if (req.url === '/feed') {
    requests++
    if (!available) {
      res.writeHead(503, { 'Cache-Control': 'no-store' }).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' })
    res.write(marker)
    let offset = 0
    const stream = {
      response: res,
      timer: setInterval(() => {
        const end = Math.min(offset + 2400, marker.length)
        res.write(marker.subarray(offset, end))
        offset = end === marker.length ? 0 : end
      }, 200),
    }
    streams.add(stream)
    res.on('close', () => {
      clearInterval(stream.timer)
      streams.delete(stream)
    })
    return
  }
  if (req.url === '/listen') {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(index)
    return
  }
  if (/^\/assets\/[\w.-]+\.(js|css)$/.test(req.url)) {
    const asset = await readFile(new URL(req.url.slice(1), root)).catch(() => null)
    if (asset) {
      res.writeHead(200, { 'Content-Type': req.url.endsWith('.js') ? 'text/javascript' : 'text/css' }).end(asset)
      return
    }
  }
  res.writeHead(404).end()
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.setDefaultTimeout(30000)
  await page.route(stationEndpoint, (route) => route.fulfill({ json: {
    name: 'محطة اختبار محلية', online: true, url: origin + '/feed', current: 'إشارة الاختبار',
    next: '', checked: Date.now(), trackEndsAt: null,
  }, headers: { 'Access-Control-Allow-Origin': origin } }))
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    window.attempts = []
    HTMLMediaElement.prototype.play = function () {
      const attempt = { element: this, at: performance.now(), events: [] }
      window.attempts.push(attempt)
      for (const event of ['playing', 'waiting', 'stalled', 'ended', 'error']) {
        this.addEventListener(event, () => attempt.events.push(event))
      }
      return play.call(this)
    }
  })
  const button = (name) => page.getByRole('button', { name, exact: true })
  const status = (name) => page.getByText(name, { exact: true })
  const play = button('تشغيل البث')
  const stop = button('إيقاف')
  const idle = status('متوقف على هذا الجهاز')
  const failed = status('انقطع الصوت. اضغط تشغيل للمحاولة.')
  const retry = status('جارٍ إعادة الاتصال')
  const playing = status('قيد التشغيل على هذا الجهاز')
  const attempts = () => page.evaluate(() => window.attempts.map(({ at, events }) => ({ at, events })))
  const count = () => page.evaluate(() => window.attempts.length)
  const waitForCount = (expected) => page.waitForFunction((n) => window.attempts.length === n, expected)
  const progress = (position) => page.waitForFunction((minimum) =>
    window.attempts.at(-1).element.currentTime >= minimum, position, { timeout: 45000 })

  await page.goto(origin + '/listen')
  await idle.waitFor()
  await play.click()
  await playing.waitFor()
  await progress(2)
  await button('كتم الصوت').click()
  await page.getByRole('slider', { name: 'مستوى الصوت' }).press('Home')

  // Stop delivering bytes without closing the current connection. Reject its first rejoin.
  available = false
  assert.equal(streams.size, 1)
  for (const stream of streams) clearInterval(stream.timer)
  console.log('Simulating an open connection that stops delivering audio bytes.')
  await waitForCount(2)
  await page.waitForFunction(() => window.attempts[1].events.includes('error'))
  available = true
  await waitForCount(3)
  await playing.waitFor()
  await progress(1)
  assert.ok((await attempts())[0].events.includes('waiting'))
  assert.deepEqual(await page.evaluate(() => {
    const audio = window.attempts[2].element
    return [audio.muted, audio.volume]
  }), [true, 0])
  await button('إلغاء الكتم').click()
  await page.getByRole('slider', { name: 'مستوى الصوت' }).press('End')

  await progress(31)
  assert.equal((await attempts())[2].events.filter((event) => event === 'playing').length, 1)
  console.log('Simulating a later socket interruption after 31 seconds of native playback.')
  available = false
  for (const stream of streams) stream.response.destroy()
  await page.waitForFunction(() => window.attempts[4]?.events.includes('error'))
  available = true
  await waitForCount(6)
  await playing.waitFor()
  await progress(1)
  assert.deepEqual(await page.evaluate(() => {
    const audio = window.attempts[5].element
    return [audio.muted, audio.volume]
  }), [false, 1])
  await stop.click()
  await idle.waitFor()
  const recoveryAttempts = await attempts()
  console.log('Both outages recovered without a click. Native events:', JSON.stringify(recoveryAttempts.map(({ events }) => events)))

  // Keep the outage longer than the full retry budget, then restore and rejoin explicitly.
  available = false
  const beforeFailure = requests
  await play.click()
  await failed.waitFor()
  assert.equal(await count(), 10)
  assert.equal(requests - beforeFailure, 4)
  const boundedAttempts = (await attempts()).slice(-4)
  const gaps = boundedAttempts.slice(1).map(({ at }, i) => Math.round(at - boundedAttempts[i].at))
  for (const [i, gap] of gaps.entries()) assert.ok(gap >= [1000, 2000, 4000][i] - 50, gaps.join(', '))
  available = true
  await delay(8500)
  assert.equal(await count(), 10)
  assert.equal(requests - beforeFailure, 4)
  assert.ok(await failed.isVisible())
  await play.click()
  await playing.waitFor()
  await progress(1)
  await stop.click()

  // Stop during the retry wait, before restoring the audio endpoint.
  available = false
  await play.click()
  await retry.waitFor()
  await stop.click()
  await idle.waitFor()
  available = true
  await delay(1200)
  assert.equal(await count(), 12)

  // Model WebKit's locked volume: the getter briefly echoes the write, then reverts without an event.
  await page.addInitScript(() => {
    const { get } = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume')
    const requested = new WeakMap()
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      get() { return requested.get(this) ?? get.call(this) },
      set(value) {
        requested.set(this, value)
        setTimeout(() => requested.delete(this), 0)
      },
      configurable: true,
    })
  })
  await page.reload()
  await idle.waitFor()
  assert.equal(await page.getByRole('slider', { name: 'مستوى الصوت' }).count(), 0,
    'A transient volume write must not enable the slider')
  await page.getByText('اضبط مستوى الصوت من أزرار الجهاز.', { exact: true }).waitFor()
  assert.equal(await count(), 0)
  await play.click()
  await playing.waitFor()
  await progress(1)
  await button('كتم الصوت').click()
  await page.waitForFunction(() => window.attempts[0].element.muted && window.attempts[0].element.volume === 1)
  await button('إلغاء الكتم').click()
  await page.waitForFunction(() => !window.attempts[0].element.muted)
  await stop.click()
  await idle.waitFor()
  assert.deepEqual(pageErrors, [])
  console.log(`Chrome ${browser.version()}: simulated outages, later recovery, 3-retry cap (${gaps.join(', ')} ms), stop during retry, and simulated device-volume fallback passed.`)
} finally {
  await browser?.close()
  server.closeAllConnections()
  server.close()
}
