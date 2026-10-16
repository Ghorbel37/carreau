const { test, expect } = require('@playwright/test');
const { returning, quitToMenu, skipWelcome, boardState, currentTarget, pathTo, press, solve, swipe, chooseWorld, trackErrors } = require('./helpers');

// Square world pieces [a, b]: top-left, top-right, bottom-right, bottom-left (see core.js).
const SKETCH = [[2, 1], [2, 2], [1, 2], [1, 1]];
const BOTTOM = 2, LEFT = 3;
const notNeeded = (path, n = 4) => [...Array(n).keys()].find(e => !path.includes(e));

let errors;
test.beforeEach(async ({ page }) => { errors = trackErrors(page); });
test.afterEach(() => { expect(errors, 'no page errors').toEqual([]); });

test.describe('home and controls', () => {
  test.beforeEach(({ page }) => returning(page));

  test('opens on the menu with the sketched square board', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('.world')).toHaveText([/Triangle/, /Carreau/, /Ruche/]);
    await expect(page.locator('.mode')).toHaveText([/Gates/, /Daily/, /Precision/, /Rush/, /Zen/]);
    await expect(page.locator('#board')).toHaveAttribute('data-world', 'square');
    expect(await boardState(page)).toEqual(SKETCH);
  });

  test('square swipes reshape the pair on the side where they start', async ({ page }) => {
    await page.goto('/');
    await swipe(page, .5, .3, 80, 0);           // ⇄ in the top half: widths of the top pair
    let s = await boardState(page);
    expect(s[0]).toEqual([2, 2]);
    expect(s[1]).toEqual([1, 2]);
    expect(s[3]).toEqual(SKETCH[3]);
    await swipe(page, .7, .5, 0, -80);          // ⇅ in the right half: heights of the right pair
    s = await boardState(page);
    expect(s[1]).toEqual([1, 1]);
    expect(s[2]).toEqual([2, 2]);
    await swipe(page, .5, .7, 6, 4);            // too short to count
    expect(await boardState(page)).toEqual(s);
  });

  test('side arrows and arrow keys work like swipes', async ({ page }) => {
    await page.goto('/');
    await page.locator(`#board .edge[data-side="${BOTTOM}"]`).click();
    expect((await boardState(page))[3]).toEqual([2, 1]); // carreau → rectangle horizontal
    await page.locator(`#board .edge[data-side="${LEFT}"]`).click();
    expect((await boardState(page))[3]).toEqual([2, 2]);
    await page.keyboard.press('ArrowLeft');
    expect((await boardState(page))[3]).toEqual([2, 1]);
  });

  test('sound, music and vibration toggles are remembered', async ({ page }) => {
    await page.goto('/');
    for (const id of ['#soundBtn', '#musicBtn', '#vibeBtn']) await page.locator(id).click();
    await page.reload();
    for (const id of ['#soundBtn', '#musicBtn', '#vibeBtn']) await expect(page.locator(id)).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#musicBtn').click();
    await expect(page.locator('#musicBtn')).toHaveAttribute('aria-pressed', 'true');
  });

  test('vibrates lightly on each swipe and more on a match, only while vibration is on', async ({ page }) => {
    await page.addInitScript(() => {
      window.__buzz = [];
      Object.defineProperty(navigator, 'vibrate', { value: p => { window.__buzz.push(p); return true; }, configurable: true });
    });
    await page.goto('/');
    await page.locator('[data-mode=zen]').click();
    const path = await solve(page);
    await expect.poll(() => page.evaluate(() => window.__buzz.length)).toBe(path.length + 1);
    expect(await page.evaluate(() => window.__buzz.filter(p => p === 6).length)).toBe(path.length);
    await page.locator('#vibeBtn').click();
    const after = await page.evaluate(() => window.__buzz.length);
    await page.waitForTimeout(400);
    await solve(page);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__buzz.length)).toBe(after);
  });
});

