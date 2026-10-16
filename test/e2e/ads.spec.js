const { test, expect } = require('@playwright/test');
const { returning, quitToMenu, solve, trackErrors } = require('./helpers');

// A fake AdMob plugin that records calls. `reward` decides whether rewarded ads pay out.
async function fakeAds(page, { platform = 'app', reward = true, privacy = false } = {}) {
  await page.addInitScript(({ platform, reward, privacy }) => {
    window.CARREAU_PLATFORM = platform;
    window.__adsCalls = [];
    const rec = (name, result) => async arg => { window.__adsCalls.push(name); return typeof result === 'function' ? result(arg) : result; };
    window.__adsMock = {
      initialize: rec('initialize'),
      requestConsentInfo: rec('requestConsentInfo', { status: 'NOT_REQUIRED', isConsentFormAvailable: false, privacyOptionsRequirementStatus: privacy ? 'REQUIRED' : 'NOT_REQUIRED' }),
      showConsentForm: rec('showConsentForm'),
      showPrivacyOptionsForm: rec('showPrivacyOptionsForm'),
      addListener: () => ({ remove() {} }),
      showBanner: rec('showBanner'),
      removeBanner: rec('removeBanner'),
      prepareInterstitial: rec('prepareInterstitial', { adUnitId: 'test' }),
      showInterstitial: rec('showInterstitial'),
      prepareRewardVideoAd: rec('prepareRewardVideoAd', { adUnitId: 'test' }),
      showRewardVideoAd: rec('showRewardVideoAd', reward ? { type: 'reward', amount: 1 } : null),
    };
  }, { platform, reward, privacy });
}
const calls = (page, name) => page.evaluate(n => window.__adsCalls.filter(c => c === n).length, name);
// Let the walls crash three times (Gates, no special walls).
const crashOut = async page => { for (let i = 0; i < 3; i++) await page.clock.runFor(8_000); };

let errors;
test.beforeEach(async ({ page }) => { errors = trackErrors(page); await returning(page); });
test.afterEach(() => { expect(errors, 'no page errors').toEqual([]); });

test('app: banner on menu screens, never during play', async ({ page }) => {
  await fakeAds(page);
  await page.goto('/');
  await expect.poll(() => calls(page, 'showBanner')).toBe(1);
  await page.locator('[data-mode=zen]').click();
  await expect.poll(() => calls(page, 'removeBanner')).toBe(1);
  await quitToMenu(page);
  await expect.poll(() => calls(page, 'showBanner')).toBe(2);
});

test('app: out of lives in Gates offers one rewarded continue', async ({ page }) => {
  await fakeAds(page);
  await page.clock.install();
  await page.goto('/?kinds=&drops=');
  await page.locator('[data-mode=gates]').click();
  await crashOut(page);
  await expect(page.locator('#resTitle')).toHaveText('Out of lives');
  await expect(page.locator('#resMain')).toHaveText('▶ Continue');
  await page.locator('#resMain').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#v2')).toHaveText('♥♡♡');
  expect(await calls(page, 'showRewardVideoAd')).toBe(1);
  await solve(page); // the run really continues
  await expect(page.locator('#v1')).toHaveText('×1');
  await page.clock.runFor(8_000);
  await page.clock.runFor(8_000);
  await expect(page.locator('#resTitle')).toHaveText(/Crashed out\.|New best!/); // only one continue per run
});

test('app: No thanks ends the run; a full-screen ad shows at most every second game over', async ({ page }) => {
  await fakeAds(page);
  await page.clock.install();
  await page.goto('/?kinds=&drops=');
  for (let run = 1; run <= 2; run++) {
    await page.locator('[data-mode=gates]').click();
    await crashOut(page);
    await page.locator('#resAlt').click(); // No thanks
    await expect(page.locator('#resTitle')).toHaveText(/Crashed out\.|New best!/);
    await page.locator('#resAlt').click(); // Menu
    await expect(page.locator('#home')).toBeVisible();
    expect(await calls(page, 'showInterstitial'), `after game over ${run}`).toBe(run === 1 ? 0 : 1);
  }
});

test('app: Rush offers 15 more seconds once', async ({ page }) => {
  await fakeAds(page);
  await page.clock.install();
  await page.goto('/');
  await page.locator('[data-mode=rush]').click();
  await page.clock.runFor(65_000);
  await expect(page.locator('#resMain')).toHaveText('▶ +15 s');
  await page.locator('#resMain').click();
  await expect(page.locator('#v2')).toHaveText('15');
  await page.clock.runFor(20_000);
  await expect(page.locator('#resTitle')).toHaveText(/Time's up\.|New best!/);
});

test('app: no continue in Daily, and no reward means no continue', async ({ page }) => {
  await fakeAds(page, { reward: false });
  await page.clock.install();
  await page.goto('/?kinds=&drops=');
  await page.locator('[data-mode=daily]').click();
  await crashOut(page);
  await expect(page.locator('#resTitle')).toHaveText('Daily done.');
  await page.locator('#resAlt').click();
  await page.locator('[data-mode=gates]').click();
  await crashOut(page);
  await page.locator('#resMain').click(); // Continue, but the ad pays nothing
  await expect(page.locator('#resTitle')).toHaveText(/Crashed out\.|New best!/);
});

test('app: Privacy choices on the Stats screen when consent rules apply', async ({ page }) => {
  await fakeAds(page, { privacy: true });
  await page.goto('/');
  await expect.poll(() => calls(page, 'initialize')).toBe(1);
  await page.locator('#statsBtn').click();
  await page.locator('#adPrivacy').click();
  expect(await calls(page, 'showPrivacyOptionsForm')).toBe(1);
});

test('web: never touches ads, even if a backend exists', async ({ page }) => {
  await fakeAds(page, { platform: 'web' });
  await page.clock.install();
  await page.goto('/?kinds=&drops=');
  await page.locator('[data-mode=gates]').click();
  await crashOut(page);
  await expect(page.locator('#resTitle')).toHaveText(/Crashed out\.|New best!/);
  await page.locator('#resAlt').click();
  expect(await page.evaluate(() => window.__adsCalls)).toEqual([]);
  await page.locator('#statsBtn').click();
  await expect(page.locator('#adPrivacy')).toBeHidden();
});
