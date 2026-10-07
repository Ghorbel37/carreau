const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../www/core.js');

const {
  gateWall, gateScore, gateScale,
  WORLDS, WORLD_ORDER, LEVEL_COUNT, initial, clone, same, apply, edgesBetween,
  randomEdges, seeded, levelDef, starsFor, vertices, piecePolygon, sideForSwipe,
} = core;

// Square world: vertices top-left, top-right, bottom-right, bottom-left; sides top, right, bottom, left.
// Piece [a, b]: a runs along the side before the corner, b along the side after it.
const TL = 0, TR = 1, BR = 2, BL = 3;
const TOP = 0, RIGHT = 1, BOTTOM = 2, LEFT = 3;
const size = (s, corner) => {
  const [a, b] = s[corner];
  // tl: a = left (height), b = top (width); tr: a = top (w), b = right (h); br: a = right (h), b = bottom (w); bl: a = bottom (w), b = left (h)
  return corner === TL || corner === BR ? { w: b, h: a } : { w: a, h: b };
};

test('the square world starts as the notebook sketch', () => {
  const s = initial('square');
  assert.deepEqual(size(s, TL), { w: 1, h: 2 }); // rectangle vertical
  assert.deepEqual(size(s, TR), { w: 2, h: 2 }); // carreau grand
  assert.deepEqual(size(s, BR), { w: 2, h: 1 }); // rectangle horizontal
  assert.deepEqual(size(s, BL), { w: 1, h: 1 }); // carreau
});

test('square: ⇄ on a carreau gives rectangle horizontal, ⇅ gives rectangle vertical', () => {
  assert.deepEqual(size(apply(initial('square'), BOTTOM), BL), { w: 2, h: 1 });
  assert.deepEqual(size(apply(initial('square'), LEFT), BL), { w: 1, h: 2 });
});

test('square: rectangle vertical + ⇄ = carreau grand, + ⇅ = carreau', () => {
  assert.deepEqual(size(apply(initial('square'), TOP), TL), { w: 2, h: 2 });
  assert.deepEqual(size(apply(initial('square'), LEFT), TL), { w: 1, h: 1 });
});

test('square: rectangle horizontal and carreau grand follow the same rules', () => {
  const s = apply(initial('square'), RIGHT);
  assert.deepEqual(size(s, BR), { w: 2, h: 2 });
  assert.deepEqual(size(s, TR), { w: 2, h: 1 });
  assert.deepEqual(size(apply(s, TOP), TR), { w: 1, h: 1 });
});

for (const id of WORLD_ORDER) {
  const n = WORLDS[id].sides;

  test(`${id}: each side changes exactly the two pieces on it`, () => {
    for (let side = 0; side < n; side++) {
      const before = initial(id), after = apply(clone(before), side);
      const changed = [];
      after.forEach((p, i) => p.forEach((v, j) => { if (v !== before[i][j]) changed.push([i, j]); }));
      const expected = [[side, 1], [(side + 1) % n, 0]].sort((x, y) => x[0] - y[0]);
      assert.deepEqual(changed, expected);
    }
  });

  test(`${id}: moves are their own inverse and commute`, () => {
    for (let a = 0; a < n; a++) {
      assert.ok(same(apply(apply(initial(id), a), a), initial(id)));
      for (let b = 0; b < n; b++) assert.ok(same(apply(apply(initial(id), a), b), apply(apply(initial(id), b), a)));
    }
  });

  test(`${id}: edgesBetween finds the shortest path`, () => {
    const rnd = seeded(7 + n);
    for (let i = 0; i < 200; i++) {
      const k = 1 + Math.floor(rnd() * n);
      const edges = randomEdges(k, n, rnd);
      assert.equal(new Set(edges).size, k);
      const target = initial(id);
      edges.forEach(e => apply(target, e));
      assert.deepEqual(edgesBetween(initial(id), target), [...edges].sort((x, y) => x - y));
    }
    const lone = initial(id);
    lone[0][1] = 3 - lone[0][1]; // only one piece on side 0 changed
    assert.equal(edgesBetween(initial(id), lone), null);
  });

  test(`${id}: move count always has the optimum's parity`, () => {
    const rnd = seeded(99 + n);
    for (let i = 0; i < 200; i++) {
      const s = initial(id), moves = Math.floor(rnd() * 12);
      for (let j = 0; j < moves; j++) apply(s, randomEdges(1, n, rnd)[0]);
      assert.equal(edgesBetween(initial(id), s).length % 2, moves % 2);
    }
  });

  test(`${id}: levels are stable, distinct per world and solvable`, () => {
    for (let lv = 1; lv <= LEVEL_COUNT; lv++) {
      const d = levelDef(id, lv);
      assert.deepEqual(levelDef(id, lv), d);
      assert.equal(d.start.length, n);
      assert.equal(d.targets.length, lv <= 8 ? 1 : lv <= 18 ? 2 : 3);
      let cur = d.start, total = 0;
      for (const t of d.targets) {
        const path = edgesBetween(cur, t);
        assert.ok(path && path.length >= 1, `${id} level ${lv} target reachable`);
        total += path.length; cur = t;
      }
      assert.equal(total, d.optimal);
      assert.equal((d.budget - d.optimal) % 2, 0, 'slack is usable');
      assert.equal(d.budget === d.optimal, lv >= 25);
    }
  });

  test(`${id}: pieces never overlap, even at full size`, () => {
    const verts = vertices(id);
    const big = verts.map(() => [2, 2]);
    // Sample points inside each piece and check no other piece contains them.
    const inside = (poly, [x, y]) => {
      let sign = 0;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
        const c = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
        if (Math.abs(c) < 1e-9) continue;
        if (sign && Math.sign(c) !== sign) return false;
        sign = Math.sign(c);
      }
      return true;
    };
    const polys = big.map(([a, b], i) => piecePolygon(verts, i, a, b));
    polys.forEach((poly, i) => {
      for (let s = .05; s < 1; s += .1) for (let t = .05; t < 1; t += .1) {
        const [P, Q, , S] = poly;
        const pt = [P[0] + s * (Q[0] - P[0]) + t * (S[0] - P[0]), P[1] + s * (Q[1] - P[1]) + t * (S[1] - P[1])];
        polys.forEach((other, j) => { if (j !== i) assert.ok(!inside(other, pt), `${id} piece ${i} overlaps ${j}`); });
      }
    });
  });

  test(`${id}: a swipe along each side, started on its half, picks that side`, () => {
    const verts = vertices(id);
    for (let side = 0; side < n; side++) {
      const A = verts[side], B = verts[(side + 1) % n];
      const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const start = [mid[0] * .6, mid[1] * .6];
      // Swipe either way along the side.
      assert.equal(sideForSwipe(id, B[0] - A[0], B[1] - A[1], ...start), side);
      assert.equal(sideForSwipe(id, A[0] - B[0], A[1] - B[1], ...start), side);
    }
  });
}