test.describe('new players', () => {
  test('see a welcome card first; Skip goes to the menu and it does not come back', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#welcome')).toBeVisible();
    await expect(page.locator('#home')).toBeHidden();
    await skipWelcome(page);
    await page.reload();
    await expect(page.locator('#welcome')).toBeHidden();
    await expect(page.locator('#home')).toBeVisible();
    await page.locator('[data-mode=gates]').click();
    await expect(page.locator('#hud')).toBeVisible(); // skipping also skips the tutorial
  });

  test('start on Triangle with the other worlds locked', async ({ page }) => {
    await page.goto('/');
    await skipWelcome(page);
    await expect(page.locator('#board')).toHaveAttribute('data-world', 'tri');
    await expect(page.locator('.world[data-world=square]')).toHaveClass(/locked/);
    await expect(page.locator('.world[data-world=square] em')).toHaveText('25,000 in Triangle');
    await expect(page.locator('.world[data-world=hex] em')).toHaveText('60,000 in Carreau');
    await page.locator('.world[data-world=square]').click();
    await expect(page.locator('#hint')).toHaveText(/score 25,000 in Triangle Gates to unlock Carreau/);
    await expect(page.locator('#board')).toHaveAttribute('data-world', 'tri');
  });

  test('get the guided tutorial from the welcome card', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('#welcomeStart').click();
    await expect(page.locator('#tut')).toBeVisible();
    for (let step = 1; step <= 3; step++) {
      await expect(page.locator('#tutStep')).toHaveText(`Step ${step} of 3`);
      await page.clock.runFor(20_000); // tutorial walls wait for you
      const path = await pathTo(page, await currentTarget(page));
      await expect(page.locator('#board .guide')).toHaveAttribute('visibility', 'visible');
      await expect(page.locator(`#board .edge[data-side="${path[0]}"]`)).toHaveClass(/hint/);
      await press(page, path);
      await page.clock.runFor(500);
    }
    await expect(page.locator('#resTitle')).toHaveText('You’re ready.');
    await page.locator('#resMain').click();
    await expect(page.locator('#hud')).toBeVisible();
    await quitToMenu(page);
    await page.reload();
    await page.locator('[data-mode=gates]').click();
    await expect(page.locator('#hud')).toBeVisible(); // straight to the game now
  });

  test('unlock Carreau with 25,000 points in Triangle', async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(() => localStorage.setItem('carreau-settings', localStorage.getItem('carreau-settings') || JSON.stringify({ tutorialDone: true })));
    await page.goto('/?kinds=&drops=');
    await page.locator('[data-mode=gates]').click();
    while (Number((await page.locator('#v0').textContent()).replace(/,/g, '')) < 25000) {
      await solve(page);
      await page.clock.runFor(500);
    }
    for (let i = 0; i < 3; i++) await page.clock.runFor(8_000);
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#resExtra')).toContainText('Carreau unlocked');
    await page.locator('#resAlt').click();
    await expect(page.locator('.world[data-world=square]')).not.toHaveClass(/locked/);
    await expect(page.locator('.world[data-world=hex]')).toHaveClass(/locked/);
    await chooseWorld(page, 'square');
  });

  test('keep square scores saved by earlier versions, with Carreau open', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('carreau-save')) {
        localStorage.setItem('carreau-levels', JSON.stringify({ 1: 3 }));
        localStorage.setItem('carreau-bests', JSON.stringify({ rush: 7, memory: 2, zen: 4 }));
      }
    });
    await page.goto('/');
    await chooseWorld(page, 'square');
    await expect(page.locator('#bestRush')).toHaveText('Best 7');
    await expect(page.locator('#bestZen')).toHaveText('Best run 4');
  });
});

