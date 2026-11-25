import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { chromium } from 'playwright-core'

// This check owns an ephemeral database and never opens the user's saved fixture workspace.
process.env.RADIO_FIXTURE_DB = 'memory://'
const server = await createServer({
  mode: 'fixture',
  configLoader: 'native',
  cacheDir: '.verification/vite-fixture-cache',
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
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
  page.setDefaultTimeout(15000)
  const faults = []
  page.on('pageerror', (err) => faults.push(err.message))
  const btn = (name) => page.getByRole('button', { name, exact: true })
  const go = (path) => page.goto(base + path)
  const captures = process.env.RADIO_FIXTURE_SCREENSHOTS
  async function capture(name) {
    const viewport = page.viewportSize()
    for (const [size, width] of [['mobile', 390], ['desktop', 1440]]) {
      await page.setViewportSize({ width, height: 930 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth &&
        Array.from(document.querySelectorAll('dialog[open]')).every((d) => d.scrollWidth <= d.clientWidth + 2)),
      'No overflow in ' + name + ' at ' + width)
      if (captures) {
        await mkdir(captures, { recursive: true })
        await page.screenshot({ path: captures + '/' + name + '-' + size + '.png' })
      }
    }
    await page.setViewportSize(viewport)
  }
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
  await page.getByRole('heading', { name: 'قائمة البث اليومي' }).waitFor()
  const legacy = await post('rpc/radio_save_draft', {
    p_kind: 'playlist', p_id: crypto.randomUUID(), p_revision: 0,
    p_doc: { title: 'قائمة اختبار مستقلة', tracks: ['b-high-double'], daily: true },
  })
  assert.ok(legacy.ok())
  await go('/admin/media')
  await page.getByLabel('التصنيف', { exact: true }).selectOption('diagnostic')
  await page.getByLabel('بحث في المكتبة').fill('مزدوجة')
  assert.equal(await page.locator('.library li').count(), 1)
  await btn('استماع تجريبي إلى إشارة مزدوجة').click()
  await page.locator('.library audio[src^="blob:"]').waitFor()
  await btn('إيقاف الاستماع التجريبي إلى إشارة مزدوجة').click()
  await page.locator('.library audio').waitFor({ state: 'detached' })
  const clip = await readFile('tests/media/a-low-single.mp3')
  const atLimit = Buffer.alloc(5 * 1024 * 1024, clip)
  const uploadBytes = (data) => context.request.post(base + '/__fixture/media?name=boundary.mp3', {
    headers: { origin: base, 'Content-Type': 'audio/mpeg' }, data,
  })
  assert.equal((await uploadBytes(atLimit)).status(), 201)
  assert.equal((await uploadBytes(Buffer.concat([atLimit, Buffer.alloc(1)]))).status(), 413)
  await go('/admin')
  const picker = page.getByRole('dialog', { name: 'إضافة صوتيات' })
  await page.getByText('بدأ المحرّر من ترتيب المحطة. تُنشأ نسخة التحضير عند أول حفظ.').waitFor()
  await btn('تقديم إشارة مزدوجة').click()
  const order = () => page.locator('.order-list .track-name strong').allTextContents()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'إشارة منخفضة'])
  await page.setViewportSize({ width: 1440, height: 1000 })
  await btn('سحب إشارة مزدوجة للترتيب').focus()
  await page.keyboard.press('Space')
  await page.locator('.order-list li[data-dragging="true"]').waitFor()
  await page.keyboard.press('ArrowDown')
  await page.waitForFunction(() => {
    const active = document.querySelector('.order-list li[data-dragging="true"]')
    return active && new DOMMatrix(getComputedStyle(active).transform).m42 > 10
  })
  await page.keyboard.press('Space')
  await page.locator('.order-list li[data-dragging="true"]').waitFor({ state: 'detached' })
  assert.deepEqual(await order(), ['إشارة منخفضة', 'إشارة مزدوجة'])
  await page.locator('.order-list').scrollIntoViewIfNeeded()
  const handle = await btn('سحب إشارة مزدوجة للترتيب').boundingBox()
  const target = await page.locator('.order-list li').first().boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2, target.y + target.height / 2, { steps: 12 })
  await page.mouse.up()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'إشارة منخفضة'])
  await page.setViewportSize({ width: 390, height: 844 })
  await btn('استماع تجريبي إلى إشارة مزدوجة').click()
  await page.locator('.ordered-editor audio[src^="blob:"]').waitFor()
  await btn('استماع تجريبي إلى إشارة منخفضة').click()
  await page.getByLabel('استماع تجريبي إلى إشارة منخفضة', { exact: true }).filter({ visible: true }).last().waitFor()
  assert.equal(await page.locator('audio').count(), 1)
  await btn('إزالة إشارة منخفضة من القائمة').click()
  assert.deepEqual(await order(), ['إشارة مزدوجة'])
  await btn('تراجع عن الإزالة').click()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'إشارة منخفضة'])
  await btn('إضافة صوتيات').click()
  await picker.getByRole('button', { name: 'رفع ملفات جديدة' }).click()
  let uploadCount = 0
  const lost = async (route) => {
    const response = await route.fetch()
    uploadCount++
    assert.equal(response.status(), 201)
    await route.abort('failed')
  }
  await page.route(/\/__fixture\/media\?name=CDR-test-marker\.mp3&key=/, lost)
  await picker.locator('input[type=file]').setInputFiles([
    { name: 'CDR-test-marker.mp3', mimeType: 'audio/mpeg', buffer: clip },
    { name: 'invalid.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('no MP3') },
  ])
  await picker.getByRole('button', { name: 'رفع الملفات المختارة' }).click()
  await picker.getByText('تعذّرت قراءة ملف MP3 صالح بهذا الاسم.').waitFor()
  await picker.getByRole('button', { name: 'تحقّق مجددًا' }).click()
  await picker.getByText('أضيف إلى المكتبة').waitFor()
  assert.equal(uploadCount, 1)
  await picker.getByRole('button', { name: 'إغلاق', exact: true }).click()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'إشارة منخفضة', 'CDR-test-marker.mp3'])
  await page.getByRole('region', { name: 'قائمة البث اليومي' }).getByText('حفظ للتحضير فقط', { exact: true }).waitFor()
  await page.getByText('مقارنة مع القائمة المفعّلة').click()
  const comparison = page.getByLabel('الفروق عن ترتيب المحطة')
  await comparison.getByText('مقاطع أضيفت').waitFor()
  assert.deepEqual(await comparison.locator('ol').last().locator('li').allTextContents(), ['CDR-test-marker.mp3'])
  await btn('حفظ نسخة التحضير').click()
  await page.getByText('حُفظت نسخة البث اليومي في التطبيق للتحضير.').waitFor()
  await page.reload()
  await page.locator('.order-list li').nth(2).getByText('CDR-test-marker.mp3', { exact: true }).waitFor()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'إشارة منخفضة', 'CDR-test-marker.mp3'])
  await page.getByText('ترتيب البث اليومي المحفوظ في التطبيق').waitFor()
  await btn('مراجعة نسخة التحضير').click()
  await page.getByRole('dialog', { name: 'مراجعة نسخة التحضير' }).getByText('يُحفظ الترتيب في مساحة التجربة.').waitFor()
  await btn('العودة إلى القائمة').click()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))

  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const second = await secondContext.newPage()
  const secondBtn = (name) => second.getByRole('button', { name, exact: true })
  await second.goto(base + '/admin/login')
  await secondBtn('فتح المعاينة المحلية').click()
  await second.waitForURL(base + '/admin')
  await second.goto(base + '/admin/playlists')
  await secondBtn('سحب إشارة مزدوجة للترتيب').waitFor()
  await second.locator('.order-list').scrollIntoViewIfNeeded()
  const touchHandle = await secondBtn('سحب إشارة مزدوجة للترتيب').boundingBox()
  const touchSource = await second.locator('.order-list li').first().boundingBox()
  const touchTarget = await second.locator('.order-list li').nth(1).boundingBox()
  const cdp = await secondContext.newCDPSession(second)
  const x = Math.round(touchHandle.x + touchHandle.width / 2)
  const y = Math.round(touchHandle.y + touchHandle.height / 2)
  const finalY = Math.round(y + touchTarget.y - touchSource.y)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y + (finalY - y) * step / 10) }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  assert.deepEqual(await second.locator('.order-list .track-name strong').allTextContents(),
    ['إشارة منخفضة', 'إشارة مزدوجة', 'CDR-test-marker.mp3'])
  await secondBtn('حفظ نسخة التحضير').click()
  await second.getByText('حُفظت نسخة البث اليومي في التطبيق للتحضير.').waitFor()
  await secondContext.close()
  await btn('تقديم CDR-test-marker.mp3').click()
  await btn('حفظ نسخة التحضير').click()
  await page.getByText(/حُفظت نسخة أحدث في جلسة أخرى/).waitFor()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'CDR-test-marker.mp3', 'إشارة منخفضة'])
  await btn('استخدام النسخة الأحدث').click()
  assert.deepEqual(await order(), ['إشارة منخفضة', 'إشارة مزدوجة', 'CDR-test-marker.mp3'])
  await page.getByText('عرض ترتيب المحطة', { exact: true }).click()
  await btn('استخدام ترتيب المحطة في المحرّر').click()
  assert.deepEqual(await order(), ['إشارة منخفضة', 'إشارة مزدوجة'])
  page.once('dialog', (dialog) => dialog.dismiss())
  await btn('تراجع عن التغييرات').click()
  assert.deepEqual(await order(), ['إشارة منخفضة', 'إشارة مزدوجة'])
  page.once('dialog', (dialog) => dialog.accept())
  await btn('تراجع عن التغييرات').click()
  await capture('fixture-daily')

  const collectionSource = () => picker.getByRole('button', { name: 'المجموعات', exact: true }).click()
  const selectCollection = (title) => picker.getByLabel('المجموعة الصوتية').selectOption({ label: title })
  const selectTracks = async (...titles) => {
    for (const title of titles) await picker.getByRole('checkbox', { name: new RegExp(title) }).check()
    await picker.getByRole('button', { name: 'إضافة المحدد إلى القائمة' }).click()
  }
  const primaryCollection = 'تحقق التسليم · المقاطع الأساسية'
  const otherCollection = 'تحقق التسليم · مقاطع مشتركة'
  await go('/admin/media')
  await btn('المجموعات').click()
  assert.ok((await btn('المجموعات').boundingBox()).height >= 44)
  await btn('إنشاء مجموعة').click()
  await page.getByLabel('اسم المجموعة').fill(primaryCollection)
  await btn('إضافة صوتيات').click()
  await selectTracks('إشارة منخفضة', 'إشارة مزدوجة', 'CDR-test-marker')
  await btn('تقديم إشارة مزدوجة').click()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'إشارة منخفضة', 'CDR-test-marker.mp3'])
  await btn('حفظ المجموعة').click()
  await page.getByText('حُفظت المجموعة.').waitFor()
  await page.reload()
  await btn('المجموعات').click()
  await btn('تحرير مجموعة ' + primaryCollection).click()
  await btn('سحب إشارة مزدوجة للترتيب').waitFor()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'إشارة منخفضة', 'CDR-test-marker.mp3'])
  await btn('العودة إلى المجموعات').click()
  await btn('إنشاء مجموعة').click()
  await page.getByLabel('اسم المجموعة').fill(otherCollection)
  await btn('إضافة صوتيات').click()
  await collectionSource()
  await selectCollection(primaryCollection)
  await capture('fixture-picker')
  // Checked in reverse, appended in saved collection order.
  await selectTracks('CDR-test-marker', 'إشارة مزدوجة')
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'CDR-test-marker.mp3'])
  await btn('حفظ المجموعة').click()
  await page.getByText('حُفظت المجموعة.').waitFor()
  await btn('العودة إلى المجموعات').click()
  await capture('fixture-collections')
  const beforeProgram = await (await post('rpc/radio_workspace', {})).json()
  const dailyId = beforeProgram.dailyEditorId
  assert.notEqual(dailyId, beforeProgram.dailyId)
  const groups = beforeProgram.collections
  assert.deepEqual(groups.find((item) => item.title === otherCollection).tracks,
    [groups.find((item) => item.title === primaryCollection).tracks[0], groups.find((item) => item.title === primaryCollection).tracks[2]])

  await go('/admin/programs')
  await btn('إنشاء برنامج خاص').click()
  await page.getByLabel('اسم البرنامج').fill('مناسبة اختبار')
  await page.getByLabel('التاريخ بتوقيت عمّان').fill('2099-05-01')
  await page.getByLabel('وقت البداية').fill('23:45')
  await page.getByLabel('وقت النهاية').fill('00:15')
  await page.getByText('وقت النهاية في اليوم التالي.').waitFor()
  await btn('متابعة إلى المقاطع').click()
  assert.deepEqual(await order(), [])
  await btn('إضافة صوتيات').click()
  await collectionSource()
  await selectCollection(primaryCollection)
  await picker.getByRole('button', { name: 'إضافة المجموعة كاملة' }).click()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'إشارة منخفضة', 'CDR-test-marker.mp3'])
  await capture('fixture-program')
  await btn('حفظ دون نشر').click()
  await page.getByText('حُفظ البرنامج دون نشر.').waitFor()
  await go('/admin/media')
  await btn('المجموعات').click()
  await btn('تحرير مجموعة ' + primaryCollection).click()
  const group = groups.find((item) => item.title === primaryCollection)
  assert.ok((await post('rpc/radio_save_collection', { p_id: group.id, p_revision: group.revision,
    p_doc: { title: otherCollection + ' (جلسة أخرى)', tracks: group.tracks },
  })).ok())
  await page.getByLabel('اسم المجموعة').fill(primaryCollection + ' (محلي)')
  await btn('تقديم إشارة منخفضة').click()
  await btn('حفظ المجموعة').click()
  await page.getByText(/حُفظت نسخة أحدث في جلسة أخرى/).waitFor()
  await btn('الاحتفاظ بتعديلاتي لمراجعتها').click()
  await btn('حفظ المجموعة').click()
  await page.getByText('حُفظت المجموعة.').waitFor()
  assert.deepEqual(await order(), ['إشارة منخفضة', 'إشارة مزدوجة', 'CDR-test-marker.mp3'])
  await go('/admin')
  await btn('سحب إشارة منخفضة للترتيب').waitFor()
  assert.deepEqual(await order(), ['إشارة منخفضة', 'إشارة مزدوجة', 'CDR-test-marker.mp3'])
  assert.equal((await (await post('rpc/radio_workspace', {})).json()).dailyEditorId, dailyId)
  await go('/admin/programs')
  await page.reload()
  await btn('تحرير البرنامج').click()
  assert.equal(await page.getByLabel('وقت النهاية').inputValue(), '00:15')
  await page.getByText('خيارات إضافية للتخطيط', { exact: true }).click()
  await page.getByLabel('طوال اليوم').check()
  await btn('متابعة إلى المقاطع').click()
  assert.deepEqual(await order(), ['إشارة مزدوجة', 'إشارة منخفضة', 'CDR-test-marker.mp3'])
  await btn('حفظ دون نشر').click()
  await page.getByText('حُفظ البرنامج دون نشر.').waitFor()
  await page.getByText('إدارة البرنامج المحفوظ').click()
  page.once('dialog', (dialog) => dialog.accept())
  await btn('حذف البرنامج غير المنشور').click()
  await page.getByText(/لا توجد برامج في هذه القائمة/).waitFor()

  const workspaceRoute = '**/__fixture/rpc/radio_workspace'
  await page.route(workspaceRoute, async (route) => {
    const workspace = await (await route.fetch()).json()
    const current = Date.now()
    const program = (title, status, start, end) => ({
      id: title, title, status, startsAt: new Date(current + start).toISOString(),
      endsAt: new Date(current + end).toISOString(), verifiedAt: new Date(current - 86400000).toISOString(),
    })
    await route.fulfill({ json: { ...workspace, programs: [
      program('تحقق نشط', 'scheduled', -60000, 300000),
      program('تحقق قادم', 'scheduled', 300000, 600000),
      program('تحقق منتهٍ', 'scheduled', -600000, -300000),
      program('تحقق ملغى', 'cancelled', -600000, 120000),
    ] } })
  })
  await page.reload()
  await page.getByText('ضمن موعده الآن', { exact: true }).waitFor()
  await page.getByText('قادم', { exact: true }).waitFor()
  await page.getByLabel('عرض البرامج').selectOption('completed')
  await page.getByText('انتهى موعده', { exact: true }).waitFor()
  await page.getByLabel('عرض البرامج').selectOption('cancelled')
  await page.getByText('ملغى', { exact: true }).waitFor()
  await page.unroute(workspaceRoute)

  await btn('خروج').click()
  await page.waitForURL(base + '/admin/login')
  await btn('فتح المعاينة المحلية').waitFor()
  assert.equal((await post('rpc/radio_workspace', {})).status(), 401)
  console.log(
    'Fixture admin guards, upload-and-append recovery, keyboard/touch/desktop reorder, undo, restore, collection creation/rename/order and whole/partial insertion, multi-membership, independent program snapshot, daily binding after reload and navigation, stale revisions, overnight entry, draft deletion and program states passed.',
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
