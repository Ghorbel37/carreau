const { test, expect } = require('@playwright/test');
const { readBoard, currentTarget, pathTo, press, solve, swipe, trackErrors } = require('./helpers');

const SKETCH = { tl: { w: 1, h: 2 }, tr: { w: 2, h: 2 }, bl: { w: 1, h: 1 }, br: { w: 2, h: 1 } };

let errors;
test.beforeEach(async ({ page }) => { errors = trackErrors(page); });
test.afterEach(() => { expect(errors, 'no page errors').toEqual([]); });

test.describe('home and controls', () => {
  test('opens on the mode menu with the sketched board', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('.mode')).toHaveText([/Rush/, /Levels/, /Memory/, /Zen/]);
    expect(await readBoard(page, '#board')).toEqual(SKETCH);
  });

  test('swipes reshape the pair on the side where they start', async ({ page }) => {
    await page.goto('/');
    await swipe(page, .5, .25, 80, 0);          // ⇄ in the top half
    let s = await readBoard(page, '#board');
    expect(s.tl).toEqual({ w: 2, h: 2 });       // rectangle vertical → carreau grand
    expect(s.tr).toEqual({ w: 1, h: 2 });
    expect(s.bl).toEqual(SKETCH.bl);
    await swipe(page, .75, .5, 0, -80);         // ⇅ in the right half
    s = await readBoard(page, '#board');
    expect(s.tr).toEqual({ w: 1, h: 1 });
    expect(s.br).toEqual({ w: 2, h: 2 });
    await swipe(page, .5, .75, 6, 4);           // too short to count
    expect(await readBoard(page, '#board')).toEqual(s);
  });

  test('edge arrows work like swipes', async ({ page }) => {
    await page.goto('/');
    await page.locator('.edge.bottom').click();
    expect((await readBoard(page, '#board')).bl).toEqual({ w: 2, h: 1 }); // carreau → rectangle horizontal
    await page.locator('.edge.left').click();
    expect((await readBoard(page, '#board')).bl).toEqual({ w: 2, h: 2 });
  });

  test('sound and vibration toggles are remembered', async ({ page }) => {
    await page.goto('/');
    await page.locator('#soundBtn').click();
    await page.locator('#vibeBtn').click();
    await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#vibeBtn')).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#vibeBtn')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#soundBtn').click();
    await expect(page.locator('#soundBtn')).toHaveAttribute('aria-pressed', 'true');
  });

  test('vibrates on a correct match only while vibration is on', async ({ page }) => {
    await page.addInitScript(() => {
      window.__buzz = [];
      Object.defineProperty(navigator, 'vibrate', { value: p => { window.__buzz.push(p); return true; }, configurable: true });
    });
    await page.goto('/');
    await page.locator('[data-mode=zen]').click();
    await solve(page);
    await expect.poll(() => page.evaluate(() => window.__buzz.length)).toBe(1);
    await page.locator('#vibeBtn').click();               // off (the toggle itself buzzes once as feedback)
    const after = await page.evaluate(() => window.__buzz.length);
    await expect(page.locator('#hud .cur.enter')).toBeVisible();
    await page.waitForTimeout(400);
    await solve(page);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__buzz.length)).toBe(after);
  });
});

test.describe('Rush', () => {
  test('scores matches, adds time and ends when the clock runs out', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-mode=rush]').click();
    await expect(page.locator('#hud')).toBeVisible();
    for (let i = 0; i < 3; i++) {
      await solve(page);
      await page.clock.runFor(400);
    }
    await expect(page.locator('#v0')).toHaveText('3');
    await expect(page.locator('#v1')).toHaveText('3');
    await page.clock.runFor(30_000);
    await expect(page.locator('#v2')).toHaveText(/^(2\d|3\d)$/);
    await page.clock.runFor(35_000);
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#resTitle')).toHaveText('New best!');
    await expect(page.locator('#resText')).toContainText('3 shapes matched');
    await page.locator('#resAlt').click();
    await expect(page.locator('#bestRush')).toHaveText('Best 3');
  });
});