test.describe('worlds', () => {
  test.beforeEach(({ page }) => returning(page));

  for (const [id, sides] of [['tri', 3], ['hex', 6]]) {
    test(`${id}: has ${sides} corners, swipes along each side, and is remembered`, async ({ page }) => {
      await page.goto('/');
      await chooseWorld(page, id);
      await expect(page.locator('#board .piece')).toHaveCount(sides);
      await expect(page.locator('#board .edge')).toHaveCount(sides);
      for (let s = 0; s < sides; s++) {
        const before = await boardState(page);
        const geo = await page.evaluate(([w, side]) => {
          const v = window.CarreauCore.vertices(w);
          return { A: v[side], B: v[(side + 1) % v.length] };
        }, [id, s]);
        const box = await page.locator('#board').boundingBox();
        const [vx, vy, vw, vh] = (await page.getAttribute('#board', 'viewBox')).split(' ').map(Number);
        const toPx = ([x, y]) => [box.x + (x - vx) / vw * box.width, box.y + (y - vy) / vh * box.height];
        const [sx, sy] = toPx([(geo.A[0] + geo.B[0]) / 4, (geo.A[1] + geo.B[1]) / 4]);
        const len = Math.hypot(geo.B[0] - geo.A[0], geo.B[1] - geo.A[1]);
        await page.mouse.move(sx, sy); await page.mouse.down();
        await page.mouse.move(sx + (geo.B[0] - geo.A[0]) / len * 60, sy + (geo.B[1] - geo.A[1]) / len * 60); await page.mouse.up();
        const expected = await page.evaluate(([st, side]) => window.CarreauCore.apply(st, side), [before, s]);
        expect(await boardState(page), `swipe along side ${s}`).toEqual(expected);
      }
      await page.reload();
      await expect(page.locator('#board')).toHaveAttribute('data-world', id);
    });

    test(`${id}: Gates works here too`, async ({ page }) => {
      await page.clock.install();
      await page.goto('/?kinds=&drops=');
      await chooseWorld(page, id);
      await page.locator('[data-mode=gates]').click();
      for (let i = 0; i < 5; i++) { await solve(page); await page.clock.runFor(600); }
      await expect(page.locator('#v1')).toHaveText('×5');
      await quitToMenu(page);
      await expect(page.locator('#board .wall')).toHaveAttribute('visibility', 'hidden');
    });
  }
});

