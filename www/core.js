// Carreau game rules, shared by the page and the unit tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CarreauCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Each corner piece has a width and height of 1 or 2 units on a 5×5 board.
  // 1×1 = carreau, 2×1 = rectangle horizontal, 1×2 = rectangle vertical, 2×2 = carreau grand.
  const CORNERS = ['tl', 'tr', 'bl', 'br'];
  // A horizontal swipe toggles width, a vertical swipe toggles height — for the pair on that edge.
  // Moves are their own inverse and commute, so a target made from k distinct edges is exactly k moves away.
  const EDGES = {
    top:    ['tl', 'tr', 'w'],
    bottom: ['bl', 'br', 'w'],
    left:   ['tl', 'bl', 'h'],
    right:  ['tr', 'br', 'h'],
  };
  const LEVEL_COUNT = 30;

  const initial = () => ({ tl: { w: 1, h: 2 }, tr: { w: 2, h: 2 }, bl: { w: 1, h: 1 }, br: { w: 2, h: 1 } });
  const clone = s => JSON.parse(JSON.stringify(s));
  const same = (a, b) => CORNERS.every(c => a[c].w === b[c].w && a[c].h === b[c].h);
  function apply(s, edge) {
    const [a, b, k] = EDGES[edge];
    s[a][k] = 3 - s[a][k];
    s[b][k] = 3 - s[b][k];
    return s;
  }
  // The edges to swipe to get from a to b, or null when b can't be reached
  // (each edge flips two pieces together, so the pair must differ together).
  function edgesBetween(a, b) {
    const out = [];
    for (const [edge, [p, q, k]] of Object.entries(EDGES)) {
      const dp = a[p][k] !== b[p][k], dq = a[q][k] !== b[q][k];
      if (dp !== dq) return null;
      if (dp) out.push(edge);
    }
    return out;
  }
  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const randomEdges = (k, rnd = Math.random) => shuffle(Object.keys(EDGES), rnd).slice(0, k);
  function seeded(seed) { // mulberry32 — levels are the same on every device
    return () => {
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function levelDef(n) {
    const r = seeded(n * 7919 + 17);
    const start = {};
    CORNERS.forEach(c => { start[c] = { w: 1 + (r() < .5), h: 1 + (r() < .5) }; });
    const count = n <= 8 ? 1 : n <= 18 ? 2 : 3;
    const targets = [];
    let cur = start, optimal = 0;
    for (let i = 0; i < count; i++) {
      const k = n <= 3 ? 1 : n <= 8 ? 2 + Math.floor(r() * 3) : 1 + Math.floor(r() * 4);
      const t = clone(cur);
      randomEdges(k, r).forEach(e => apply(t, e));
      targets.push(t); optimal += k; cur = t;
    }
    // Every swipe flips one edge, so the move count always has the same parity as the optimum:
    // slack is even, and levels 25+ must be solved perfectly.
    const slack = n <= 10 ? 4 : n <= 24 ? 2 : 0;
    return { start, targets, optimal, budget: optimal + slack };
  }
  // One wasted swipe always costs two moves (it has to be undone), so ★★ allows one detour.
  const starsFor = (moves, optimal) => moves <= optimal ? 3 : moves <= optimal + 2 ? 2 : 1;

  return { CORNERS, EDGES, LEVEL_COUNT, initial, clone, same, apply, edgesBetween, randomEdges, seeded, levelDef, starsFor };
});