test.describe('Zen', () => {
  test('has no clock and keeps the best run', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=zen]').click();
    await expect(page.locator('#bar')).toBeHidden();
    for (let i = 0; i < 2; i++) {
      await solve(page);
      await expect(page.locator('#v0')).toHaveText(String(i + 1));
      await page.waitForTimeout(400);
    }
    await page.locator('#quit').click();
    await expect(page.locator('#bestZen')).toHaveText('Best run 2');
  });
});

test.describe('Memory', () => {
  test('hides the target, rewards a rebuild and takes a life for a miss', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-mode=memory]').click();

    // Round 1: remember the shape, then rebuild it.
    let target = await currentTarget(page);
    const firstMove = page.keyboard.press('ArrowUp'); // input is locked while memorizing
    await firstMove;
    expect(await readBoard(page, '#board')).toEqual(SKETCH);
    await page.clock.runFor(2_000);
    await expect(page.locator('#targets .cur')).toHaveClass(/veil/);
    await press(page, await pathTo(page, target));
    await expect(page.locator('#v0')).toHaveText('1');
    await page.clock.runFor(700);

    // Rounds 2–4: deliberately miss until out of lives.
    for (let lives = 2; lives >= 0; lives--) {
      target = await currentTarget(page);
      const right = await pathTo(page, target);
      await page.clock.runFor(2_000);
      // Exactly as many moves as needed, but never the right set: repeat one edge the target doesn't use.
      const all = ['top', 'bottom', 'left', 'right'];
      const w = all.find(e => !right.includes(e)) ?? right[0];
      await press(page, Array(right.length).fill(w));
      await expect(page.locator('#v1')).toHaveText('♥'.repeat(lives) + '♡'.repeat(3 - lives));
      await page.clock.runFor(1_500);
    }
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#resText')).toContainText('1 shapes rebuilt');
  });
});

test.describe('Levels', () => {
  test('clears levels in order, earns stars and unlocks the next', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=levels]').click();
    await expect(page.locator('.lvl').nth(0)).toBeEnabled();
    await expect(page.locator('.lvl').nth(1)).toBeDisabled();
    await page.locator('.lvl').nth(0).click();

    for (let n = 1; n <= 9; n++) {
      await expect(page.locator('#v0')).toHaveText(String(n));
      const targets = await page.locator('#targets .board').count();
      expect(targets).toBe(n <= 8 ? 1 : 2);
      for (let t = 0; t < targets; t++) await solve(page);
      await expect(page.locator('#resTitle')).toHaveText(`Level ${n} cleared`);
      await expect(page.locator('#resStars')).toHaveText('★★★');
      if (n < 9) await page.locator('#resMain').click();
    }
    await page.locator('#resAlt').click();
    await expect(page.locator('#starTotal')).toHaveText('★ 27 / 90');
    await expect(page.locator('.lvl').nth(9)).toBeEnabled();
    await expect(page.locator('.lvl').nth(10)).toBeDisabled();
  });

  test('runs out of moves and offers a retry', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=levels]').click();
    await page.locator('.lvl').nth(0).click();
    const right = await pathTo(page, await currentTarget(page));
    const wrong = ['top', 'bottom', 'left', 'right'].find(e => !right.includes(e));
    const budget = Number((await page.locator('#v2').textContent()).split('/')[1]);
    await press(page, Array(budget).fill(wrong));
    await expect(page.locator('#resTitle')).toHaveText('Out of moves.');
    await page.locator('#resMain').click();
    await expect(page.locator('#v2')).toHaveText(`0/${budget}`);
  });

  for (const [detours, earned] of [[1, 2], [2, 1]]) {
    test(`${detours} detour${detours > 1 ? 's' : ''} earn${detours > 1 ? '' : 's'} ${earned} star${earned > 1 ? 's' : ''}`, async ({ page }) => {
      await page.goto('/');
      await page.locator('[data-mode=levels]').click();
      await page.locator('.lvl').nth(0).click();
      const right = await pathTo(page, await currentTarget(page));
      const wrong = ['top', 'bottom', 'left', 'right'].find(e => !right.includes(e));
      await press(page, [...Array(detours * 2).fill(wrong), ...right]);
      await expect(page.locator('#resTitle')).toHaveText('Level 1 cleared');
      const lit = await page.locator('#resStars').evaluate(el => el.firstChild.textContent);
      expect(lit).toBe('★'.repeat(earned));
    });
  }
});