test.describe('Gates', () => {
  test.beforeEach(({ page }) => returning(page));
  const start = async (page, query = '?kinds=&drops=') => {
    await page.clock.install();
    await page.goto('/' + query);
    await page.locator('[data-mode=gates]').click();
    await expect(page.locator('#hud')).toBeVisible();
  };
  const score = async page => Number((await page.locator('#v0').textContent()).replace(/,/g, ''));

  test('clearing walls scores, builds a combo, pops points and swaps in the next wall', async ({ page }) => {
    await start(page);
    const next = await page.$eval('#targets .next svg', el => el.dataset.state);
    await page.clock.runFor(500);
    await solve(page);
    await expect(page.locator('#v1')).toHaveText('×1');
    await expect(page.locator('.float')).toHaveText(/^\+\d/);
    const first = await score(page);
    expect(first).toBeGreaterThan(150);
    await page.clock.runFor(600);
    expect(await page.$eval('#targets .cur svg', el => el.dataset.state)).toBe(next);
    await solve(page);
    await expect(page.locator('#v1')).toHaveText('×2');
    expect(await score(page)).toBeGreaterThan(first * 2);
  });

  test('shows the fewest swipes; a wasted swipe costs a combo step and a quarter of the points', async ({ page }) => {
    await start(page);
    await solve(page); await page.clock.runFor(600);
    await solve(page); await page.clock.runFor(600);
    await expect(page.locator('#v1')).toHaveText('×2');
    const path = await pathTo(page, await currentTarget(page));
    await expect(page.locator('#line')).toHaveText(`Wall 3 · min ${path.length}`);
    const before = await score(page);
    const wrong = notNeeded(path);
    await press(page, [wrong]);
    await expect(page.locator('#hint')).toHaveText(`extra swipe · fewest was ${path.length}`);
    await press(page, [wrong, ...path]);         // undo the detour, then fit
    await expect(page.locator('#v1')).toHaveText('×2'); // +1 for the wall, −1 for the wasted swipe
    await expect(page.locator('#hint')).toContainText('1 wasted swipe · −25%');
    const gained = (await score(page)) - before;
    expect(gained).toBeLessThanOrEqual(Math.round(200 * .75) * 2);
  });

  test('pieces that fit their hole are marked', async ({ page }) => {
    await start(page);
    const target = await currentTarget(page), board = await boardState(page);
    const marked = await page.$$eval('#board .piece', ps => ps.map(p => p.classList.contains('fit')));
    expect(marked).toEqual(target.map((p, i) => p[0] === board[i][0] && p[1] === board[i][1]));
  });

  test('a wall that hits the wrong shape costs a life; three crashes end the run', async ({ page }) => {
    await start(page);
    for (const h of ['♥♥♡', '♥♡♡']) {
      await page.clock.runFor(6_000);
      await expect(page.locator('#v2')).toHaveText(h);
      await page.clock.runFor(1_000);
    }
    await page.clock.runFor(7_000);
    await expect(page.locator('#resTitle')).toHaveText('Crashed out.');
    await page.locator('#resAlt').click();
    await expect(page.locator('#bestGates')).toHaveText('New');
  });

  test('pausing freezes the wall', async ({ page }) => {
    await start(page);
    await page.clock.runFor(1_000);
    await page.locator('#pause').click();
    await page.clock.runFor(20_000);
    await page.locator('#resume').click();
    await expect(page.locator('#v2')).toHaveText('♥♥♥');
    await page.clock.runFor(6_000);
    await expect(page.locator('#v2')).toHaveText('♥♥♡');
  });

  test('gold walls are worth triple', async ({ page }) => {
    await start(page, '?kinds=gold&drops=');
    await expect(page.locator('#board .wall')).toHaveClass(/gold/);
    await solve(page);
    expect(await score(page)).toBeGreaterThan(3 * 200);
  });

  test('locked walls chain a side the board does not need', async ({ page }) => {
    await start(page, '?kinds=locked&drops=');
    const lock = Number(await page.locator('#board .edge.locked').getAttribute('data-side'));
    const path = await pathTo(page, await currentTarget(page));
    expect(path).not.toContain(lock);
    const before = await boardState(page);
    await press(page, [lock]);
    expect(await boardState(page)).toEqual(before);
    await expect(page.locator('#hint')).toHaveText('that side is locked');
    await press(page, path);
    await expect(page.locator('#v1')).toHaveText('×1');
  });

  test('blink walls close their holes partway; clearing one earns an achievement', async ({ page }) => {
    await start(page, '?kinds=blink&drops=');
    const target = await currentTarget(page);
    await page.clock.runFor(2_400);
    await expect(page.locator('#targets .cur')).toHaveClass(/veil/);
    await expect(page.locator('#board .wall .holes')).toHaveAttribute('visibility', 'hidden');
    await press(page, await pathTo(page, target));
    await expect(page.locator('#toast')).toContainText('Photographic');
  });

  test('a double wall sends the next one in close behind', async ({ page }) => {
    await start(page, '?kinds=double,&drops=');
    await solve(page);
    await page.clock.runFor(500);
    const scale = await page.$eval('#barfill', el => Number(el.style.transform.match(/scaleX\(([\d.]+)\)/)[1]));
    expect(scale).toBeLessThan(.62);
  });

  test('a shield takes a crash and keeps the combo', async ({ page }) => {
    await start(page, '?kinds=&drops=shield');
    await solve(page);
    await expect(page.locator('#item-shield b')).toHaveText('1');
    await page.clock.runFor(8_000);
    await expect(page.locator('#v2')).toHaveText('♥♥♥');
    await expect(page.locator('#item-shield b')).toHaveText('0');
    await expect(page.locator('#v1')).toHaveText('×1');
  });

  test('slow motion holds the wall back; skip removes it', async ({ page }) => {
    await start(page, '?kinds=&drops=slow,skip');
    await solve(page); await page.clock.runFor(600);
    await solve(page); await page.clock.runFor(600);
    await expect(page.locator('#item-slow b')).toHaveText('1');
    await expect(page.locator('#item-skip b')).toHaveText('1');
    await page.locator('#item-slow').click();
    await expect(page.locator('#stage')).toHaveClass(/slow/);
    await page.clock.runFor(4_500); // a normal wall would have hit by now
    await expect(page.locator('#v2')).toHaveText('♥♥♥');
    await page.locator('#item-skip').click();
    await page.clock.runFor(800);
    await expect(page.locator('#item-skip b')).toHaveText('0');
    await expect(page.locator('#v2')).toHaveText('♥♥♥');
    await expect(page.locator('#v1')).toHaveText('×2');
    await expect(page.locator('#line')).toHaveText(/^Wall 4/);
  });

  test('achievements pop up as you play and show in Stats', async ({ page }) => {
    await start(page);
    await solve(page);
    await expect(page.locator('#toast')).toContainText('Through the gap');
    await quitToMenu(page);
    await page.locator('#statsBtn').click();
    await expect(page.locator('#stats')).toBeVisible();
    // This profile has every world open, so the two unlock achievements are earned too.
    await expect(page.locator('#achCount')).toHaveText(/^3 \/ \d+$/);
    await expect(page.locator('#achList li.done')).toHaveText([/Through the gap/, /Back to the square/, /Into the hive/]);
    await expect(page.locator('#statGrid')).toContainText('Walls cleared');
    await expect(page.locator('#version')).toHaveText('Carreau (development build)');
    await page.keyboard.press('Escape');
    await expect(page.locator('#home')).toBeVisible();
  });
});

