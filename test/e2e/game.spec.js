const { test, expect } = require('@playwright/test');
const { boardState, currentTarget, pathTo, press, solve, swipe, chooseWorld, trackErrors } = require('./helpers');

// Square world pieces [a, b]: top-left, top-right, bottom-right, bottom-left (see core.js).
const SKETCH = [[2, 1], [2, 2], [1, 2], [1, 1]];
const TOP = 0, RIGHT = 1, BOTTOM = 2, LEFT = 3;

let errors;
test.beforeEach(async ({ page }) => { errors = trackErrors(page); });
test.afterEach(() => { expect(errors, 'no page errors').toEqual([]); });

test.describe('home and controls', () => {
  test('opens on the menu with the sketched square board', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('.world')).toHaveText([/Triangle/, /Carreau/, /Ruche/]);
    await expect(page.locator('.mode')).toHaveText([/Gates/, /Rush/, /Levels/, /Memory/, /Zen/]);
    await expect(page.locator('#board')).toHaveAttribute('data-world', 'square');
    expect(await boardState(page)).toEqual(SKETCH);
    await expect(page.locator('#board .piece')).toHaveCount(4);
  });

  test('square swipes reshape the pair on the side where they start', async ({ page }) => {
    await page.goto('/');
    await swipe(page, .5, .3, 80, 0);           // ⇄ in the top half: widths of the top pair
    let s = await boardState(page);
    expect(s[0]).toEqual([2, 2]);               // rectangle vertical → carreau grand
    expect(s[1]).toEqual([1, 2]);               // carreau grand → rectangle vertical
    expect(s[3]).toEqual(SKETCH[3]);
    await swipe(page, .7, .5, 0, -80);          // ⇅ in the right half: heights of the right pair
    s = await boardState(page);
    expect(s[1]).toEqual([1, 1]);
    expect(s[2]).toEqual([2, 2]);
    await swipe(page, .5, .7, 6, 4);            // too short to count
    expect(await boardState(page)).toEqual(s);
  });

  test('side arrows work like swipes', async ({ page }) => {
    await page.goto('/');
    await page.locator(`#board .edge[data-side="${BOTTOM}"]`).click();
    expect((await boardState(page))[3]).toEqual([2, 1]); // carreau → rectangle horizontal
    await page.locator(`#board .edge[data-side="${LEFT}"]`).click();
    expect((await boardState(page))[3]).toEqual([2, 2]);
  });

  test('arrow keys work the square sides', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('ArrowUp');
    expect(await boardState(page)).toEqual([[2, 2], [1, 2], [1, 2], [1, 1]]);
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
    await page.waitForTimeout(400);
    await solve(page);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__buzz.length)).toBe(after);
  });
});

