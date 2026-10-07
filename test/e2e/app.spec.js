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

test.describe('inside the Capacitor app', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__native = [];
      const rec = (plugin, name) => (...args) => { window.__native.push([plugin, name, args[0]]); return Promise.resolve(); };
      window.__back = null;
      window.Capacitor = { Plugins: {
        Haptics: { impact: rec('Haptics', 'impact'), notification: rec('Haptics', 'notification') },
        App: { addListener: (ev, cb) => { if (ev === 'backButton') window.__back = cb; return Promise.resolve({ remove() {} }); }, exitApp: rec('App', 'exitApp') },
        SystemBars: { setStyle: rec('SystemBars', 'setStyle') },
      } };
    });
  });
  const calls = (page, plugin) => page.evaluate(p => window.__native.filter(c => c[0] === p), plugin);

  test('uses native haptics', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=zen]').click();
    await solve(page);
    await expect.poll(async () => (await calls(page, 'Haptics')).length).toBe(1);
    expect((await calls(page, 'Haptics'))[0][1]).toBe('impact');
  });

  test('sets status bar icons for the theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect((await calls(page, 'SystemBars'))[0][2]).toEqual({ style: 'DARK' });
  });

  test('the back button steps back, then leaves the app from the menu', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=levels]').click();
    await page.evaluate(() => window.__back());
    await expect(page.locator('#home')).toBeVisible();
    await page.locator('[data-mode=zen]').click();
    await page.evaluate(() => window.__back());
    await expect(page.locator('#home')).toBeVisible();
    expect(await calls(page, 'App')).toEqual([]);
    await page.evaluate(() => window.__back());
    expect((await calls(page, 'App')).map(c => c[1])).toEqual(['exitApp']);
  });

  test('does not register the web offline cache', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  });
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
    await expect(page.locator('.mode')).toHaveCount(5);
    await page.locator('[data-mode=zen]').click();
    await solve(page);
    await expect(page.locator('#v0')).toHaveText('1');
    await context.setOffline(false);
  });
});
