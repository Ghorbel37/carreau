const { expect } = require('@playwright/test');

// Boards expose their logical state (pieces as [a, b] lengths) on data-state.
const readState = (page, selector) => page.$eval(selector, el => JSON.parse(el.dataset.state));
const boardState = page => readState(page, '#board');
const currentTarget = page => readState(page, '#targets .cur svg');

async function pathTo(page, target) {
  const board = await boardState(page);
  return page.evaluate(([a, b]) => window.CarreauCore.edgesBetween(a, b), [board, target]);
}

// Number keys work side 1, 2, 3…
async function press(page, sides) {
  for (const s of sides) await page.keyboard.press(String(s + 1));
}

// Swipe the current target in the fewest moves.
async function solve(page) {
  const path = await pathTo(page, await currentTarget(page));
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

async function chooseWorld(page, id) {
  await page.locator(`.world[data-world=${id}]`).click();
  await expect(page.locator('#board')).toHaveAttribute('data-world', id);
}

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return errors;
}

// Start as a returning player: tutorial done, every world open, on the given world.
// Seeds only an empty profile, so reloads keep what the test did.
async function returning(page, worldId = 'square') {
  await page.addInitScript(w => {
    if (localStorage.getItem('carreau-settings')) return;
    localStorage.setItem('carreau-settings', JSON.stringify({ tutorialDone: true, world: w }));
    localStorage.setItem('carreau-save', JSON.stringify({ bests: {}, unlocked: ['tri', 'square', 'hex'] }));
  }, worldId);
}

// Leave a game the way a player does: the pause button, then Menu.
async function quitToMenu(page) {
  await page.locator('#pause').click();
  await page.locator('#pausedQuit').click();
}

// A brand-new player starts in the tutorial; skip it.
async function skipWelcome(page) {
  await page.locator('#tutSkip').click();
  await page.locator('#home').waitFor();
}

module.exports = { returning, quitToMenu, skipWelcome, readState, boardState, currentTarget, pathTo, press, solve, swipe, chooseWorld, trackErrors };
