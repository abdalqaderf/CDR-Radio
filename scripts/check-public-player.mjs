import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import QRCode from 'qrcode'

const origin = process.argv[2]
const secondChannel = process.argv[3] ?? 'chrome'
const metadataOnly = process.argv.includes('--metadata-only')
const site = URL.parse(origin ?? '')
assert.ok(site?.protocol === 'https:' && site.origin === origin, 'Supply the exact public HTTPS origin.')
const stationEndpoint = 'https://krsnebibuqbldyirfzhi.supabase.co/functions/v1/station'
const headings = {
  '/': 'مشغّل الفرع',
  '/listen': 'مشغّل الفرع',
  '/demo': 'دليل التجربة',
  '/admin/login': 'دخول المسؤول',
  '/admin/media': 'يتطلب هذا القسم تسجيل الدخول',
  '/admin/playlists': 'يتطلب هذا القسم تسجيل الدخول',
  '/admin/programs': 'يتطلب هذا القسم تسجيل الدخول',
}

const browser = await chromium.launch({ channel: 'chrome' })
let secondBrowser
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Amman' })
  const errors = []
  async function observeAudio(listener) {
    listener.on('pageerror', (error) => errors.push(error.name))
    await listener.addInitScript(() => {
      window.playedAudio = []
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        window.playedAudio.push(this)
        return play.call(this)
      }
    })
  }
  await observeAudio(page)
  for (const [route, title] of Object.entries(headings)) {
    const heading = page.getByRole('heading', { name: title, level: 1, exact: true })
    for (const load of [() => page.goto(origin + route), () => page.reload()]) {
      const response = await load()
      assert.equal(response?.status(), 200)
      assert.equal(page.url(), origin + route)
      await heading.waitFor()
      assert.equal(await page.locator('html').getAttribute('dir'), 'rtl')
      if (route === '/admin/media' || route === '/admin/programs' || route === '/admin/playlists') {
        await page.getByRole('heading', { name: 'يتطلب هذا القسم تسجيل الدخول' }).waitFor()
      }
    }
  }

  const qr = await page.request.get(origin + '/listen-qr.svg')
  assert.equal(qr.status(), 200)
  assert.match(qr.headers()['content-type'], /^image\/svg\+xml/)
  assert.equal(await qr.text(), await QRCode.toString(origin + '/listen', { type: 'svg', margin: 4 }))

  const station = page.waitForResponse((response) => response.url() === stationEndpoint && response.request().method() === 'GET')
  await page.goto(origin + '/listen')
  const snapshot = await station
  assert.equal(snapshot.status(), 200)
  assert.equal(snapshot.headers()['access-control-allow-origin'], origin)
  const metadata = await snapshot.json()
  assert.equal(new URL(metadata.url).protocol, 'https:')
  if (metadataOnly) {
    assert.deepEqual(errors, [])
    console.log('Public routes, reload, Arabic RTL, admin protection, listener QR and station metadata passed without starting playback.')
  } else {
  function controls(listener) {
    return {
      start: listener.getByRole('button', { name: 'تشغيل البث', exact: true }),
      stop: listener.getByRole('button', { name: 'إيقاف', exact: true }),
      playing: listener.getByText('قيد التشغيل على هذا الجهاز', { exact: true }),
      idle: listener.getByText('متوقف على هذا الجهاز', { exact: true }),
    }
  }
  async function playing(listener, count) {
    await controls(listener).playing.waitFor({ timeout: 25000 })
    await listener.waitForFunction((attempts) => window.playedAudio.length === attempts &&
      window.playedAudio.at(-1).currentTime > 0.5, count)
  }
  const a = controls(page)
  await a.start.click()
  await playing(page, 1)
  const startA = await page.evaluate(() => window.playedAudio[0].currentTime)

  secondBrowser = await chromium.launch({ channel: secondChannel })
  const second = await secondBrowser.newPage({ viewport: { width: 390, height: 844 } })
  await observeAudio(second)
  await second.goto(origin + '/listen')
  const b = controls(second)
  await b.idle.waitFor()
  assert.equal(await b.stop.count(), 0)
  assert.equal(await second.evaluate(() => window.playedAudio.length), 0)
  await b.start.click()
  await playing(second, 1)

  const mute = second.getByRole('button', { name: 'كتم الصوت', exact: true })
  const unmute = second.getByRole('button', { name: 'إلغاء الكتم', exact: true })
  await mute.click()
  assert.equal(await unmute.getAttribute('aria-pressed'), 'true')
  await second.waitForFunction(() => window.playedAudio[0].muted)
  const slider = second.getByRole('slider', { name: 'مستوى الصوت' })
  await slider.press('Home')
  await second.waitForFunction(() => window.playedAudio[0].volume === 0)
  await slider.press('End')
  await second.waitForFunction(() => window.playedAudio[0].volume === 1)
  await b.stop.click()
  await b.idle.waitFor()
  await second.waitForFunction(() => window.playedAudio[0].paused &&
    !window.playedAudio[0].hasAttribute('src'))
  await b.start.click()
  await playing(second, 2)
  assert.deepEqual(await second.evaluate(() => {
    const audio = window.playedAudio[1]
    return [audio.muted, audio.volume]
  }), [true, 1])
  await unmute.click()
  await second.waitForFunction(() => !window.playedAudio[1].muted)

  assert.equal((await second.reload())?.status(), 200)
  await b.idle.waitFor()
  assert.equal(await b.stop.count(), 0)
  assert.equal(await second.evaluate(() => window.playedAudio.length), 0)
  await b.start.click()
  await playing(second, 1)
  await page.waitForFunction((start) => {
    const audio = window.playedAudio[0]
    return !audio.paused && !audio.muted && audio.volume === 0.7 && audio.currentTime > start + 3
  }, startA)
  assert.equal(await page.evaluate(() => window.playedAudio.length), 1)
  await a.playing.waitFor()
  await b.stop.click()
  await b.idle.waitFor()
  await a.stop.click()
  await a.idle.waitFor()
  assert.deepEqual(errors, [])
  console.log(`Chrome ${browser.version()} and ${secondChannel} ${secondBrowser.version()}: public routes and reloads, route protection, QR, live late join, independent stop/rejoin, native mute and keyboard volume, and explicit play after reload passed.`)
  }
} finally {
  await secondBrowser?.close()
  await browser.close()
}
