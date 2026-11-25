import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

// This check owns an ephemeral database and never opens the user's saved fixture workspace.
process.env.RADIO_FIXTURE_DB = 'memory://'
const server = await createServer({
  mode: 'fixture',
  configLoader: 'native',
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
})
let browser
try {
  await server.listen()
  const base = 'http://127.0.0.1:' + server.httpServer.address().port
  browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({
    timezoneId: 'America/New_York',
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  page.setDefaultTimeout(7500)
  const faults = []
  page.on('pageerror', (err) => faults.push(err.message))
  const btn = (name) => page.getByRole('button', { name, exact: true })
  const go = (path) => page.goto(base + path)
  const post = (url, data) =>
    context.request.post(base + '/__fixture/' + url, { headers: { origin: base }, data })
  assert.equal((await post('rpc/radio_workspace', {})).status(), 401)
  assert.equal(
    (
      await context.request.post(base + '/__fixture/login', {
        headers: { origin: 'http://elsewhere.invalid' },
      })
    ).status(),
    403,
  )

  await go('/admin/login')
  await btn('فتح المعاينة المحلية').click()
  await page.getByRole('heading', { name: 'إدارة المحتوى' }).waitFor()
  await go('/admin/media')
  await page.getByLabel('بحث في المكتبة').fill('مزدوجة')
  assert.equal(await page.locator('.library li').count(), 1)
  await page.getByLabel('بحث في المكتبة').fill('')
  const clip = await readFile('tests/media/a-low-single.mp3')
  const atLimit = Buffer.alloc(5 * 1024 * 1024, clip)
  const uploadBytes = (data) => context.request.post(base + '/__fixture/media?name=boundary.mp3', {
    headers: { origin: base, 'Content-Type': 'audio/mpeg' }, data,
  })
  assert.equal((await uploadBytes(atLimit)).status(), 201)
  assert.equal((await uploadBytes(Buffer.concat([atLimit, Buffer.alloc(1)]))).status(), 413)
  const input = page.locator('input[type=file]')
  await input.setInputFiles({
    name: 'invalid.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('no MP3'),
  })
  await btn('إضافة إلى مكتبة المعاينة').click()
  await page.getByText('تعذّرت قراءة ملف MP3 صالح بهذا الاسم.').waitFor()
  await input.setInputFiles({ name: 'test-marker.mp3', mimeType: 'audio/mpeg', buffer: clip })
  await btn('إضافة إلى مكتبة المعاينة').click()
  await page.getByText('أضيف الملف إلى مكتبة المعاينة المحلية.').waitFor()
  await page.getByLabel('اسم القائمة').fill('قائمة اختبار')
  const add = async (value) => {
    await page.getByLabel('اختيار مقطع').selectOption(value)
    await btn('إضافة المقطع').click()
  }
  await add('a-low-single')
  await add('b-high-double')
  await btn('تقديم إشارة مزدوجة').click()
  await page.getByLabel('اقتراحها قائمةً يومية').check()
  await btn('حفظ مسودة القائمة').click()
  await page.getByText('حُفظت مسودة القائمة.').waitFor()
  await page.reload()
  await btn('تحرير القائمة').click()
  assert.match(await page.locator('.order-list li').first().innerText(), /إشارة مزدوجة/)
  assert.ok(await page.getByLabel('اقتراحها قائمةً يومية').isChecked())
  assert.ok(await btn('نشر القائمة على المحطة').isDisabled())
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))

  await go('/admin/programs')
  await page.getByLabel('اسم المناسبة').fill('مناسبة اختبار')
  await page.getByLabel('التاريخ بتوقيت عمّان').fill('2099-05-01')
  await page.getByLabel('وقت البداية').fill('23:45')
  await page.getByLabel('وقت النهاية').fill('00:15')
  await page.getByLabel('نسخ ترتيب المقاطع من قائمة محفوظة').selectOption({ label: 'قائمة اختبار' })
  await btn('معاينة الفترة').click()
  await page.locator('.summary').waitFor()
  assert.deepEqual(await page.locator('.summary li').allTextContents(), ['إشارة مزدوجة', 'إشارة منخفضة'])
  await btn('حفظ مسودة البرنامج').click()
  await page.getByText('حُفظت مسودة البرنامج.').waitFor()
  await page.reload()
  await btn('تحرير المسودة').click()
  assert.equal(await page.getByLabel('وقت النهاية').inputValue(), '00:15')
  await page.getByLabel('طوال اليوم').check()
  await btn('حفظ مسودة البرنامج').click()
  await page.getByText('حُفظت مسودة البرنامج.').waitFor()
  assert.ok(await btn('نشر البرنامج').isDisabled())
  await page.getByText('النشر على المحطة متاح من لوحة الإدارة المستضافة.').waitFor()
  page.once('dialog', (dialog) => dialog.accept())
  await btn('حذف المسودة').click()
  await page.getByText('لا توجد برامج محفوظة.').waitFor()
  await btn('خروج').click()
  await page.waitForURL(base + '/admin/login')
  await btn('فتح المعاينة المحلية').waitFor()
  assert.equal((await post('rpc/radio_workspace', {})).status(), 401)
  console.log(
    'Fixture session guards, upload rejection/acceptance, search, saved order, daily selection, draft preview/edit/delete and reload passed.',
  )

  await page.clock.install()
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    window.fixturePlayback = []
    HTMLMediaElement.prototype.play = function () {
      window.fixturePlayback.push(this)
      return play.call(this)
    }
  })
  await go('/listen')
  await btn('تشغيل العينة').click()
  await page.getByText('قيد التشغيل على هذا الجهاز').waitFor()
  await btn('كتم الصوت').click()
  assert.equal(await btn('إلغاء الكتم').getAttribute('aria-pressed'), 'true')
  assert.ok(await page.evaluate(() => window.fixturePlayback[0].muted))
  await page.getByRole('slider', { name: 'مستوى الصوت' }).press('End')
  assert.equal(await page.evaluate(() => window.fixturePlayback[0].volume), 1)
  await btn('إيقاف').click()
  await page.getByText('متوقف على هذا الجهاز').waitFor()
  assert.ok(await page.evaluate(() => !window.fixturePlayback[0].hasAttribute('src')))
  await btn('تشغيل العينة').click()
  await page.getByText('قيد التشغيل على هذا الجهاز').waitFor()
  assert.ok(await page.evaluate(() => window.fixturePlayback.length === 2 &&
    window.fixturePlayback[1] !== window.fixturePlayback[0] && window.fixturePlayback[1].muted))
  await btn('إيقاف').click()

  // Freeze metadata polling as if this fixture tab were in the background.
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { value: true, configurable: true }))
  await page.clock.fastForward(61000)
  await page.getByText(/معلومات قديمة/).waitFor()
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.getByText(/معلومات قديمة/).waitFor({ state: 'hidden' })

  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new DOMException('fixture rejection', 'NotAllowedError'))
  })
  await page.reload()
  await btn('تشغيل العينة').click()
  await page.getByText('اضغط تشغيل للسماح بالصوت.').waitFor()
  const retryPage = await context.newPage()
  let attempts = 0
  await retryPage.route('**/__fixture/marker', (route) => {
    attempts++
    return route.abort('failed')
  })
  await retryPage.goto(base + '/listen')
  await retryPage.getByRole('button', { name: 'تشغيل العينة' }).click()
  await retryPage.getByText('انقطع الصوت. اضغط تشغيل للمحاولة.').waitFor({ timeout: 18000 })
  assert.equal(attempts, 4)
  assert.deepEqual(faults, [])
  console.log(
    'Chrome ' +
      browser.version() +
      ': local sample play, stop/restart, mute, volume, gesture rejection and three bounded reconnect attempts passed.',
  )
} finally {
  await browser?.close()
  await server.close()
}
