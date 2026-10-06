const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../www/core.js');

const { CORNERS, EDGES, LEVEL_COUNT, initial, clone, same, apply, edgesBetween, randomEdges, seeded, levelDef, starsFor } = core;

test('starting board matches the notebook sketch', () => {
  assert.deepEqual(initial(), { tl: { w: 1, h: 2 }, tr: { w: 2, h: 2 }, bl: { w: 1, h: 1 }, br: { w: 2, h: 1 } });
});

test('horizontal swipe on carreau gives rectangle horizontal, vertical gives rectangle vertical', () => {
  const s = initial(); // bl is a carreau (1×1)
  apply(s, 'bottom');
  assert.deepEqual(s.bl, { w: 2, h: 1 });
  const t = initial();
  apply(t, 'left');
  assert.deepEqual(t.bl, { w: 1, h: 2 });
});

test('rectangle vertical: ⇄ makes a carreau grand, ⇅ makes a carreau', () => {
  const s = initial(); // tl is a rectangle vertical (1×2)
  apply(s, 'top');
  assert.deepEqual(s.tl, { w: 2, h: 2 });
  const t = initial();
  apply(t, 'left');
  assert.deepEqual(t.tl, { w: 1, h: 1 });
});

test('rectangle horizontal and carreau grand follow the same rules', () => {
  const s = initial(); // br is 2×1, tr is 2×2
  apply(s, 'right');
  assert.deepEqual(s.br, { w: 2, h: 2 });
  assert.deepEqual(s.tr, { w: 2, h: 1 });
  apply(s, 'top');
  assert.deepEqual(s.tr, { w: 1, h: 1 });
});

test('each edge only changes its own pair', () => {
  for (const [edge, [a, b, k]] of Object.entries(EDGES)) {
    const before = initial();
    const after = apply(clone(before), edge);
    for (const c of CORNERS) {
      for (const dim of ['w', 'h']) {
        const shouldChange = (c === a || c === b) && dim === k;
        assert.equal(after[c][dim] !== before[c][dim], shouldChange, `${edge} ${c}.${dim}`);
      }
    }
  }
});

test('every move is its own inverse and moves commute', () => {
  const edges = Object.keys(EDGES);
  for (const e of edges) assert.ok(same(apply(apply(initial(), e), e), initial()));
  for (const a of edges) for (const b of edges) {
    assert.ok(same(apply(apply(initial(), a), b), apply(apply(initial(), b), a)));
  }
});

test('sizes always stay 1 or 2', () => {
  const s = initial();
  const rnd = seeded(42);
  for (let i = 0; i < 500; i++) {
    apply(s, randomEdges(1, rnd)[0]);
    for (const c of CORNERS) for (const d of ['w', 'h']) assert.ok(s[c][d] === 1 || s[c][d] === 2);
  }
});

test('edgesBetween finds the shortest path, and k random edges are exactly k moves away', () => {
  const rnd = seeded(7);
  for (let i = 0; i < 200; i++) {
    const k = 1 + Math.floor(rnd() * 4);
    const edges = randomEdges(k, rnd);
    assert.equal(new Set(edges).size, k);
    const target = clone(initial());
    edges.forEach(e => apply(target, e));
    const path = edgesBetween(initial(), target);
    assert.deepEqual([...path].sort(), [...edges].sort());
  }
});

test('edgesBetween rejects shapes no swipe can reach', () => {
  const t = initial();
  t.tl.w = 2; // only one of the top pair changed
  assert.equal(edgesBetween(initial(), t), null);
});

test('levels are deterministic and solvable within their move limit', () => {
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const d = levelDef(n);
    assert.deepEqual(levelDef(n), d, `level ${n} is stable`);
    assert.equal(d.targets.length, n <= 8 ? 1 : n <= 18 ? 2 : 3);
    let cur = d.start, total = 0;
    for (const t of d.targets) {
      const path = edgesBetween(cur, t);
      assert.ok(path && path.length >= 1, `level ${n} target reachable and different`);
      total += path.length;
      cur = t;
    }
    assert.equal(total, d.optimal, `level ${n} optimal`);
    assert.ok(d.budget >= d.optimal, `level ${n} budget allows the optimum`);
    assert.equal((d.budget - d.optimal) % 2, 0, `level ${n} slack is usable (even)`);
    assert.equal(d.budget === d.optimal, n >= 25, `level ${n} perfect-only flag`);
  }
});

test('move count always has the same parity as the optimum', () => {
  const rnd = seeded(99);
  for (let i = 0; i < 300; i++) {
    const s = initial();
    const n = Math.floor(rnd() * 12);
    for (let j = 0; j < n; j++) apply(s, randomEdges(1, rnd)[0]);
    assert.equal(edgesBetween(initial(), s).length % 2, n % 2);
  }
});

test('stars: 3 for fewest moves, 2 for one detour (two extra moves), else 1', () => {
  assert.equal(starsFor(3, 3), 3);
  assert.equal(starsFor(5, 3), 2);
  assert.equal(starsFor(7, 3), 1);
});