test.describe('worlds', () => {
  for (const [id, sides] of [['tri', 3], ['hex', 6]]) {
    test(`${id}: has ${sides} corners, swipes along each side, and is remembered`, async ({ page }) => {
      await page.goto('/');
      await chooseWorld(page, id);
      await expect(page.locator('#board .piece')).toHaveCount(sides);
      await expect(page.locator('#board .edge')).toHaveCount(sides);
      // Swipe along every side, starting on its half, and check that side changed.
      for (let s = 0; s < sides; s++) {
        const before = await boardState(page);
        const geo = await page.evaluate(([w, side]) => {
          const v = window.CarreauCore.vertices(w), A = v[side], B = v[(side + 1) % v.length];
          return { A, B, R: Math.max(...v.map(p => Math.hypot(p[0], p[1]))) };
        }, [id, s]);
        const box = await page.locator('#board').boundingBox();
        const [vx, vy, vw, vh] = (await page.getAttribute('#board', 'viewBox')).split(' ').map(Number);
        const vb = { x: vx, y: vy, width: vw, height: vh };
        const toPx = ([x, y]) => [box.x + (x - vb.x) / vb.width * box.width, box.y + (y - vb.y) / vb.height * box.height];
        const mid = [(geo.A[0] + geo.B[0]) / 2 * .5, (geo.A[1] + geo.B[1]) / 2 * .5];
        const [sx, sy] = toPx(mid);
        const len = Math.hypot(geo.B[0] - geo.A[0], geo.B[1] - geo.A[1]);
        const dir = [(geo.B[0] - geo.A[0]) / len * 60, (geo.B[1] - geo.A[1]) / len * 60];
        await page.mouse.move(sx, sy); await page.mouse.down();
        await page.mouse.move(sx + dir[0], sy + dir[1]); await page.mouse.up();
        const after = await boardState(page);
        const expected = await page.evaluate(([st, side]) => window.CarreauCore.apply(st, side), [before, s]);
        expect(after, `swipe along side ${s}`).toEqual(expected);
      }
      await page.reload();
      await expect(page.locator('#board')).toHaveAttribute('data-world', id);
      await expect(page.locator(`.world[data-world=${id}]`)).toHaveAttribute('aria-pressed', 'true');
    });

    test(`${id}: levels have their own progress`, async ({ page }) => {
      await page.goto('/');
      await chooseWorld(page, id);
      await page.locator('[data-mode=levels]').click();
      await expect(page.locator('#lvlTitle')).toHaveText(id === 'tri' ? 'Triangle levels' : 'Ruche levels');
      await page.locator('.lvl').nth(0).click();
      await solve(page);
      await expect(page.locator('#resTitle')).toHaveText('Level 1 cleared');
      await page.locator('#resMain').click();
      await expect(page.locator('#v0')).toHaveText('2');
      await page.locator('#quit').click();
      await expect(page.locator('.lvl').nth(1)).toBeEnabled();
      await page.locator('[data-home]').click();
      await expect(page.locator(`.world[data-world=${id}] em`)).toHaveText('★ 3');
      await expect(page.locator('.world[data-world=square] em')).toHaveText('★ 0');
    });
  }

  test('hex Rush plays with up to 5-move targets', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await chooseWorld(page, 'hex');
    await page.locator('[data-mode=rush]').click();
    for (let i = 0; i < 10; i++) {
      const path = await solve(page);
      expect(path.length).toBeLessThanOrEqual(5);
      await page.clock.runFor(400);
    }
    await expect(page.locator('#v0')).toHaveText('10');
  });
});

test.describe('Gates', () => {
  test('clearing walls scores, builds a combo and swaps in the next wall', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-mode=gates]').click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#targets .mini')).toHaveCount(2);
    const next = await page.$eval('#targets .next svg', el => el.dataset.state);
    await page.clock.runFor(500);
    await solve(page);
    await expect(page.locator('#v1')).toHaveText('×1');
    const first = Number(await page.locator('#v0').textContent());
    expect(first).toBeGreaterThan(150); // early and clean
    await page.clock.runFor(600);
    expect(await page.$eval('#targets .cur svg', el => el.dataset.state)).toBe(next);
    await solve(page);
    await expect(page.locator('#v1')).toHaveText('×2');
    expect(Number(await page.locator('#v0').textContent())).toBeGreaterThan(first * 2);
  });

  test('pieces that fit their hole are marked', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-mode=gates]').click();
    const target = await currentTarget(page);
    const board = await boardState(page);
    const fits = target.map((p, i) => p[0] === board[i][0] && p[1] === board[i][1]);
    const marked = await page.$$eval('#board .piece', ps => ps.map(p => p.classList.contains('fit')));
    expect(marked).toEqual(fits);
  });

  test('a wall that hits the wrong shape costs a life; three crashes end the run', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-mode=gates]').click();
    for (const hearts of ['♥♥♡', '♥♡♡']) {
      await page.clock.runFor(6_000);
      await expect(page.locator('#v2')).toHaveText(hearts);
      await expect(page.locator('#v1')).toHaveText('×1');
      await page.clock.runFor(1_000);
    }
    await page.clock.runFor(7_000);
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#resTitle')).toHaveText("Crashed out.");
    await page.locator('#resAlt').click();
    await expect(page.locator('#bestGates')).toHaveText('New');
  });

  test('pausing freezes the wall', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-mode=gates]').click();
    await page.clock.runFor(1_000);
    await page.locator('#pause').click();
    await page.clock.runFor(20_000);
    await page.locator('#resume').click();
    await expect(page.locator('#v2')).toHaveText('♥♥♥');
    await page.clock.runFor(6_000);
    await expect(page.locator('#v2')).toHaveText('♥♥♡');
  });

  for (const id of ['tri', 'hex']) {
    test(`${id}: walls work in this world too`, async ({ page }) => {
      await page.clock.install();
      await page.goto('/');
      await chooseWorld(page, id);
      await page.locator('[data-mode=gates]').click();
      for (let i = 0; i < 5; i++) {
        await solve(page);
        await page.clock.runFor(600);
      }
      await expect(page.locator('#v1')).toHaveText('×5');
      await page.locator('#quit').click();
      await expect(page.locator('#home')).toBeVisible();
      await expect(page.locator('#board .wall')).toHaveAttribute('visibility', 'hidden');
    });
  }
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

  test('pauses: the clock stops and the board ignores swipes', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-mode=rush]').click();
    await page.clock.runFor(5_000);
    await page.locator('#pause').click();
    await expect(page.locator('#paused')).toBeVisible();
    const time = await page.locator('#v2').textContent();
    const board = await boardState(page);
    await page.clock.runFor(30_000);
    await page.keyboard.press('1');
    expect(await boardState(page)).toEqual(board);
    await page.locator('#resume').click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#v2')).toHaveText(time);
    await page.clock.runFor(2_000);
    expect(Number(await page.locator('#v2').textContent())).toBeLessThan(Number(time));
  });

  test('leaving the app pauses the game', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=rush]').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#paused')).toBeVisible();
  });

  test('Esc (Android back) pauses, then quits to the menu', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=rush]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#paused')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#home')).toBeVisible();
  });
});