test.describe('Precision', () => {
  test.beforeEach(({ page }) => returning(page));

  test('a wasted swipe costs a life at once; clean walls score ×1.5', async ({ page }) => {
    await page.clock.install();
    await page.goto('/?kinds=&drops=');
    await page.locator('[data-mode=precision]').click();
    await expect(page.locator('#hint')).toHaveText(/a wasted swipe costs a life/);
    await solve(page);
    await expect(page.locator('#hint')).toContainText('clean ×1.5');
    const first = Number((await page.locator('#v0').textContent()).replace(/,/g, ''));
    expect(first).toBeGreaterThan(300); // (100 + early + 50) × 1.5
    await page.clock.runFor(600);
    const path = await pathTo(page, await currentTarget(page));
    const wrong = notNeeded(path);
    for (const [i, h] of [['♥♥♡'], ['♥♡♡']].entries()) {
      await press(page, [wrong]);
      await expect(page.locator('#v2')).toHaveText(h[0]);
      await expect(page.locator('#v1')).toHaveText('×1');
      if (i === 0) await press(page, [wrong]); // undo; moving back closer is not wasted
      await expect(page.locator('#v2')).toHaveText(h[0]);
    }
    await press(page, [wrong, wrong]);          // undo (not wasted), then waste the last life
    await page.clock.runFor(1_000);
    await expect(page.locator('#resTitle')).toHaveText(/New best!|Crashed out\./);
    await page.locator('#resAlt').click();
    await expect(page.locator('#bestPrecision')).toHaveText(/^Best /);
  });

  test('walls come slower than in Gates', async ({ page }) => {
    await page.clock.install();
    await page.goto('/?kinds=&drops=');
    await page.locator('[data-mode=precision]').click();
    await page.clock.runFor(5_000); // a Gates wall (4.5 s) would have hit by now
    await expect(page.locator('#v2')).toHaveText('♥♥♥');
    await page.clock.runFor(1_000);
    await expect(page.locator('#v2')).toHaveText('♥♥♡');
  });
});

test.describe('Daily', () => {
  test.beforeEach(({ page }) => returning(page));

  test('is the same for everyone on a day, counts once, and keeps a streak', async ({ page, browser }) => {
    const day = new Date('2026-10-13T10:00:00');
    await page.clock.install({ time: day });
    await page.goto('/?kinds=&drops=');
    const info = await page.evaluate(() => window.CarreauCore.dailyInfo());
    await expect(page.locator('#dailyWorld')).toHaveText(`Today: ${info.world === 'tri' ? 'Triangle' : info.world === 'square' ? 'Carreau' : 'Ruche'}.`);
    await page.locator('[data-mode=daily]').click();
    await expect(page.locator('#board')).toHaveAttribute('data-world', info.world);
    const first = await currentTarget(page);

    // Another player on the same day sees the same first wall.
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.clock.install({ time: day });
    await p2.goto(page.url());
    await p2.locator('[data-mode=daily]').click();
    expect(await currentTarget(p2)).toEqual(first);
    await other.close();

    await solve(page);
    for (let i = 0; i < 3; i++) await page.clock.runFor(8_000);
    await expect(page.locator('#resTitle')).toHaveText('Daily done.');
    await expect(page.locator('#resText')).toContainText('Streak: 1 day');
    await page.locator('#resAlt').click();
    await expect(page.locator('#bestDaily')).toHaveText(/^Done: [\d,]+ · streak 1$/);
    await page.locator('[data-mode=daily]').click();
    await expect(page.locator('#hint')).toHaveText(/practice/);
  });
});

