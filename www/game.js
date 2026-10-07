(() => {
  // ---------- Rules (core.js) ----------
  const {
    WORLDS, WORLD_ORDER, LEVEL_COUNT, world, initial, clone, same, apply, randomEdges,
    levelDef, starsFor, vertices, piecePolygon, sideForSwipe, edgesBetween, gateWall, gateScore, gateScale,
  } = window.CarreauCore;
  // Modes with a clock: they pause when you leave the app.
  const timed = mode => mode === 'rush' || mode === 'memory' || mode === 'gates';
  const RUSH_TIME = 60;
  const HINTS = {
    tri: 'swipe along a side to resize its two corners',
    square: 'swipe ⇄ top / bottom half · ⇅ left / right half',
    hex: 'swipe along a side, on that side of the board',
  };
  const SQUARE_SIDE_NAMES = ['Top', 'Right', 'Bottom', 'Left'];
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Native plugins exist only inside the Capacitor app.
  const plugin = name => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name];
  const isApp = !!plugin('App');

  // ---------- Storage (optional; the game works without it) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const settings = Object.assign({ sound: true, vibe: true, world: 'square' }, store.get('carreau-settings', {}));
  if (!WORLDS[settings.world]) settings.world = 'square';
  const saveSettings = () => store.set('carreau-settings', settings);
  const progress = (() => {
    let p = store.get('carreau-progress', null);
    if (!p) {
      p = {};
      // Saves from before the worlds existed were square-only.
      const oldStars = store.get('carreau-levels', null), oldBest = store.get('carreau-bests', null);
      if (oldStars || oldBest) p.square = { stars: oldStars || {}, best: oldBest || {} };
    }
    WORLD_ORDER.forEach(w => {
      p[w] = p[w] || {};
      p[w].stars = p[w].stars || {};
      p[w].best = Object.assign({ gates: 0, rush: 0, memory: 0, zen: 0 }, p[w].best);
    });
    return p;
  })();
  const saveProgress = () => store.set('carreau-progress', progress);

  // ---------- Sound (synthesized, no files) ----------
  const audio = {
    ctx: null,
    ensure() {
      if (!settings.sound) return null;
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          this.ctx = new AC();
          this.out = this.ctx.createGain();
          this.out.gain.value = .6;
          this.out.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
      } catch (e) { return null; }
    },
    suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) {} },
    noise(at, dur, f0, f1, vol) {
      const c = this.ctx;
      if (!this.noiseBuf) {
        this.noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * .6), c.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noiseBuf;
      f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + dur);
      g.gain.setValueAtTime(.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + dur * .3);
      g.gain.exponentialRampToValueAtTime(.0001, at + dur);
      src.connect(f); f.connect(g); g.connect(this.out);
      src.start(at); src.stop(at + dur + .05);
    },
    tone(f, at, dur, type, vol) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, at);
      g.gain.setValueAtTime(.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + .012);
      g.gain.exponentialRampToValueAtTime(.0001, at + dur);
      o.connect(g); g.connect(this.out);
      o.start(at); o.stop(at + dur + .05);
    },
    play(name, arg) {
      const c = this.ensure();
      if (!c) return;
      const t = c.currentTime + .005;
      const arp = (notes, step, dur, type, vol) => notes.forEach((f, i) => this.tone(f, t + i * step, dur, type, vol));
      switch (name) {
        case 'move': {
          // One note of a pentatonic scale per side.
          const f = [392, 440, 330, 349, 494, 294][arg % 6] || 392;
          this.tone(f, t, .09, 'triangle', .1); this.tone(f * 2, t, .05, 'sine', .03); break;
        }
        case 'match': arp([523.25, 659.25, 783.99], .055, .22, 'sine', .16); break;
        case 'perfect': arp([523.25, 659.25, 783.99, 1046.5], .05, .3, 'sine', .16); this.tone(1568, t + .2, .32, 'triangle', .05); break;
        case 'step': arp([587.33, 880], .06, .18, 'sine', .13); break;
        case 'clear': arp([523.25, 659.25, 783.99, 1046.5, 1318.5], .08, .4, 'triangle', .12); break;
        case 'fail': this.tone(220, t, .16, 'square', .045); this.tone(165, t + .13, .26, 'square', .045); break;
        case 'tick': this.tone(1200, t, .04, 'square', .035); break;
        // Gates: the chime climbs a semitone with every wall in the combo.
        case 'pass': { const up = Math.pow(2, Math.min(arg || 1, 12) / 12); arp([523.25, 659.25, 783.99].map(f => f * up), .045, .2, 'sine', .14); this.noise(t, .35, 400, 2600, .22); break; }
        case 'crash': this.noise(t, .5, 900, 110, .4); this.tone(98, t, .32, 'square', .06); break;
      }
    },
  };
  const HAPTICS = { match: 18, perfect: [15, 40, 25], step: 14, clear: [20, 40, 20, 40, 60], fail: [40, 30, 40] };
  // In the app the native Haptics plugin is used (iOS has no navigator.vibrate).
  const NATIVE_HAPTICS = { match: ['impact', { style: 'LIGHT' }], step: ['impact', { style: 'LIGHT' }], perfect: ['impact', { style: 'MEDIUM' }], clear: ['notification', { type: 'SUCCESS' }], fail: ['notification', { type: 'ERROR' }] };
  function haptic(kind) {
    if (!settings.vibe) return;
    try {
      const native = plugin('Haptics');
      if (native) { const [fn, opts] = NATIVE_HAPTICS[kind]; native[fn](opts); return; }
      if (navigator.vibrate) navigator.vibrate(HAPTICS[kind]);
    } catch (e) {}
  }

  // ---------- Board drawing (SVG) ----------
  const $ = id => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const pts = poly => poly.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(' ');

  // Draws one world's board and springs the pieces to new sizes.
  class BoardView {
    constructor(svg, opts) { this.svg = svg; this.opts = opts || {}; this.raf = 0; }
    setWorld(worldId, state) {
      const svg = this.svg, n = world(worldId).sides;
      this.world = worldId;
      svg.innerHTML = '';
      const verts = this.verts = vertices(worldId);
      const xs = verts.map(v => v[0]), ys = verts.map(v => v[1]);
      const pad = this.opts.arrows ? 1.75 : .3;
      const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
      const size = Math.max(maxX - minX, maxY - minY), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      svg.setAttribute('viewBox', `${(cx - size / 2).toFixed(3)} ${(cy - size / 2).toFixed(3)} ${size.toFixed(3)} ${size.toFixed(3)}`);
      svgEl('polygon', { class: 'outline', points: pts(verts) }, svg);
      if (this.opts.arrows) {
        // Gates: a wall with holes in the target's shape, drawn under the pieces.
        this.wallG = svgEl('g', { class: 'wall', visibility: 'hidden' }, svg);
        this.wallPanel = svgEl('path', { class: 'panel', 'fill-rule': 'evenodd' }, this.wallG);
        this.wallHoles = svgEl('path', { class: 'holes' }, this.wallG);
      }
      this.pieces = verts.map(() => svgEl('polygon', { class: 'piece' }, svg));
      this.edges = [];
      if (this.opts.arrows) {
        for (let s = 0; s < n; s++) {
          const A = verts[s], B = verts[(s + 1) % n];
          const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, len = Math.hypot(mx, my);
          let ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
          if (ang > 90.01) ang -= 180;
          if (ang <= -89.99) ang += 180;
          const label = worldId === 'square' ? `${SQUARE_SIDE_NAMES[s]} side` : `Side ${s + 1}`;
          const g = svgEl('g', {
            class: 'edge', 'data-side': s, tabindex: 0, role: 'button', 'aria-label': label,
            transform: `translate(${(mx + mx / len * .95).toFixed(3)} ${(my + my / len * .95).toFixed(3)}) rotate(${ang.toFixed(2)})`,
          }, svg);
          svgEl('rect', { class: 'hit', x: -1.25, y: -.62, width: 2.5, height: 1.24, rx: .32 }, g);
          svgEl('path', { class: 'arrows', d: 'M4 7h31M29 2l6 5M36 17H5M11 22l-6-5', transform: 'scale(.042) translate(-20 -12)' }, g);
          this.edges.push(g);
        }
      }
      this.cur = clone(state);
      this.vel = state.map(() => [0, 0]);
      this.target = clone(state);
      svg.dataset.world = worldId;
      svg.dataset.state = JSON.stringify(state);
      this.draw();
    }
    set(state, instant) {
      this.target = clone(state);
      this.svg.dataset.state = JSON.stringify(state);
      if (instant || reduceMotion || !this.opts.animate) {
        this.cur = clone(state);
        this.vel = state.map(() => [0, 0]);
        this.draw();
        return;
      }
      if (!this.raf) { this.lastT = performance.now(); this.raf = requestAnimationFrame(t => this.step(t)); }
    }
    step(t) {
      const dt = Math.min(.032, Math.max(0, (t - this.lastT) / 1000));
      this.lastT = t;
      let moving = false;
      for (let i = 0; i < this.cur.length; i++) {
        for (let j = 0; j < 2; j++) {
          const goal = this.target[i][j];
          let x = this.cur[i][j], v = this.vel[i][j];
          v += (520 * (goal - x) - 24 * v) * dt; // a springy settle with a little overshoot
          x += v * dt;
          if (Math.abs(goal - x) < .002 && Math.abs(v) < .02) { x = goal; v = 0; } else moving = true;
          this.cur[i][j] = x; this.vel[i][j] = v;
        }
      }
      this.draw();
      this.raf = moving ? requestAnimationFrame(tt => this.step(tt)) : 0;
    }
    setWall(target) {
      if (!this.wallG) return;
      if (!target) { this.wallG.setAttribute('visibility', 'hidden'); return; }
      const R = Math.hypot(this.verts[0][0], this.verts[0][1]), k = (R + .75) / R;
      const path = poly => 'M' + poly.map(p => p[0].toFixed(3) + ' ' + p[1].toFixed(3)).join('L') + 'Z';
      const holes = target.map(([a, b], i) => path(piecePolygon(this.verts, i, a, b))).join('');
      this.wallPanel.setAttribute('d', path(this.verts.map(([x, y]) => [x * k, y * k])) + holes);
      this.wallHoles.setAttribute('d', holes);
      this.wallG.setAttribute('class', 'wall');
      this.wallG.setAttribute('visibility', 'visible');
      this.wallTarget = target;
    }
    setWallView(scale, opacity, cls) {
      if (!this.wallG) return;
      this.wallG.setAttribute('transform', `scale(${scale.toFixed(4)})`);
      this.wallG.style.opacity = opacity.toFixed(3);
      if (cls !== undefined) this.wallG.setAttribute('class', 'wall ' + cls);
    }
    // Outline in green each piece that already fits its hole.
    markFit(target) {
      this.pieces.forEach((p, i) => p.classList.toggle('fit', !!target && target[i][0] === this.target[i][0] && target[i][1] === this.target[i][1]));
    }
    draw() {
      this.pieces.forEach((p, i) => p.setAttribute('points', pts(piecePolygon(this.verts, i, this.cur[i][0], this.cur[i][1]))));
    }
  }

  const boardEl = $('board');
  const mainView = new BoardView(boardEl, { arrows: true, animate: true });
  function miniBoard(worldId, s, cls) {
    const wrap = document.createElement('div');
    wrap.className = 'mini ' + (cls || '');
    const svg = svgEl('svg', { class: 'board', 'aria-hidden': 'true' }, wrap);
    new BoardView(svg).setWorld(worldId, s);
    return wrap;
  }

  // ---------- Screens ----------
  function restart(el, cls) { el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); }
  const SCREENS = ['home', 'levels', 'hud', 'paused', 'result'];
  let screen = 'home';
  function show(name) {
    screen = name;
    SCREENS.forEach(n => { $(n).hidden = n !== name; });
    restart($(name), 'screen');
  }
  function say(text, kind) {
    const h = $('hint');
    h.textContent = text;
    h.classList.remove('say', 'bad');
    if (kind) { void h.offsetWidth; h.classList.add('say'); if (kind === 'bad') h.classList.add('bad'); }
  }
  function fireEdge(side) { const g = mainView.edges[side]; if (g) restart(g, 'fire'); }

  function setStats(list) { list.forEach(([l, v], i) => { $('l' + i).textContent = l; $('v' + i).textContent = v; }); }
  function bump(i) { restart($('v' + i), 'bump'); }
  function setBar(frac, low) {
    $('bar').hidden = frac == null;
    if (frac == null) return;
    $('barfill').style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
    $('bar').classList.toggle('low', !!low);
  }
  function showTargets(list, cur) {
    const box = $('targets');
    box.innerHTML = '';
    const multi = list.length > 1;
    list.forEach((t, i) => {
      const cls = (multi ? 'sm ' : '') + (i < cur ? 'done ' : '') + (i === cur ? 'cur enter' : '');
      box.appendChild(miniBoard(G.world, t, cls));
    });
  }
  function setVeil(on) { const el = $('targets').querySelector('.cur'); if (el) el.classList.toggle('veil', on); }

  // ---------- Game ----------
  let state = initial(settings.world);
  let G = null;

  // Timers that belong to a game: cancelled when it ends, frozen while it is paused.
  function later(fn, ms) {
    const g = G;
    if (!g) return;
    const t = { fn, ms, start: performance.now() };
    const arm = () => { t.start = performance.now(); t.id = setTimeout(() => { g.timers.delete(t); if (G === g) fn(); }, Math.max(0, t.ms)); };
    t.arm = arm;
    g.timers.add(t);
    arm();
  }
  function stopGame() {
    if (G) G.timers.forEach(t => clearTimeout(t.id));
    G = null;
    mainView.setWall(null);
    mainView.markFit(null);
  }

  function setBoard(worldId, s) {
    state = clone(s);
    if (mainView.world !== worldId) mainView.setWorld(worldId, state);
    else mainView.set(state, true);
  }

  function startGame(mode, level) {
    stopGame();
    const w = settings.world;
    G = { mode, world: w, sides: world(w).sides, timers: new Set(), score: 0, perfect: 0, moves: 0, optimal: 0, locked: false, paused: false };
    boardEl.classList.remove('win', 'miss');
    audio.ensure();
    show('hud');
    $('pause').hidden = !timed(mode);
    if (mode === 'level') {
      G.level = level;
      G.def = levelDef(w, level);
      G.ti = 0;
      setBoard(w, G.def.start);
      G.target = G.def.targets[0];
      showTargets(G.def.targets, 0);
      say(G.def.targets.length > 1 ? `level ${level} · ${G.def.targets.length} targets in order` : `level ${level}`);
    } else {
      setBoard(w, initial(w));
      if (mode === 'gates') { startGates(); return; }
      if (mode === 'memory') G.lives = 3;
      if (mode === 'rush') { G.time = RUSH_TIME; G.lastSec = RUSH_TIME; }
      nextRound();
      if (mode === 'rush') { G.last = performance.now(); requestAnimationFrame(rushTick); say('match the target'); }
      if (mode === 'zen') say('take your time');
    }
    updateHud();
  }

  // ---------- Gates ----------
  function startGates() {
    Object.assign(G, { lives: 3, combo: 0, bestCombo: 0, walls: 0, cleared: 0, queue: [], chain: clone(state) });
    queueWall(); queueWall();
    spawnWall();
    G.last = performance.now();
    requestAnimationFrame(gatesTick);
    say('fit the shape before the wall hits');
  }
  // Walls are made in a chain, each a few swipes from the one before.
  function queueWall() {
    const spec = gateWall(G.walls + G.queue.length, G.sides);
    const t = clone(G.chain);
    randomEdges(spec.k, G.sides).forEach(e => apply(t, e));
    G.chain = t;
    G.queue.push({ target: t, travel: spec.travel });
  }
  function spawnWall() {
    const wall = G.queue.shift();
    queueWall();
    // After a crash the board can already match; then the wall gets one more side.
    if (same(state, wall.target)) apply(wall.target, randomEdges(1, G.sides)[0]);
    G.wall = wall; G.target = wall.target;
    G.optimal = edgesBetween(state, wall.target).length;
    G.moves = 0; G.p = 0; G.phase = 'approach'; G.warned = false;
    mainView.setWall(wall.target);
    mainView.setWallView(gateScale(0), .25, '');
    mainView.markFit(wall.target);
    const box = $('targets');
    box.innerHTML = '';
    box.appendChild(miniBoard(G.world, wall.target, 'cur enter'));
    box.appendChild(miniBoard(G.world, G.queue[0].target, 'sm next'));
    updateHud();
  }
  function gatesTick(t) {
    if (!G || G.mode !== 'gates' || G.paused) return;
    const dt = Math.min(.1, Math.max(0, (t - G.last) / 1000));
    G.last = t;
    if (G.phase === 'approach') {
      G.p += dt / G.wall.travel;
      if (G.p >= 1) { G.p = 1; crash(); }
      else {
        const danger = G.p > .75;
        if (danger && !G.warned) { G.warned = true; audio.play('tick'); }
        mainView.setWallView(gateScale(G.p), .25 + .6 * G.p, danger ? 'danger' : '');
      }
    } else if (G.phase === 'swoosh') {
      G.sw = Math.min(1, G.sw + dt / .32);
      const e = G.sw * G.sw;
      mainView.setWallView(G.swFrom + (1.8 - G.swFrom) * e, (1 - G.sw) * .8, 'passed');
      if (G.sw >= 1) { G.locked = false; spawnWall(); }
    }
    if (G) { updateHud(); requestAnimationFrame(gatesTick); }
  }
  function gatesMove() {
    mainView.markFit(G.target);
    if (G.phase === 'approach' && same(state, G.target)) passWall();
    updateHud();
  }
  function passWall() {
    G.combo++; G.cleared++; G.walls++;
    G.bestCombo = Math.max(G.bestCombo, G.combo);
    const perfect = G.moves === G.optimal;
    if (perfect) G.perfect++;
    const pts = gateScore(G.combo, 1 - G.p, perfect);
    G.score += pts;
    bump(0); bump(1);
    let msg = `+${pts}` + (G.combo > 1 ? ` · combo ×${Math.min(G.combo, 10)}` : '') + (perfect ? ' · clean' : '');
    if (G.cleared % 15 === 0 && G.lives < 3) { G.lives++; bump(2); msg += ' · +1 life'; }
    say(msg, 'good');
    restart(boardEl, 'pop');
    boardEl.classList.add('win');
    setTimeout(() => boardEl.classList.remove('win'), 380);
    audio.play('pass', G.combo);
    haptic(perfect ? 'perfect' : 'match');
    G.phase = 'swoosh'; G.sw = 0; G.swFrom = gateScale(G.p); G.locked = true;
  }
  function crash() {
    G.phase = 'crash'; G.lives--; G.combo = 0; G.walls++;
    G.locked = true;
    mainView.setWallView(1, .9, 'hit');
    bump(2);
    say(G.lives > 0 ? 'crash! the wall hit' : 'crash! out of lives', 'bad');
    restart(boardEl, 'shake');
    boardEl.classList.add('miss');
    setTimeout(() => boardEl.classList.remove('miss'), 700);
    audio.play('crash');
    haptic('fail');
    later(() => {
      if (G.lives <= 0) return finish();
      G.locked = false;
      spawnWall();
    }, 900);
  }

  function pickK() {
    const r = Math.random(), s = G.score, n = G.sides;
    if (G.mode === 'rush') return s < 3 ? 1 + (r < .5) : s < 8 ? Math.min(n, 2 + (r < .5)) : 2 + Math.floor(r * (Math.min(n, 5) - 1));
    if (G.mode === 'memory') return Math.min(n, 5, 1 + Math.floor(s / 3));
    return 1 + Math.floor(r * n);
  }
  function nextRound() {
    const k = pickK();
    const t = clone(state);
    randomEdges(k, G.sides).forEach(e => apply(t, e));
    G.target = t; G.optimal = k; G.moves = 0;
    showTargets([t], 0);
    if (G.mode === 'memory') memorize();
    updateHud();
  }

  function memorize() {
    G.phase = 'show'; G.locked = true;
    G.showMs = Math.max(900, 1900 - G.score * 70);
    G.showStart = performance.now();
    say('memorize it…');
    memoryBar();
    later(() => {
      G.phase = 'play'; G.locked = false;
      setVeil(true);
      say('now rebuild it');
      updateHud();
    }, G.showMs);
  }
  function memoryBar() {
    const g = G;
    (function frame() {
      if (G !== g || g.phase !== 'show' || g.paused) return;
      setBar(1 - (performance.now() - g.showStart) / g.showMs);
      requestAnimationFrame(frame);
    })();
  }

  function rushTick(t) {
    if (!G || G.mode !== 'rush' || G.paused) return;
    const dt = Math.min(.1, Math.max(0, (t - G.last) / 1000));
    G.last = t;
    G.time -= dt;
    const sec = Math.ceil(G.time);
    if (sec <= 5 && sec < G.lastSec && sec > 0) audio.play('tick');
    G.lastSec = sec;
    if (G.time <= 0) { G.time = 0; updateHud(); return finish(); }
    updateHud();
    requestAnimationFrame(rushTick);
  }

  function pause() {
    if (!G || G.paused || !timed(G.mode)) return;
    G.paused = true;
    G.pausedAt = performance.now();
    G.timers.forEach(t => { clearTimeout(t.id); t.ms -= G.pausedAt - t.start; });
    show('paused');
    say('paused');
  }
  function resume() {
    if (!G || !G.paused) return;
    const now = performance.now();
    G.paused = false;
    if (G.showStart) G.showStart += now - G.pausedAt;
    G.last = now;
    G.timers.forEach(t => t.arm());
    show('hud');
    // Re-render the targets panel the way it was.
    if (G.mode === 'memory') {
      if (G.phase === 'show') { say('memorize it…'); memoryBar(); } else say('now rebuild it');
    } else if (G.mode === 'gates') {
      say('fit the shape before the wall hits');
      requestAnimationFrame(gatesTick);
    } else {
      say('match the target');
      requestAnimationFrame(rushTick);
    }
  }

  function updateHud() {
    if (!G) return;
    const m = G.mode;
    if (m === 'gates') {
      setStats([['Score', G.score], ['Combo', '×' + Math.min(Math.max(G.combo, 1), 10)], ['Lives', '♥'.repeat(Math.max(0, G.lives)) + '♡'.repeat(3 - Math.max(0, G.lives))]]);
      setBar(1 - G.p, G.p > .75);
      $('line').textContent = `Wall ${G.walls + (G.phase === 'approach' ? 1 : 0)} · ${G.optimal} swipe${G.optimal === 1 ? '' : 's'}`;
    } else if (m === 'rush') {
      setStats([['Score', G.score], ['Perfect', G.perfect], ['Time', Math.ceil(G.time)]]);
      setBar(G.time / RUSH_TIME, G.time < 10);
      $('line').textContent = `Moves ${G.moves} · best possible ${G.optimal}`;
    } else if (m === 'zen') {
      setStats([['Matched', G.score], ['Perfect', G.perfect], ['Moves', G.moves]]);
      setBar(null);
      $('line').textContent = `Best possible ${G.optimal}`;
    } else if (m === 'memory') {
      const left = G.phase === 'show' ? G.optimal : Math.max(0, G.optimal - G.moves);
      setStats([['Score', G.score], ['Lives', '♥'.repeat(G.lives) + '♡'.repeat(3 - G.lives)], ['Moves left', left]]);
      if (G.phase !== 'show') setBar(null);
      $('line').textContent = G.phase === 'show' ? 'Remember the shape' : `Exactly ${G.optimal} move${G.optimal > 1 ? 's' : ''}`;
    } else if (m === 'level') {
      const d = G.def;
      setStats([['Level', G.level], ['Target', `${Math.min(G.ti + 1, d.targets.length)}/${d.targets.length}`], ['Moves', `${G.moves}/${d.budget}`]]);
      setBar(1 - G.moves / d.budget, d.budget - G.moves <= 1);
      $('line').textContent = d.budget === d.optimal ? `Perfect only: ${d.optimal} moves` : `★★★ in ${d.optimal} · ★★ in ${d.optimal + 2}`;
    }
  }

  function celebrate(kind) {
    restart(boardEl, 'pop');
    boardEl.classList.add('win');
    setTimeout(() => boardEl.classList.remove('win'), 380);
    audio.play(kind);
    haptic(kind);
  }
  function miss() {
    restart(boardEl, 'shake');
    boardEl.classList.add('miss');
    setTimeout(() => boardEl.classList.remove('miss'), 700);
    audio.play('fail');
    haptic('fail');
  }

  function move(side) {
    if (G && (G.locked || G.paused)) return;
    if (!(side >= 0 && side < state.length)) return;
    apply(state, side);
    mainView.set(state);
    fireEdge(side);
    audio.play('move', side);
    if (!G) return;
    G.moves++;
    if (G.mode === 'gates') return gatesMove();
    if (G.mode === 'level') levelMove();
    else if (G.mode === 'memory') memoryMove();
    else if (same(state, G.target)) roundWin();
    updateHud();
  }

  function roundWin() {
    const perfect = G.moves === G.optimal;
    G.score++; bump(0);
    if (perfect) { G.perfect++; bump(1); }
    if (G.mode === 'rush') {
      G.time = Math.min(RUSH_TIME, G.time + (perfect ? 3 : 1));
      say(perfect ? 'perfect! +3 s' : 'matched +1 s', 'good');
    } else {
      say(perfect ? 'perfect!' : 'matched', 'good');
    }
    celebrate(perfect ? 'perfect' : 'match');
    G.locked = true;
    later(() => { G.locked = false; nextRound(); }, 340);
  }

  function memoryMove() {
    if (same(state, G.target)) {
      G.score++; bump(0);
      setVeil(false);
      say('remembered!', 'good');
      celebrate('perfect');
      G.locked = true;
      later(() => { G.locked = false; nextRound(); }, 650);
    } else if (G.moves >= G.optimal) {
      G.lives--; bump(1);
      setVeil(false);
      say('not quite · that was the shape', 'bad');
      miss();
      G.locked = true;
      later(() => { if (G.lives <= 0) return finish(); G.locked = false; nextRound(); }, 1400);
    }
  }

  function levelMove() {
    const d = G.def;
    if (same(state, G.target)) {
      G.ti++;
      if (G.ti >= d.targets.length) return levelWin();
      G.target = d.targets[G.ti];
      showTargets(d.targets, G.ti);
      say(`next target · ${G.ti + 1} of ${d.targets.length}`, 'good');
      celebrate('step');
    } else if (G.moves >= d.budget) {
      say('out of moves', 'bad');
      miss();
      G.locked = true;
      later(() => finish('out'), 800);
    }
  }

  function levelWin() {
    const d = G.def, n = G.level, stars = progress[G.world].stars;
    const got = starsFor(G.moves, d.optimal);
    if (got > (stars[n] || 0)) { stars[n] = got; saveProgress(); }
    G.locked = true;
    say(`level ${n} cleared`, 'good');
    celebrate('clear');
    updateHud();
    later(() => finish('win', got), 750);
  }

  function finish(reason, got) {
    const g = G;
    stopGame();
    const best = progress[g.world].best;
    let title, text, main, alt;
    const starHtml = k => '★'.repeat(k) + `<span class="dim">${'★'.repeat(3 - k)}</span>`;
    $('resStars').hidden = g.mode !== 'level' || reason !== 'win';
    if (g.mode === 'gates') {
      const isBest = g.score > best.gates;
      if (isBest) { best.gates = g.score; saveProgress(); }
      title = isBest ? 'New best!' : 'Crashed out.';
      text = `${g.score} points. ${g.cleared} wall${g.cleared === 1 ? '' : 's'} cleared, best combo ×${Math.min(g.bestCombo, 10)}. Best: ${best.gates}.`;
      main = ['Play again', () => startGame('gates')];
      alt = ['Modes', goHome];
    } else if (g.mode === 'rush' || g.mode === 'memory') {
      const isBest = g.score > best[g.mode];
      if (isBest) { best[g.mode] = g.score; saveProgress(); }
      title = isBest ? 'New best!' : g.mode === 'rush' ? "Time's up." : 'Out of lives.';
      text = g.mode === 'rush'
        ? `${g.score} shapes matched, ${g.perfect} of them in the fewest moves. Best: ${best.rush}.`
        : `${g.score} shapes rebuilt from memory. Best: ${best.memory}.`;
      main = ['Play again', () => startGame(g.mode)];
      alt = ['Modes', goHome];
    } else if (reason === 'win') {
      title = `Level ${g.level} cleared`;
      $('resStars').innerHTML = starHtml(got);
      text = `${g.moves} moves. The fewest possible is ${g.def.optimal}.`;
      main = g.level < LEVEL_COUNT ? ['Next level', () => startGame('level', g.level + 1)] : ['All levels', openLevels];
      alt = got < 3 ? ['Retry', () => startGame('level', g.level)] : ['Levels', openLevels];
    } else {
      title = 'Out of moves.';
      text = `Level ${g.level} can be done in ${g.def.optimal} move${g.def.optimal > 1 ? 's' : ''}. You have ${g.def.budget}.`;
      main = ['Retry', () => startGame('level', g.level)];
      alt = ['Levels', openLevels];
    }
    $('resTitle').textContent = title;
    $('resText').textContent = text;
    $('resMain').textContent = main[0]; $('resMain').onclick = main[1];
    $('resAlt').textContent = alt[0]; $('resAlt').onclick = alt[1];
    show('result');
    $('resMain').focus({ preventScroll: true });
  }

  function quit() {
    if (G && G.mode === 'zen') {
      const best = progress[G.world].best;
      if (G.score > best.zen) { best.zen = G.score; saveProgress(); }
    }
    if (G && G.mode === 'level') { openLevels(); return; }
    goHome();
  }

  // Android back button and Esc: step back one screen; on the menu, leave the app.
  function back() {
    if (screen === 'paused') return quit();
    if (G) { if (timed(G.mode)) pause(); else quit(); return; }
    if (screen !== 'home') return goHome();
    const app = plugin('App');
    if (app) app.exitApp();
  }

  // ---------- Menus ----------
  const totalStars = w => Object.values(progress[w].stars).reduce((a, b) => a + b, 0);
  function renderWorlds() {
    document.querySelectorAll('.world').forEach(b => {
      const w = b.dataset.world, on = w === settings.world;
      b.setAttribute('aria-pressed', on);
      b.querySelector('em').textContent = `★ ${totalStars(w)}`;
    });
    const w = settings.world, best = progress[w].best;
    $('worldBlurb').textContent = world(w).blurb;
    $('bestGates').textContent = best.gates ? `Best ${best.gates}` : 'New';
    $('bestRush').textContent = best.rush ? `Best ${best.rush}` : 'New';
    $('bestLevels').textContent = `★ ${totalStars(w)} / ${LEVEL_COUNT * 3}`;
    $('bestMemory').textContent = best.memory ? `Best ${best.memory}` : 'New';
    $('bestZen').textContent = best.zen ? `Best run ${best.zen}` : 'New';
  }
  function goHome() {
    stopGame();
    if (mainView.world !== settings.world) setBoard(settings.world, initial(settings.world));
    renderWorlds();
    show('home');
    say(HINTS[settings.world]);
  }
  function chooseWorld(w) {
    if (!WORLDS[w]) return;
    settings.world = w; saveSettings();
    setBoard(w, initial(w));
    renderWorlds();
    say(HINTS[w]);
  }
  function openLevels() {
    stopGame();
    const w = settings.world, stars = progress[w].stars;
    if (mainView.world !== w) setBoard(w, initial(w));
    const grid = $('lvlGrid');
    grid.innerHTML = '';
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const b = document.createElement('button');
      b.className = 'lvl';
      b.disabled = n > 1 && !stars[n - 1];
      const s = stars[n] || 0;
      b.innerHTML = `${n}<small>${'★'.repeat(s)}</small>`;
      b.setAttribute('aria-label', `Level ${n}${b.disabled ? ', locked' : s ? `, ${s} stars` : ''}`);
      b.addEventListener('click', () => startGame('level', n));
      grid.appendChild(b);
    }
    $('lvlTitle').textContent = `${world(w).name} levels`;
    $('starTotal').textContent = `★ ${totalStars(w)} / ${LEVEL_COUNT * 3}`;
    show('levels');
    say('clear a level to unlock the next');
  }

  // World picker: a small drawing of each world's board.
  document.querySelectorAll('.world').forEach(b => {
    const w = b.dataset.world;
    b.prepend(miniBoard(w, initial(w), 'icon'));
    b.addEventListener('click', () => chooseWorld(w));
  });
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => {
    audio.ensure();
    const m = b.dataset.mode;
    if (m === 'levels') openLevels(); else startGame(m);
  }));
  document.querySelectorAll('[data-home]').forEach(b => b.addEventListener('click', goHome));
  $('quit').addEventListener('click', quit);
  $('pause').addEventListener('click', pause);
  $('resume').addEventListener('click', resume);
  $('pausedQuit').addEventListener('click', quit);

  // ---------- Settings ----------
  function syncToggles() {
    $('soundBtn').setAttribute('aria-pressed', settings.sound);
    $('vibeBtn').setAttribute('aria-pressed', settings.vibe);
    $('soundBtn').setAttribute('aria-label', settings.sound ? 'Sound on' : 'Sound off');
    $('vibeBtn').setAttribute('aria-label', settings.vibe ? 'Vibration on' : 'Vibration off');
  }
  $('soundBtn').addEventListener('click', () => {
    settings.sound = !settings.sound; saveSettings(); syncToggles();
    if (settings.sound) audio.play('match'); else audio.suspend();
  });
  $('vibeBtn').addEventListener('click', () => {
    settings.vibe = !settings.vibe; saveSettings(); syncToggles();
    haptic('match');
  });

  // ---------- Input ----------
  boardEl.addEventListener('click', e => {
    const g = e.target.closest('.edge');
    if (g) move(Number(g.dataset.side));
  });
  boardEl.addEventListener('keydown', e => {
    const g = e.target.closest && e.target.closest('.edge');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); move(Number(g.dataset.side)); }
  });

  // Swipes fire as soon as the finger has travelled far enough, not on release.
  // The side most parallel to the swipe is used; with two parallel sides, the one
  // on the half of the board where the swipe started.
  const stage = $('stage');
  let down = null;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.edge')) return;
    down = { x: e.clientX, y: e.clientY, done: false };
  });
  window.addEventListener('pointermove', e => {
    if (!down || down.done) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) < 22) return;
    down.done = true;
    const r = boardEl.getBoundingClientRect();
    move(sideForSwipe(mainView.world, dx, dy, down.x - (r.left + r.width / 2), down.y - (r.top + r.height / 2)));
  });
  const lift = () => { down = null; };
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);

  // Keyboard: number keys work side 1, 2, 3…; in the square world the arrow
  // pointing at a side works it too (also W A S D). Esc steps back.
  const SQUARE_KEYS = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('.edge') && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key.toLowerCase();
    if (/^[1-6]$/.test(k)) { e.preventDefault(); move(Number(k) - 1); }
    else if (mainView.world === 'square' && k in SQUARE_KEYS) { e.preventDefault(); move(SQUARE_KEYS[k]); }
    else if (e.key === 'Escape') back();
  });

  // ---------- App life cycle ----------
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); audio.suspend(); }
  });
  if (isApp) {
    try { plugin('App').addListener('backButton', back); } catch (e) {}
    // Light status-bar icons on the dark theme, dark icons on the light one.
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const syncBars = () => { try { plugin('SystemBars').setStyle({ style: dark.matches ? 'DARK' : 'LIGHT' }); } catch (e) {} };
    syncBars();
    if (dark.addEventListener) dark.addEventListener('change', syncBars);
  }

  syncToggles();
  mainView.setWorld(settings.world, state);
  goHome();

  // Offline support on the web (the app already ships its files).
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !isApp) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