test('square swipes match the notebook: ⇄ in the top half is the top side, ⇅ on the right is the right side', () => {
  assert.equal(sideForSwipe('square', 80, 0, 0, -50), TOP);
  assert.equal(sideForSwipe('square', -80, 5, 10, 60), BOTTOM);
  assert.equal(sideForSwipe('square', 0, -80, 50, 0), RIGHT);
  assert.equal(sideForSwipe('square', 4, 80, -50, 10), LEFT);
});

test('levels differ between worlds', () => {
  assert.notDeepEqual(levelDef('tri', 12).start.length, levelDef('hex', 12).start.length);
  assert.notDeepEqual(JSON.stringify(levelDef('square', 12)), JSON.stringify(levelDef('square', 13)));
});

test('stars: 3 for fewest moves, 2 for one detour (two extra moves), else 1', () => {
  assert.equal(starsFor(3, 3), 3);
  assert.equal(starsFor(5, 3), 2);
  assert.equal(starsFor(7, 3), 1);
});

test('gates: walls start gentle, tighten, and never ask for more sides than the board has', () => {
  for (const id of WORLD_ORDER) {
    const n = WORLDS[id].sides;
    let lastFloor = Infinity;
    for (let w = 0; w < 80; w++) {
      for (const r of [0, .5, .999]) {
        const { k, travel } = gateWall(w, n, () => r);
        assert.ok(k >= 1 && k <= Math.min(n, 5), `${id} wall ${w} k=${k}`);
        assert.ok(travel >= 1.6 && travel <= 6, `${id} wall ${w} travel=${travel}`);
        if (w < 4) assert.equal(k, 1);
      }
      const floor = gateWall(w, n, () => 0).travel - (gateWall(w, n, () => 0).k - 1) * .35;
      assert.ok(floor <= lastFloor + 1e-9, 'walls never slow down');
      lastFloor = floor;
    }
  }
});

test('gates: score rewards early, clean clears and combos up to ×10', () => {
  assert.equal(gateScore(1, 0, false), 100);
  assert.equal(gateScore(1, .5, false), 150);
  assert.equal(gateScore(1, 1, true), 250);
  assert.equal(gateScore(3, .5, true), 600);
  assert.equal(gateScore(25, 0, false), 1000);
});

test('gates: a wall looks a quarter size far away and full size on arrival', () => {
  assert.equal(gateScale(0), .25);
  assert.equal(gateScale(1), 1);
  assert.ok(gateScale(.5) > .25 && gateScale(.5) < 1);
  assert.ok(gateScale(.9) - gateScale(.8) > gateScale(.2) - gateScale(.1), 'it speeds up as it gets close');
});
