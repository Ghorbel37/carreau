const { expect } = require('@playwright/test');

const KEY = { top: 'ArrowUp', bottom: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

// Read a board's shape from the rendered pieces (2 units = 40% of the board).
async function readBoard(page, selector) {
  return page.$eval(selector, el => {
    const s = {};
    for (const c of ['tl', 'tr', 'bl', 'br']) {
      const p = el.querySelector('.piece.' + c);
      s[c] = { w: p.style.width.includes('40%') ? 2 : 1, h: p.style.height.includes('40%') ? 2 : 1 };
    }
    return s;
  });
}

const currentTarget = page => readBoard(page, '#targets .cur');

async function pathTo(page, target) {
  const board = await readBoard(page, '#board');
  return page.evaluate(([a, b]) => window.CarreauCore.edgesBetween(a, b), [board, target]);
}

async function press(page, edges) {
  for (const e of edges) await page.keyboard.press(KEY[e]);
}

// Swipe the current target in the fewest moves.
async function solve(page) {
  const target = await currentTarget(page);
  const path = await pathTo(page, target);
  expect(path, 'target is reachable').not.toBeNull();
  await press(page, path);
  return path;
}

// Drag across the board from a point given as fractions of its size.
async function swipe(page, fx, fy, dx, dy) {
  const box = await page.locator('#board').boundingBox();
  const x = box.x + box.width * fx, y = box.y + box.height * fy;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
}

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

module.exports = { KEY, readBoard, currentTarget, pathTo, press, solve, swipe, trackErrors };
