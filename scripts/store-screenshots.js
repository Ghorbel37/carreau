// Takes the Play Store phone screenshots (1080×1920) of the app build.
//   node scripts/build.js app && ROOT=dist/app node scripts/serve.js &
//   node scripts/store-screenshots.js [outDir]
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const out = path.resolve(process.argv[2] || 'fastlane/metadata/android/en-US/images/phoneScreenshots');
const base = process.env.BASE_URL || 'http://localhost:4173/';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const shot = async (name, setup, url = '') => {
    const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.addInitScript(() => {
      localStorage.setItem('carreau-settings', JSON.stringify({ tutorialDone: true, world: 'square', sound: false, music: false }));
      localStorage.setItem('carreau-save', JSON.stringify({
        bests: { tri: { gates: 31250 }, square: { gates: 64800, precision: 21400, rush: 23, zen: 41 }, hex: { gates: 18600 } },
        unlocked: ['tri', 'square', 'hex'],
        stats: { runs: 58, walls: 1312, clean: 904, bestCombo: 10, bestRun: 47, bestScore: 64800, bestClean: 22, gold: 37, blink: 21, shielded: 6, dailyStreak: 9, dailyLast: -1, seconds: 14820 },
        achievements: ['first', 'combo5', 'combo10', 'run25', 'score10k', 'score50k', 'clean10', 'gold', 'blink', 'shield', 'daily3', 'square', 'hex'],
        daily: {},
      }));
    });
    await page.clock.install();
    await page.goto(base + url);
    await setup(page);
    await page.screenshot({ path: path.join(out, name) });
    await page.close();
  };
  const play = async (page, walls, untilP) => {
    await page.locator('[data-mode=gates]').click();
    for (let i = 0; i < walls; i++) {
      const target = JSON.parse(await page.$eval('#targets .cur svg', el => el.dataset.state));
      const board = JSON.parse(await page.$eval('#board', el => el.dataset.state));
      const path = await page.evaluate(([a, b]) => window.CarreauCore.edgesBetween(a, b), [board, target]);
      for (const s of path) await page.keyboard.press(String(s + 1));
      await page.clock.runFor(700);
    }
    await page.clock.runFor(untilP);
  };

  await shot('1_menu.png', async page => { await page.clock.runFor(500); });
  await shot('2_gates.png', async page => {
    await play(page, 6, 1600);
    // Fit one corner so the green "fits" outline shows.
    const target = JSON.parse(await page.$eval('#targets .cur svg', el => el.dataset.state));
    const board = JSON.parse(await page.$eval('#board', el => el.dataset.state));
    const path = await page.evaluate(([a, b]) => window.CarreauCore.edgesBetween(a, b), [board, target]);
    if (path.length > 1) await page.keyboard.press(String(path[0] + 1));
    await page.clock.runFor(400);
  }, '?kinds=,,,,,,&drops=');
  await shot('3_gold.png', async page => { await play(page, 3, 1400); }, '?kinds=,,,gold&drops=');
  await shot('4_hive.png', async page => {
    await page.locator('.world[data-world=hex]').click();
    await play(page, 2, 1500);
  }, '?kinds=&drops=');
  await shot('5_stats.png', async page => { await page.locator('#statsBtn').click(); await page.clock.runFor(500); });
  await browser.close();
  console.log('Screenshots in', path.relative(process.cwd(), out));
})();