test.describe('Rush', () => {
  test.beforeEach(({ page }) => returning(page));

  test('scores matches, adds time and ends when the clock runs out', async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.locator('[data-mode=rush]').click();
    for (let i = 0; i < 3; i++) { await solve(page); await page.clock.runFor(400); }
    await expect(page.locator('#v0')).toHaveText('3');
    await expect(page.locator('#v1')).toHaveText('3');
    await page.clock.runFor(65_000);
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
    const time = await page.locator('#v2').textContent();
    const board = await boardState(page);
    await page.clock.runFor(30_000);
    await page.keyboard.press('1');
    expect(await boardState(page)).toEqual(board);
    await page.locator('#resume').click();
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

  test('Esc (Android back) pauses, resumes from the pause menu, and Menu quits', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=rush]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#paused')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#hud')).toBeVisible();
    await quitToMenu(page);
    await expect(page.locator('#home')).toBeVisible();
  });
});

test.describe('Game screen', () => {
  test.beforeEach(({ page }) => returning(page));

  test('the menu bar steps aside while playing and comes back on the menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();
    await page.locator('[data-mode=gates]').click();
    await expect(page.locator('header')).toBeHidden();
    await expect(page.locator('#pause')).toBeVisible();
    await quitToMenu(page);
    await expect(page.locator('header')).toBeVisible();
  });

  test('the pause menu hides the board completely, in every mode', async ({ page }) => {
    for (const mode of ['gates', 'rush', 'zen']) {
      await page.goto('/');
      await page.locator(`[data-mode=${mode}]`).click();
      await page.locator('#pause').click();
      await expect(page.locator('#paused')).toBeVisible();
      const covered = await page.evaluate(() => {
        const r = document.getElementById('board').getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const bg = getComputedStyle(document.getElementById('paused')).backgroundColor;
        return { inOverlay: !!el.closest('#paused'), opaque: !/rgba\(.*,\s*0?\.\d+\)|transparent/.test(bg) };
      });
      expect(covered, mode).toEqual({ inOverlay: true, opaque: true });
    }
  });

  test('pause menu toggles and Restart', async ({ page }) => {
    await page.clock.install();
    await page.goto('/?kinds=&drops=');
    await page.locator('[data-mode=gates]').click();
    await solve(page);
    await page.clock.runFor(600);
    await expect(page.locator('#v1')).toHaveText('×1');
    await page.locator('#pause').click();
    await page.locator('#paused [data-toggle=music]').click();
    await expect(page.locator('#musicBtn')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#restart').click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#v0')).toHaveText('0');
    await expect(page.locator('#line')).toHaveText(/^Wall 1 /);
  });
});

test.describe('Web and store builds', () => {
  test('web: shows the Google Play promo (coming soon) and no rate button', async ({ page }) => {
    await page.goto('/');
    await skipWelcome(page);
    await expect(page.locator('#playPromo')).toBeVisible();
    await expect(page.locator('#playPromo')).toContainText('Coming soon to Google Play');
    await page.locator('#statsBtn').click();
    await expect(page.locator('#rateBtn')).toBeHidden();
  });

  test('app: no promos; Stats offers rating the app and the privacy policy', async ({ page }) => {
    await page.addInitScript(() => { window.CARREAU_PLATFORM = 'app'; });
    await page.goto('/');
    await skipWelcome(page);
    await expect(page.locator('#playPromo')).toBeHidden();
    await page.locator('#statsBtn').click();
    await expect(page.locator('#rateBtn')).toBeVisible();
    await expect(page.locator('#stats a[href="privacy.html"]')).toBeVisible();
  });

  test('the privacy policy page is there', async ({ page }) => {
    await page.goto('/privacy.html');
    await expect(page.locator('h1')).toHaveText('Privacy policy');
    await expect(page.locator('body')).toContainText('collects no personal data');
  });
});

test.describe('Zen', () => {
  test.beforeEach(({ page }) => returning(page));

  test('has no clock and keeps the best run', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-mode=zen]').click();
    await expect(page.locator('#bar')).toBeHidden();
    await expect(page.locator('#items')).toBeHidden();
    for (let i = 0; i < 2; i++) {
      await solve(page);
      await expect(page.locator('#v0')).toHaveText(String(i + 1));
      await page.waitForTimeout(400);
    }
    await quitToMenu(page);
    await expect(page.locator('#bestZen')).toHaveText('Best run 2');
  });
});