test.describe('Zen', () => {
  test('has no clock and keeps the best run', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=zen]').click();
    await expect(page.locator('#bar')).toBeHidden();
    await expect(page.locator('#pause')).toBeHidden();
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

    // Round 1: input is locked while memorizing; then rebuild the shape.
    let target = await currentTarget(page);
    await page.keyboard.press('1');
    expect(await boardState(page)).toEqual(SKETCH);
    await page.clock.runFor(2_000);
    await expect(page.locator('#targets .cur')).toHaveClass(/veil/);
    await press(page, await pathTo(page, target));
    await expect(page.locator('#v0')).toHaveText('1');
    await page.clock.runFor(700);

    // Then miss until out of lives: exactly as many moves as needed, never the right set.
    for (let lives = 2; lives >= 0; lives--) {
      target = await currentTarget(page);
      const right = await pathTo(page, target);
      await page.clock.runFor(2_000);
      const wrong = [0, 1, 2, 3].find(e => !right.includes(e)) ?? right[0];
      await press(page, Array(right.length).fill(wrong));
      await expect(page.locator('#v1')).toHaveText('♥'.repeat(lives) + '♡'.repeat(3 - lives));
      await page.clock.runFor(1_500);
    }
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#resText')).toContainText('1 shapes rebuilt');
  });

  test('pausing while memorizing gives the full viewing time back', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-mode=memory]').click();
    await page.clock.runFor(1_000);
    await page.locator('#pause').click();
    await page.clock.runFor(10_000);
    await page.locator('#resume').click();
    await expect(page.locator('#targets .cur')).not.toHaveClass(/veil/);
    await page.clock.runFor(1_000);
    await expect(page.locator('#targets .cur')).toHaveClass(/veil/);
  });
});

test.describe('Levels', () => {
  test('clears levels in order, earns stars and unlocks the next', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=levels]').click();
    await expect(page.locator('#lvlTitle')).toHaveText('Carreau levels');
    await expect(page.locator('.lvl').nth(0)).toBeEnabled();
    await expect(page.locator('.lvl').nth(1)).toBeDisabled();
    await page.locator('.lvl').nth(0).click();

    for (let n = 1; n <= 9; n++) {
      await expect(page.locator('#v0')).toHaveText(String(n));
      const targets = await page.locator('#targets .mini').count();
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
    const wrong = [0, 1, 2, 3].find(e => !right.includes(e));
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
      const wrong = [0, 1, 2, 3].find(e => !right.includes(e));
      await press(page, [...Array(detours * 2).fill(wrong), ...right]);
      await expect(page.locator('#resTitle')).toHaveText('Level 1 cleared');
      const lit = await page.locator('#resStars').evaluate(el => el.firstChild.textContent);
      expect(lit).toBe('★'.repeat(earned));
    });
  }

  test('keeps square progress saved before worlds existed', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('carreau-progress')) {
        localStorage.setItem('carreau-levels', JSON.stringify({ 1: 3, 2: 2 }));
        localStorage.setItem('carreau-bests', JSON.stringify({ rush: 7, memory: 2, zen: 4 }));
      }
    });
    await page.goto('/');
    await expect(page.locator('#bestRush')).toHaveText('Best 7');
    await expect(page.locator('#bestLevels')).toHaveText('★ 5 / 90');
  });
});
