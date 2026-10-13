// Carreau game rules, shared by the page and the unit tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CarreauCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // A world is a regular polygon with one piece in each corner.
  // Piece i sits on vertex i and is a parallelogram with two lengths, each 1 or 2 units:
  //   a = along the side back to vertex i-1, b = along the side on to vertex i+1.
  // Side s joins vertex s and vertex s+1. Swiping along side s toggles the length of
  // both pieces that lie on it: piece s's b and piece s+1's a.
  // In the square world that is exactly the notebook rule: a horizontal swipe changes
  // width (carreau ↔ rectangle horizontal, rectangle vertical ↔ carreau grand), a
  // vertical swipe changes height.
  const WORLDS = {
    tri: {
      id: 'tri', name: 'Triangle', sides: 3,
      rotation: -90,     // first vertex at the top
      units: 6.4,        // side length in piece units; > 6 keeps the three corners apart
      start: [[1, 1], [2, 1], [1, 2]],
      blurb: '3 corners, 3 swipe directions.',
    },
    square: {
      id: 'square', name: 'Carreau', sides: 4,
      rotation: -135,    // vertices: top-left, top-right, bottom-right, bottom-left
      units: 5,
      // The notebook sketch: rectangle vertical, carreau grand, rectangle horizontal, carreau.
      start: [[2, 1], [2, 2], [1, 2], [1, 1]],
      blurb: 'The original. 4 corners, 4 sides.',
    },
    hex: {
      id: 'hex', name: 'Ruche', sides: 6,
      rotation: 180,     // flat top and bottom sides
      units: 4.4,        // > 4 keeps neighbouring corners apart
      start: [[1, 2], [2, 1], [1, 1], [2, 2], [1, 2], [1, 1]],
      blurb: '6 corners, 6 sides. The hardest.',
    },
  };
  const WORLD_ORDER = ['tri', 'square', 'hex'];
  
  const world = id => WORLDS[id] || WORLDS.square;
  const initial = id => world(id).start.map(p => p.slice());
  const clone = s => s.map(p => p.slice());
  const same = (x, y) => x.length === y.length && x.every((p, i) => p[0] === y[i][0] && p[1] === y[i][1]);

  function apply(s, side) {
    const n = s.length, next = (side + 1) % n;
    s[side][1] = 3 - s[side][1];
    s[next][0] = 3 - s[next][0];
    return s;
  }
  // The sides to swipe to get from x to y, or null when y can't be reached
  // (a swipe always changes both pieces on a side together).
  function edgesBetween(x, y) {
    const n = x.length, out = [];
    for (let side = 0; side < n; side++) {
      const next = (side + 1) % n;
      const d1 = x[side][1] !== y[side][1], d2 = x[next][0] !== y[next][0];
      if (d1 !== d2) return null;
      if (d1) out.push(side);
    }
    return out;
  }
  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const randomEdges = (k, n, rnd = Math.random) => shuffle([...Array(n).keys()], rnd).slice(0, k);
  function seeded(seed) { // mulberry32 — the daily challenge is the same on every device
    return () => {
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // ---------- Gates ----------
  // Walls with holes in the target's shape fly at the board. Wall n (0-based) changes k sides of the
  // previous wall's shape and takes `travel` seconds to arrive; both tighten as the run goes on.
  function gateWall(n, sides, rnd = Math.random) {
    const cap = Math.min(sides, 4 + (sides > 4 && n >= 30));
    const lo = n < 10 ? 1 : 2;
    const hi = Math.min(cap, n < 4 ? 1 : n < 10 ? 2 : n < 20 ? 3 : cap);
    const k = Math.max(1, Math.min(lo, hi) + Math.floor(rnd() * (hi - Math.min(lo, hi) + 1)));
    const travel = Math.max(1.6, 4.5 - n * .1) + (k - 1) * .35; // extra time for each extra swipe
    return { k, travel: Math.round(travel * 100) / 100 };
  }
  // Points for a cleared wall: base 100, plus up to 100 for clearing it early, plus 50 with no wasted
  // swipe, all times the combo (walls cleared in a row, this one included, capped at 10).
  function gateScore(combo, earlyFraction, perfect) {
    const early = Math.round(Math.max(0, Math.min(1, earlyFraction)) * 100);
    return (100 + early + (perfect ? 50 : 0)) * Math.min(Math.max(1, combo), 10);
  }
  // Apparent size of a wall that is a fraction p of the way to the board (perspective: size ∝ 1 / distance).
  const gateScale = p => 1 / (1 + 3 * (1 - Math.max(0, Math.min(1, p))));

  // Special walls, mixed in once a run is going:
  //   blink  — the holes vanish partway, fit them from memory
  //   locked — one side is chained and can't be swiped
  //   gold   — 30% faster, worth triple points
  //   double — the next wall follows straight behind it
  const WALL_KINDS = {
    normal: { label: '' },
    blink: { label: 'blink wall · remember the holes' },
    locked: { label: 'locked wall · one side is chained' },
    gold: { label: 'gold wall · fast, triple points' },
    double: { label: 'double wall · another right behind' },
  };
  function gateKind(n, rnd = Math.random) {
    if (n < 5) return 'normal';
    const r = rnd();
    const odds = Math.min(.5, .25 + n * .006); // special walls get more common
    if (r >= odds) return 'normal';
    const pick = r / odds; // 0..1 within the special share
    if (n < 8) return pick < .5 ? 'blink' : 'gold';
    return pick < .3 ? 'blink' : pick < .55 ? 'locked' : pick < .78 ? 'double' : 'gold';
  }
  // Power-ups ride on some walls; clearing the wall collects it.
  //   slow   — walls move at half speed for 5 seconds
  //   shield — the next crash costs no life and keeps the combo
  //   skip   — the current wall vanishes without a crash
  const POWERUPS = ['slow', 'shield', 'skip'];
  function gateDrop(n, rnd = Math.random) {
    if (n < 6) return null;
    return rnd() < .14 ? POWERUPS[Math.floor(rnd() * POWERUPS.length)] : null;
  }
  // A side that may be locked: one the board doesn't need to reach the target.
  function lockableSide(board, target, rnd = Math.random) {
    const need = edgesBetween(board, target) || [];
    const free = [...Array(board.length).keys()].filter(s => !need.includes(s));
    return free.length ? free[Math.floor(rnd() * free.length)] : null;
  }

  // ---------- Daily challenge ----------
  // Everyone gets the same walls on the same day: the seed and the world come from the local date.
  function dailyInfo(date = new Date()) {
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const day = Math.floor(Date.UTC(y, m - 1, d) / 864e5);
    return { key, day, seed: day * 2654435761 % 4294967296, world: WORLD_ORDER[day % WORLD_ORDER.length] };
  }
  // Streak after playing on `day`, given the last day played and the streak then.
  const nextStreak = (lastDay, streak, day) => lastDay === day ? streak : lastDay === day - 1 ? streak + 1 : 1;

  // ---------- Unlocks ----------
  // Triangle is open from the start; each next world opens with a Gates score in the one before.
  const UNLOCKS = { tri: null, square: { after: 'tri', score: 3000 }, hex: { after: 'square', score: 8000 } };
  function isUnlocked(worldId, bests) {
    const u = UNLOCKS[worldId];
    return !u || (bests[u.after] || 0) >= u.score || (bests[worldId] || 0) > 0;
  }

  // ---------- Achievements ----------
  // Each test reads lifetime stats `s` and, when a run has just changed, that run `r`.
  const ACHIEVEMENTS = [
    { id: 'first', name: 'Through the gap', desc: 'Clear your first wall.', test: s => s.walls >= 1 },
    { id: 'combo5', name: 'On a roll', desc: 'Reach a ×5 combo.', test: s => s.bestCombo >= 5 },
    { id: 'combo10', name: 'Unstoppable', desc: 'Reach the ×10 combo.', test: s => s.bestCombo >= 10 },
    { id: 'run25', name: 'Long haul', desc: 'Clear 25 walls in one run.', test: s => s.bestRun >= 25 },
    { id: 'run50', name: 'Marathon', desc: 'Clear 50 walls in one run.', test: s => s.bestRun >= 50 },
    { id: 'score10k', name: 'Five figures', desc: 'Score 10,000 in one run.', test: s => s.bestScore >= 10000 },
    { id: 'score50k', name: 'High flyer', desc: 'Score 50,000 in one run.', test: s => s.bestScore >= 50000 },
    { id: 'clean10', name: 'Clean hands', desc: 'Clear 10 walls in a row without a wasted swipe.', test: s => s.bestClean >= 10 },
    { id: 'gold', name: 'Gold rush', desc: 'Clear a gold wall.', test: s => s.gold >= 1 },
    { id: 'blink', name: 'Photographic', desc: 'Clear a blink wall after its holes vanish.', test: s => s.blink >= 1 },
    { id: 'shield', name: 'Saved', desc: 'Survive a crash with a shield.', test: s => s.shielded >= 1 },
    { id: 'daily3', name: 'Habit', desc: 'Play the daily challenge 3 days in a row.', test: s => s.dailyStreak >= 3 },
    { id: 'square', name: 'Back to the square', desc: 'Unlock Carreau.', test: (s, b) => isUnlocked('square', b) },
    { id: 'hex', name: 'Into the hive', desc: 'Unlock Ruche.', test: (s, b) => isUnlocked('hex', b) },
  ];
  const STAT_KEYS = ['runs', 'walls', 'crashes', 'clean', 'bestCombo', 'bestRun', 'bestScore', 'bestClean', 'gold', 'blink', 'shielded', 'dailyStreak', 'dailyLast', 'seconds'];
  const emptyStats = () => Object.fromEntries(STAT_KEYS.map(k => [k, k === 'dailyLast' ? -1 : 0]));
  // Achievements met now that weren't in `have`.
  const newAchievements = (have, stats, bests) => ACHIEVEMENTS.filter(a => !have.includes(a.id) && a.test(stats, bests)).map(a => a.id);

  // ---------- Geometry ----------
  // Vertices of a world's polygon with side length = units, centred on 0,0 (y down).
  function vertices(worldId) {
    const w = world(worldId);
    const R = w.units / (2 * Math.sin(Math.PI / w.sides));
    const out = [];
    for (let i = 0; i < w.sides; i++) {
      const ang = (w.rotation + i * 360 / w.sides) * Math.PI / 180;
      out.push([R * Math.cos(ang), R * Math.sin(ang)]);
    }
    return out;
  }
  // Corner piece i as a parallelogram, given (possibly animated) lengths a and b.
  function piecePolygon(verts, i, a, b) {
    const n = verts.length, P = verts[i], prev = verts[(i - 1 + n) % n], next = verts[(i + 1) % n];
    const L = Math.hypot(next[0] - P[0], next[1] - P[1]);
    const u = [(next[0] - P[0]) / L, (next[1] - P[1]) / L];
    const v = [(prev[0] - P[0]) / L, (prev[1] - P[1]) / L];
    return [
      P,
      [P[0] + b * u[0], P[1] + b * u[1]],
      [P[0] + b * u[0] + a * v[0], P[1] + b * u[1] + a * v[1]],
      [P[0] + a * v[0], P[1] + a * v[1]],
    ];
  }
  // Which side a swipe works: the side most parallel to the swipe; among parallel sides
  // (square, hexagon), the one on the half of the board where the swipe started.
  function sideForSwipe(worldId, dx, dy, sx, sy) {
    const verts = vertices(worldId), n = verts.length;
    const swipeAng = Math.atan2(dy, dx);
    let best = null;
    for (let s = 0; s < n; s++) {
      const A = verts[s], B = verts[(s + 1) % n];
      const sideAng = Math.atan2(B[1] - A[1], B[0] - A[0]);
      let diff = Math.abs(swipeAng - sideAng) % Math.PI;
      diff = Math.min(diff, Math.PI - diff);
      const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const side = mid[0] * sx + mid[1] * sy; // > 0 when the start point is on this side's half
      const score = Math.round(diff * 1000) / 1000;
      if (!best || score < best.score - 1e-6 || (Math.abs(score - best.score) < 1e-6 && side > best.side)) best = { s, score, side };
    }
    return best.s;
  }

  return {
    WORLDS, WORLD_ORDER, world, initial, clone, same, apply, edgesBetween,
    randomEdges, seeded, vertices, piecePolygon, sideForSwipe,
    gateWall, gateScore, gateScale, WALL_KINDS, gateKind, POWERUPS, gateDrop, lockableSide,
    dailyInfo, nextStreak, UNLOCKS, isUnlocked, ACHIEVEMENTS, STAT_KEYS, emptyStats, newAchievements,
  };
});
