const { test, expect } = require('@playwright/test');
const { solve, trackErrors } = require('./helpers');

test('ships its own fonts, icons and manifest', async ({ page, request }) => {
  const errors = trackErrors(page);
  const failed = [];
  page.on('requestfailed', r => failed.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('700 16px Kalam'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('16px "Atkinson Hyperlegible"'))).toBe(true);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Carreau');
  for (const icon of manifest.icons) expect((await request.get('/' + icon.src)).ok()).toBe(true);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test('uses native haptics inside the Capacitor app', async ({ page }) => {
  await page.addInitScript(() => {
    window.__native = [];
    const rec = name => opts => { window.__native.push([name, opts]); return Promise.resolve(); };
    window.Capacitor = { Plugins: { Haptics: { impact: rec('impact'), notification: rec('notification') } } };
  });
  await page.goto('/');
  await page.locator('[data-mode=zen]').click();
  await solve(page);
  await expect.poll(() => page.evaluate(() => window.__native.length)).toBe(1);
  expect((await page.evaluate(() => window.__native))[0][0]).toBe('impact');
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('keeps working without a connection after the first visit', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active.state;
    });
    await page.reload(); // now controlled by the service worker
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.mode')).toHaveCount(4);
    await page.locator('[data-mode=zen]').click();
    await solve(page);
    await expect(page.locator('#v0')).toHaveText('1');
    await context.setOffline(false);
  });
});
