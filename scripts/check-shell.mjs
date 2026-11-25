import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

// Exercise the built site. Vite preview uses the existing dist directory.
const server = await preview({ configLoader: 'native', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
const base = 'http://127.0.0.1:' + server.httpServer.address().port
let browser
try {
  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.name))
  const pages = {
    '/listen': 'مشغّل الفرع',
    '/admin': 'لوحة الإدارة',
    '/admin/media': 'مكتبة الصوت',
    '/admin/programs': 'البرامج المجدولة',
    '/admin/login': 'دخول المسؤول',
    '/demo': 'دليل التجربة',
    '/missing': 'الصفحة غير موجودة',
  }
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 840 })
    for (const [path, heading] of Object.entries(pages)) {
      const response = await page.goto(base + path)
      assert.equal(response?.status(), 200)
      await page.getByRole('heading', { name: heading, level: 1, exact: true }).waitFor()
      assert.ok(await page.evaluate(() => {
        const root = document.documentElement
        return root.lang === 'ar' && root.dir === 'rtl' && root.scrollWidth <= window.innerWidth
      }), 'Arabic layout at ' + width + ' on ' + path)
      if (path === '/listen') assert.ok(await page.getByRole('button', { name: 'تشغيل البث' }).isDisabled())
    }
    console.log('Seven routes rendered at ' + width + 'px')
  }
  await page.goto(base + '/listen')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  assert.ok(await page.locator('#main').evaluate(el => el === document.activeElement))
  await page.getByRole('navigation').getByRole('link', { name: 'مكتبة الصوت' }).click()
  await page.getByRole('link', { name: 'تسجيل الدخول', exact: true }).click()
  await page.getByRole('heading', { name: 'خدمة تسجيل الدخول غير متصلة' }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Keyboard skip and protected-section navigation passed in Chrome ' + browser.version())

  for (const name of ['a-low-single', 'b-high-double']) {
    const bytes = await readFile(new URL('../tests/media/' + name + '.mp3', import.meta.url))
    const duration = await page.evaluate(async data => {
      const ctx = new OfflineAudioContext(1, 44100, 44100)
      const buffer = await ctx.decodeAudioData(Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer)
      return buffer.duration
    }, bytes.toString('base64'))
    assert.ok(duration >= 5.99 && duration < 6.2)
    console.log(name + ' decoded locally (' + duration.toFixed(2) + ' seconds)')
  }
} finally {
  await browser?.close()
  await server.close()
}
