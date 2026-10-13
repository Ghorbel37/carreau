(() => {
  // ---------- Rules (core.js), drawing (board.js), sound (audio.js) ----------
  const {
    WORLDS, WORLD_ORDER, world, initial, clone, same, apply, randomEdges, seeded, sideForSwipe, edgesBetween,
    gateWall, gateScore, gateCombo, gateScale, WALL_KINDS, gateKind, gateDrop, lockableSide,
    dailyInfo, nextStreak, UNLOCKS, isUnlocked, ACHIEVEMENTS, emptyStats, newAchievements,
  } = window.CarreauCore;
  const { BoardView, miniBoard } = window.CarreauBoard;

  const RUSH_TIME = 60;
  const WALL_MODES = ['gates', 'daily', 'precision', 'tutorial'];
  // Modes that score walls (all wall modes but the tutorial).
  const scoredWalls = mode => mode === 'gates' || mode === 'daily' || mode === 'precision';
  const isWallMode = mode => WALL_MODES.includes(mode);
  // Modes with a clock: they pause when you leave the app.
  const timed = mode => mode === 'rush' || isWallMode(mode);
  const HINTS = {
    tri: 'swipe along a side to resize its two corners',
    square: 'swipe ⇄ top / bottom half · ⇅ left / right half',
    hex: 'swipe along a side, on that side of the board',
  };
  const ITEM_NAMES = { slow: 'slow motion', shield: 'shield', skip: 'skip' };
  const fmt = n => n.toLocaleString('en-US');
  // Native plugins exist only inside the Capacitor app.
  const plugin = name => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name];
  const isApp = !!plugin('App');
  // Testing aids: ?kinds=blink,gold&drops=,shield forces the kind and power-up of wall 1, 2…
  const params = new URLSearchParams(location.search);
  const forced = key => (params.get(key) || '').split(',').map(s => s.trim());
  const FORCED_KINDS = params.has('kinds') ? forced('kinds') : null;
  const FORCED_DROPS = params.has('drops') ? forced('drops') : null;

  // ---------- Storage (optional; the game works without it) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const settings = Object.assign({ sound: true, music: true, vibe: true, world: 'tri', tutorialDone: false }, store.get('carreau-settings', {}));
  const saveSettings = () => store.set('carreau-settings', settings);
  const save = (() => {
    let s = store.get('carreau-save', null);
    if (!s) {
      s = { bests: {} };
      // Earlier versions: per-world bests, or square-only bests before worlds existed.
      const old = store.get('carreau-progress', null), older = store.get('carreau-bests', null);
      if (old) WORLD_ORDER.forEach(w => { if (old[w] && old[w].best) s.bests[w] = old[w].best; });
      else if (older) s.bests.square = older;
    }
    WORLD_ORDER.forEach(w => {
      const b = s.bests[w] || {};
      s.bests[w] = { gates: b.gates || 0, precision: b.precision || 0, rush: b.rush || 0, zen: b.zen || 0 };
    });
    s.stats = Object.assign(emptyStats(), s.stats);
    s.achievements = s.achievements || [];
    s.daily = s.daily || {};
    // A world you already played in stays open.
    s.unlocked = s.unlocked || WORLD_ORDER.filter(w => w === 'tri' || Object.values(s.bests[w]).some(v => v > 0));
    return s;
  })();
  const persist = () => store.set('carreau-save', save);
  const gatesBests = () => Object.fromEntries(WORLD_ORDER.map(w => [w, save.bests[w].gates || (save.unlocked.includes(w) ? 1 : 0)]));
  const unlocked = w => save.unlocked.includes(w) || isUnlocked(w, gatesBests());
  if (!WORLDS[settings.world] || !unlocked(settings.world)) settings.world = 'tri';

  // ---------- Sound and haptics ----------
  const audio = window.CarreauAudio(settings);
  const HAPTICS = { tap: 6, match: 18, perfect: [15, 40, 25], clear: [20, 40, 20, 40, 60], fail: [40, 30, 40] };
  // In the app the native Haptics plugin is used (iOS has no navigator.vibrate).
  const NATIVE_HAPTICS = { tap: ['impact', { style: 'LIGHT' }], match: ['impact', { style: 'LIGHT' }], perfect: ['impact', { style: 'MEDIUM' }], clear: ['notification', { type: 'SUCCESS' }], fail: ['notification', { type: 'ERROR' }] };
  function haptic(kind) {
    if (!settings.vibe) return;
    try {
      const native = plugin('Haptics');
      if (native) { const [fn, opts] = NATIVE_HAPTICS[kind]; native[fn](opts); return; }
      if (navigator.vibrate) navigator.vibrate(HAPTICS[kind]);
    } catch (e) {}
  }

  // ---------- Screens and effects ----------
  const $ = id => document.getElementById(id);
  const boardEl = $('board'), stageEl = $('stage');
  const mainView = new BoardView(boardEl, { arrows: true, animate: true });
  function restart(el, cls) { el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); }
  const SCREENS = ['home', 'hud', 'tut', 'paused', 'result', 'stats'];
  let screen = 'home';
  function show(name) {
    screen = name;
    SCREENS.forEach(n => { $(n).hidden = n !== name; });
    restart($(name), 'screen');
  }
  function say(text, kind) {
    const h = $('hint');
    h.textContent = text;
    h.classList.remove('say', 'bad', 'gold');
    if (kind) { void h.offsetWidth; h.classList.add('say'); if (kind !== 'good') h.classList.add(kind); }
  }
  function floatText(text, cls) {
    const el = document.createElement('div');
    el.className = 'float ' + (cls || '');
    el.textContent = text;
    stageEl.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  function flash(cls) { const f = $('flash'); f.className = ''; void f.offsetWidth; f.className = cls; }
  const toasts = [];
  function toast(title, text) {
    toasts.push([title, text]);
    if (toasts.length === 1) nextToast();
  }
  function nextToast() {
    if (!toasts.length) return;
    const [title, text] = toasts[0], el = $('toast');
    el.innerHTML = '';
    const b = document.createElement('b'); b.textContent = title;
    const s = document.createElement('span'); s.textContent = text;
    el.append(b, s);
    el.hidden = false;
    restart(el, 'show');
    setTimeout(() => { el.hidden = true; toasts.shift(); nextToast(); }, 2400);
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
  const hearts = n => '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, 3 - n));

  // ---------- Game state ----------
  let state = initial(settings.world);
  let G = null;

  // Timers that belong to a game: cancelled when it ends, frozen while it is paused.
  function later(fn, ms) {
    const g = G;
    if (!g) return;
    const t = { fn, ms, start: performance.now() };
    t.arm = () => { t.start = performance.now(); t.id = setTimeout(() => { g.timers.delete(t); if (G === g) fn(); }, Math.max(0, t.ms)); };
    g.timers.add(t);
    t.arm();
  }
  function stopGame() {
    if (G) G.timers.forEach(t => clearTimeout(t.id));
    G = null;
    mainView.setWall(null);
    mainView.markFit(null);
    stageEl.classList.remove('slow');
    audio.stopMusic();
  }
  function setBoard(worldId, s) {
    state = clone(s);
    if (mainView.world !== worldId) mainView.setWorld(worldId, state);
    else mainView.set(state, true);
  }

  function startGame(mode) {
    stopGame();
    const daily = mode === 'daily' ? dailyInfo() : null;
    const w = daily ? daily.world : settings.world;
    G = {
      mode, world: w, sides: world(w).sides, timers: new Set(), score: 0, perfect: 0, moves: 0, optimal: 0,
      locked: false, paused: false, started: performance.now(), daily,
      practice: !!(daily && save.daily.key === daily.key),
      rnd: daily ? seeded(daily.seed) : Math.random,
    };
    boardEl.classList.remove('win', 'miss');
    audio.ensure();
    setBoard(w, initial(w));
    $('pause').hidden = !timed(mode);
    $('items').hidden = !scoredWalls(mode);
    if (mode === 'tutorial') { show('tut'); startWalls(); return; }
    show('hud');
    if (isWallMode(mode)) { startWalls(); return; }
    if (mode === 'rush') { G.time = RUSH_TIME; G.lastSec = RUSH_TIME; }
    nextRound();
    if (mode === 'rush') { G.last = performance.now(); requestAnimationFrame(rushTick); say('match the target'); }
    if (mode === 'zen') say('take your time');
    updateHud();
  }

  // ---------- Gates (also Daily and the tutorial) ----------
  // The tutorial: three slow walls that wait for you, with the side to swipe shown.
  const TUTORIAL = [
    { k: 1, text: 'A wall is coming. Its holes show the shape your corners must take. Swipe along the glowing side.' },
    { k: 1, text: 'Pieces outlined in green already fit their hole. Swipe the glowing side to fit the rest.' },
    { k: 2, text: 'This wall needs two swipes. Real walls don’t wait, and a crash costs one of your 3 lives.' },
  ];
  function startWalls() {
    Object.assign(G, {
      lives: 3, combo: 0, bestCombo: 0, walls: 0, cleared: 0, clean: 0, queue: [], chain: clone(state),
      items: { slow: 0, shield: 0, skip: 0 }, slowLeft: 0, prevKind: 'normal',
    });
    queueWall(); queueWall();
    spawnWall();
    G.last = performance.now();
    requestAnimationFrame(wallTick);
    if (G.mode !== 'tutorial') {
      audio.setIntensity(0);
      audio.startMusic();
      say(G.mode === 'daily' ? `daily challenge · ${world(G.world).name}${G.practice ? ' · practice' : ''}`
        : G.mode === 'precision' ? 'precision · a wasted swipe costs a life' : 'fit the shape before the wall hits');
    }
  }
  // Walls are made in a chain, each a few swipes from the one before.
  function queueWall() {
    const n = G.walls + G.queue.length;
    const tut = G.mode === 'tutorial' ? TUTORIAL[Math.min(n, TUTORIAL.length - 1)] : null;
    const spec = tut ? { k: tut.k, travel: 7 } : gateWall(n, G.sides, G.rnd);
    let kind = tut ? 'normal' : gateKind(n, G.rnd);
    let drop = tut ? null : gateDrop(n, G.rnd);
    if (FORCED_KINDS && !tut) kind = WALL_KINDS[FORCED_KINDS[n]] ? FORCED_KINDS[n] : 'normal';
    if (FORCED_DROPS && !tut) drop = ['slow', 'shield', 'skip'].includes(FORCED_DROPS[n]) ? FORCED_DROPS[n] : null;
    const t = clone(G.chain);
    randomEdges(spec.k, G.sides, G.rnd).forEach(e => apply(t, e));
    G.chain = t;
    // Precision walls come slower: you are meant to think before you swipe.
    const travel = spec.travel * (kind === 'gold' ? .7 : 1) * (G.mode === 'precision' ? 1.25 : 1);
    G.queue.push({ target: t, travel, kind, drop });
  }
  function spawnWall() {
    const wall = G.queue.shift();
    queueWall();
    // After a crash the board can already match; then the wall gets one more side.
    if (same(state, wall.target)) apply(wall.target, randomEdges(1, G.sides, G.rnd)[0]);
    wall.lock = null;
    if (wall.kind === 'locked') {
      wall.lock = lockableSide(state, wall.target, G.rnd);
      if (wall.lock === null) wall.kind = 'normal';
    }
    G.wall = wall; G.target = wall.target;
    G.optimal = edgesBetween(state, wall.target).length;
    G.moves = 0; G.wasted = 0; G.phase = 'approach'; G.warned = false; G.blinked = false;
    G.p = G.prevKind === 'double' ? .4 : 0; // the second half of a double wall is already close
    mainView.setWall(wall.target, wall.kind, wall.drop ? wall.drop.toUpperCase() : '');
    mainView.setLock(wall.lock);
    mainView.setWallView(gateScale(G.p), .25, '');
    mainView.markFit(wall.target);
    const box = $('targets');
    box.innerHTML = '';
    box.appendChild(miniBoard(G.world, wall.target, 'cur enter ' + wall.kind));
    box.appendChild(miniBoard(G.world, G.queue[0].target, 'sm next'));
    if (G.mode === 'tutorial') {
      const step = TUTORIAL[Math.min(G.walls, TUTORIAL.length - 1)];
      $('tutText').textContent = step.text;
      $('tutStep').textContent = `Step ${G.walls + 1} of ${TUTORIAL.length}`;
      showGuide();
    } else if (wall.kind !== 'normal') {
      say(WALL_KINDS[wall.kind].label, wall.kind === 'gold' ? 'gold' : 'good');
    } else if (wall.drop) {
      say(`clear this wall to collect ${ITEM_NAMES[wall.drop]}`, 'good');
    }
    updateHud();
  }
  function showGuide() {
    const need = edgesBetween(state, G.target) || [];
    mainView.setGuide(G.phase === 'approach' && need.length ? need[0] : null);
  }
  function wallTick(t) {
    if (!G || !isWallMode(G.mode) || G.paused) return;
    let dt = Math.min(.1, Math.max(0, (t - G.last) / 1000));
    G.last = t;
    if (G.slowLeft > 0) {
      G.slowLeft -= dt;
      dt *= .45;
      if (G.slowLeft <= 0) stageEl.classList.remove('slow');
    }
    if (G.phase === 'approach') {
      G.p += dt / G.wall.travel;
      if (G.mode === 'tutorial') G.p = Math.min(G.p, .62); // tutorial walls wait for you
      if (G.wall.kind === 'blink' && !G.blinked && G.p >= .45) {
        G.blinked = true;
        mainView.showHoles(false);
        mainView.markFit(null);
        const cur = $('targets').querySelector('.cur');
        if (cur) cur.classList.add('veil');
        audio.play('blink');
        say('the holes closed · fit them from memory', 'good');
      }
      if (G.p >= 1) { G.p = 1; hitWall(); }
      else {
        const danger = G.p > .75;
        if (danger && !G.warned) { G.warned = true; audio.play('tick'); }
        mainView.setWallView(gateScale(G.p), .25 + .6 * G.p, danger ? 'danger' : '');
      }
    } else if (G.phase === 'swoosh') {
      G.sw = Math.min(1, G.sw + dt / .32);
      mainView.setWallView(G.swFrom + (1.8 - G.swFrom) * G.sw * G.sw, (1 - G.sw) * .8, 'passed');
      if (G.sw >= 1) afterWall();
    }
    if (G) { updateHud(); requestAnimationFrame(wallTick); }
  }
  function afterWall() {
    G.locked = false;
    if (G.mode === 'tutorial' && G.walls >= TUTORIAL.length) return finishTutorial();
    spawnWall();
  }
  function wallMove() {
    if (!G.blinked) mainView.markFit(G.target);
    if (G.phase === 'approach' && same(state, G.target)) passWall();
    else if (G.mode === 'tutorial') showGuide();
    updateHud();
  }
  function wastedSwipe() {
    G.wasted++;
    if (G.mode === 'tutorial') return;
    if (G.mode === 'precision') {
      // Precision: every wasted swipe costs a life and the combo, straight away.
      G.lives--; G.combo = 0; G.clean = 0;
      bump(1); bump(2);
      say(G.lives > 0 ? 'wasted swipe · −1 life' : 'wasted swipe · out of lives', 'bad');
      floatText('−1 life', 'bad');
      flash('bad');
      restart(boardEl, 'shake');
      audio.play('crash');
      haptic('fail');
      if (G.lives <= 0) { G.locked = true; G.phase = 'crash'; later(finish, 900); }
      return;
    }
    // Gates and Daily: the wall will score less; say so unless the holes are hidden (blink).
    if (!G.blinked) say(`extra swipe · fewest was ${G.optimal}`, 'bad');
    audio.play('locked');
  }
  function passWall() {
    const wall = G.wall, wasted = G.wasted, perfect = wasted === 0, st = save.stats;
    G.combo = G.mode === 'precision' ? G.combo + 1 : gateCombo(G.combo, wasted);
    G.cleared++; G.walls++;
    G.bestCombo = Math.max(G.bestCombo, G.combo);
    G.clean = perfect ? G.clean + 1 : 0;
    if (perfect) G.perfect++;
    let pts = gateScore(G.combo, 1 - G.p, wasted) * (wall.kind === 'gold' ? 3 : 1);
    if (G.mode === 'precision' && perfect) pts = Math.round(pts * 1.5);
    if (G.mode === 'tutorial') pts = 0;
    G.score += pts;
    G.prevKind = wall.kind;
    mainView.setGuide(null);
    mainView.setLock(null);
    if (G.mode !== 'tutorial') {
      bump(0); bump(1);
      const tags = [];
      if (G.combo > 1) tags.push(`combo ×${Math.min(G.combo, 10)}`);
      if (perfect) tags.push(G.mode === 'precision' ? 'clean ×1.5' : 'clean');
      else if (G.mode !== 'precision') tags.push(`${wasted} wasted swipe${wasted > 1 ? 's' : ''} · −${Math.min(75, wasted * 25)}%`);
      if (wall.kind === 'gold') tags.push('gold ×3');
      if (wall.drop) { G.items[wall.drop] = Math.min(3, G.items[wall.drop] + 1); tags.push(`+${ITEM_NAMES[wall.drop]}`); audio.play('item'); }
      if (G.cleared % 15 === 0 && G.lives < 3) { G.lives++; bump(2); tags.push('+1 life'); }
      say(tags.join(' · ') || 'through!', wall.kind === 'gold' ? 'gold' : 'good');
      floatText(`+${fmt(pts)}`, wall.kind === 'gold' ? 'gold' : 'good');
      if (G.combo % 5 === 0) flash('good');
      if (wall.kind === 'gold') flash('gold');
      audio.setIntensity(G.walls);
      // Lifetime stats count as you play, so achievements pop mid-run.
      st.walls++;
      if (perfect) st.clean++;
      if (wall.kind === 'gold') st.gold++;
      if (wall.kind === 'blink' && G.blinked) st.blink++;
      st.bestCombo = Math.max(st.bestCombo, G.combo);
      st.bestClean = Math.max(st.bestClean, G.clean);
      st.bestRun = Math.max(st.bestRun, G.cleared);
      st.bestScore = Math.max(st.bestScore, G.score);
      checkAchievements();
    } else {
      say('nice!', 'good');
    }
    restart(boardEl, 'pop');
    boardEl.classList.add('win');
    setTimeout(() => boardEl.classList.remove('win'), 380);
    audio.play(wall.kind === 'gold' ? 'gold' : 'pass', G.combo);
    haptic(perfect ? 'perfect' : 'match');
    G.phase = 'swoosh'; G.sw = 0; G.swFrom = gateScale(G.p); G.locked = true;
  }
  function hitWall() {
    if (G.items.shield > 0) {
      // The shield takes the hit: the wall shatters, no life lost, combo kept.
      G.items.shield--; G.walls++;
      G.prevKind = G.wall.kind;
      save.stats.shielded++;
      checkAchievements();
      mainView.shatter('shield');
      mainView.setWall(null);
      flash('good');
      say('the shield took the hit', 'good');
      audio.play('shatter');
      haptic('match');
      G.phase = 'crash'; G.locked = true;
      later(afterWall, 450);
      return;
    }
    G.phase = 'crash'; G.lives--; G.combo = 0; G.clean = 0; G.walls++;
    G.prevKind = G.wall.kind;
    G.locked = true;
    save.stats.crashes++;
    mainView.setWallView(1, .9, 'hit');
    mainView.setGuide(null);
    later(() => { mainView.shatter('hit'); mainView.setWall(null); }, 250);
    bump(2);
    say(G.lives > 0 ? 'crash! the wall hit' : 'crash! out of lives', 'bad');
    floatText('−1 life', 'bad');
    flash('bad');
    restart(boardEl, 'shake');
    boardEl.classList.add('miss');
    setTimeout(() => boardEl.classList.remove('miss'), 700);
    audio.play('crash');
    haptic('fail');
    later(() => { if (G.lives <= 0) return finish(); afterWall(); }, 900);
  }
  function useItem(name) {
    if (!G || !isWallMode(G.mode) || G.paused || G.phase !== 'approach' || !G.items[name]) return;
    if (name === 'slow') {
      G.items.slow--;
      G.slowLeft = 5;
      stageEl.classList.add('slow');
      audio.play('slow');
      say('slow motion · 5 s', 'good');
    } else if (name === 'skip') {
      // The wall vanishes: no points, no crash, combo kept.
      G.items.skip--; G.walls++;
      G.prevKind = G.wall.kind;
      mainView.shatter('skip');
      mainView.setWall(null);
      audio.play('shatter');
      say('skipped', 'good');
      G.phase = 'crash'; G.locked = true;
      later(afterWall, 350);
    }
    updateHud();
  }
  function finishTutorial() {
    settings.tutorialDone = true; saveSettings();
    stopGame();
    $('resStars').hidden = true;
    $('resTitle').textContent = 'You’re ready.';
    $('resText').textContent = 'Clear walls early for more points, keep a combo going, and watch for special walls: blink, locked, gold and double. Power-ups ride on some walls.';
    $('resExtra').innerHTML = '';
    setResultButtons(['Play Gates', () => startGame('gates')], ['Menu', goHome]);
    show('result');
    say(HINTS[settings.world]);
  }

  // ---------- Rush and Zen ----------
  function pickK() {
    const r = Math.random(), s = G.score, n = G.sides;
    if (G.mode === 'rush') return s < 3 ? 1 + (r < .5) : s < 8 ? Math.min(n, 2 + (r < .5)) : 2 + Math.floor(r * (Math.min(n, 5) - 1));
    return 1 + Math.floor(r * n);
  }
  function nextRound() {
    const k = pickK();
    const t = clone(state);
    randomEdges(k, G.sides).forEach(e => apply(t, e));
    G.target = t; G.optimal = k; G.moves = 0;
    const box = $('targets');
    box.innerHTML = '';
    box.appendChild(miniBoard(G.world, t, 'cur enter'));
    updateHud();
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
    restart(boardEl, 'pop');
    boardEl.classList.add('win');
    setTimeout(() => boardEl.classList.remove('win'), 380);
    audio.play(perfect ? 'perfect' : 'match');
    haptic(perfect ? 'perfect' : 'match');
    G.locked = true;
    later(() => { G.locked = false; nextRound(); }, 340);
  }

  // ---------- Shared play ----------
  function pause() {
    if (!G || G.paused || !timed(G.mode)) return;
    G.paused = true;
    G.pausedAt = performance.now();
    G.timers.forEach(t => { clearTimeout(t.id); t.ms -= G.pausedAt - t.start; });
    audio.stopMusic();
    show('paused');
    say('paused');
  }
  function resume() {
    if (!G || !G.paused) return;
    G.paused = false;
    G.last = performance.now();
    G.timers.forEach(t => t.arm());
    show(G.mode === 'tutorial' ? 'tut' : 'hud');
    if (isWallMode(G.mode)) {
      if (G.mode !== 'tutorial') { audio.startMusic(); say(G.mode === 'precision' ? 'precision · a wasted swipe costs a life' : 'fit the shape before the wall hits'); }
      requestAnimationFrame(wallTick);
    } else {
      say('match the target');
      requestAnimationFrame(rushTick);
    }
  }
  function updateHud() {
    if (!G) return;
    const m = G.mode;
    if (scoredWalls(m)) {
      setStats([['Score', fmt(G.score)], ['Combo', '×' + Math.min(Math.max(G.combo, 1), 10)], ['Lives', hearts(G.lives)]]);
      setBar(1 - G.p, G.p > .75);
      $('line').textContent = `Wall ${G.walls + (G.phase === 'approach' ? 1 : 0)} · min ${G.optimal}`;
      ['slow', 'shield', 'skip'].forEach(k => {
        const el = $('item-' + k);
        el.querySelector('b').textContent = G.items[k];
        el.disabled = !G.items[k] || k === 'shield';
        el.classList.toggle('has', G.items[k] > 0);
      });
    } else if (m === 'rush') {
      setStats([['Score', G.score], ['Perfect', G.perfect], ['Time', Math.ceil(G.time)]]);
      setBar(G.time / RUSH_TIME, G.time < 10);
      $('line').textContent = `Moves ${G.moves} · best possible ${G.optimal}`;
    } else if (m === 'zen') {
      setStats([['Matched', G.score], ['Perfect', G.perfect], ['Moves', G.moves]]);
      setBar(null);
      $('line').textContent = `Best possible ${G.optimal}`;
    }
  }

  function move(side) {
    if (!(side >= 0 && side < state.length)) return;
    if (G && (G.locked || G.paused)) return;
    if (G && G.wall && G.phase === 'approach' && G.wall.lock === side) {
      // A chained side doesn't move.
      fireEdge(side);
      audio.play('locked');
      haptic('fail');
      say('that side is locked', 'bad');
      return;
    }
    const before = G && G.target ? edgesBetween(state, G.target).length : 0;
    apply(state, side);
    mainView.set(state);
    fireEdge(side);
    audio.play('move', side);
    haptic('tap');
    if (!G) return;
    G.moves++;
    if (isWallMode(G.mode)) {
      // A swipe that takes the board further from the target is wasted.
      if (G.phase === 'approach' && edgesBetween(state, G.target).length > before) wastedSwipe();
      if (G) wallMove();
      return;
    }
    if (same(state, G.target)) roundWin();
    updateHud();
  }

  // ---------- Progress ----------
  function checkAchievements() {
    const fresh = newAchievements(save.achievements, save.stats, gatesBests());
    fresh.forEach(id => {
      save.achievements.push(id);
      const a = ACHIEVEMENTS.find(x => x.id === id);
      toast('Achievement', a.name);
      if (G) (G.newAch = G.newAch || []).push(a.name);
    });
    if (fresh.length) audio.play('unlock');
    persist();
  }
  function checkUnlocks() {
    const opened = WORLD_ORDER.filter(w => !save.unlocked.includes(w) && isUnlocked(w, gatesBests()));
    opened.forEach(w => { save.unlocked.push(w); toast('New world', `${world(w).name} unlocked`); });
    if (opened.length) audio.play('unlock');
    return opened;
  }
  function setResultButtons(main, alt) {
    $('resMain').textContent = main[0]; $('resMain').onclick = main[1];
    $('resAlt').textContent = alt[0]; $('resAlt').onclick = alt[1];
  }
  function finish() {
    const g = G;
    const st = save.stats;
    stopGame();
    st.seconds += Math.round((performance.now() - g.started) / 1000);
    const extra = [];
    let title, text;
    if (scoredWalls(g.mode)) {
      st.runs++;
      st.bestScore = Math.max(st.bestScore, g.score);
      const best = save.bests[g.world];
      let isBest = false;
      if (g.mode === 'gates' || g.mode === 'precision') {
        isBest = g.score > best[g.mode];
        if (isBest) best[g.mode] = g.score;
      }
      text = `${fmt(g.score)} points. ${g.cleared} wall${g.cleared === 1 ? '' : 's'} cleared, best combo ×${Math.min(g.bestCombo, 10)}.`;
      if (g.mode === 'daily') {
        if (!g.practice) {
          save.daily = { key: g.daily.key, score: g.score, world: g.world };
          st.dailyStreak = nextStreak(st.dailyLast, st.dailyStreak, g.daily.day);
          st.dailyLast = g.daily.day;
          title = 'Daily done.';
          text += ` Streak: ${st.dailyStreak} day${st.dailyStreak === 1 ? '' : 's'}. New walls tomorrow.`;
        } else {
          title = 'Practice over.';
          text += ` Today’s counted score: ${fmt(save.daily.score)}.`;
        }
      } else {
        title = isBest ? 'New best!' : 'Crashed out.';
        text += ` Best ${g.mode === 'precision' ? 'Precision ' : ''}in ${world(g.world).name}: ${fmt(best[g.mode])}.`;
      }
      checkUnlocks().forEach(w => extra.push(`${world(w).name} unlocked`));
      checkAchievements();
      setResultButtons(['Play again', () => startGame(g.mode)], ['Menu', goHome]);
    } else {
      const best = save.bests[g.world];
      const isBest = g.score > best.rush;
      if (isBest) best.rush = g.score;
      title = isBest ? 'New best!' : "Time's up.";
      text = `${g.score} shapes matched, ${g.perfect} of them in the fewest moves. Best: ${best.rush}.`;
      setResultButtons(['Play again', () => startGame('rush')], ['Menu', goHome]);
    }
    (g.newAch || []).forEach(a => extra.push(`Achievement: ${a}`));
    persist();
    $('resStars').hidden = true;
    $('resTitle').textContent = title;
    $('resText').textContent = text;
    const ul = $('resExtra');
    ul.innerHTML = '';
    extra.forEach(x => { const li = document.createElement('li'); li.textContent = x; ul.appendChild(li); });
    show('result');
    $('resMain').focus({ preventScroll: true });
  }
  function quit() {
    if (G && G.mode === 'zen') {
      const best = save.bests[G.world];
      if (G.score > best.zen) { best.zen = G.score; persist(); }
    }
    if (G && G.mode === 'tutorial') { settings.tutorialDone = true; saveSettings(); }
    goHome();
  }
  // Android back button and Esc: step back one screen; on the menu, leave the app.
  function back() {
    if (screen === 'paused') return quit();
    if (G) { if (timed(G.mode) && G.mode !== 'tutorial') pause(); else quit(); return; }
    if (screen !== 'home') return goHome();
    const app = plugin('App');
    if (app) app.exitApp();
  }

  // ---------- Menus ----------
  function renderHome() {
    document.querySelectorAll('.world').forEach(b => {
      const w = b.dataset.world, open = unlocked(w), u = UNLOCKS[w];
      b.setAttribute('aria-pressed', w === settings.world);
      b.classList.toggle('locked', !open);
      b.querySelector('em').textContent = open
        ? (save.bests[w].gates ? `best ${fmt(save.bests[w].gates)}` : 'new')
        : `${fmt(u.score)} in ${world(u.after).name}`;
    });
    const w = settings.world, best = save.bests[w];
    $('worldBlurb').textContent = world(w).blurb;
    $('bestGates').textContent = best.gates ? `Best ${fmt(best.gates)}` : 'New';
    $('bestPrecision').textContent = best.precision ? `Best ${fmt(best.precision)}` : 'New';
    $('bestRush').textContent = best.rush ? `Best ${best.rush}` : 'New';
    $('bestZen').textContent = best.zen ? `Best run ${best.zen}` : 'New';
    const d = dailyInfo(), played = save.daily.key === d.key, streak = save.stats.dailyLast >= d.day - 1 ? save.stats.dailyStreak : 0;
    $('dailyWorld').textContent = `Today: ${world(d.world).name}.`;
    $('bestDaily').textContent = (played ? `Done: ${fmt(save.daily.score)}` : 'Not played') + (streak ? ` · streak ${streak}` : '');
  }
  function goHome() {
    stopGame();
    if (mainView.world !== settings.world) setBoard(settings.world, initial(settings.world));
    renderHome();
    show('home');
    say(HINTS[settings.world]);
  }
  function chooseWorld(w) {
    if (!WORLDS[w]) return;
    if (!unlocked(w)) {
      const u = UNLOCKS[w];
      say(`score ${fmt(u.score)} in ${world(u.after).name} Gates to unlock ${world(w).name}`, 'bad');
      audio.play('locked');
      return;
    }
    settings.world = w; saveSettings();
    setBoard(w, initial(w));
    renderHome();
    say(HINTS[w]);
  }
  function openStats() {
    stopGame();
    const st = save.stats;
    const rows = [
      ['Runs', fmt(st.runs)], ['Walls cleared', fmt(st.walls)], ['Clean clears', fmt(st.clean)],
      ['Best score', fmt(st.bestScore)], ['Best run', `${st.bestRun} walls`], ['Best combo', `×${Math.min(st.bestCombo, 10)}`],
      ['Gold walls', fmt(st.gold)], ['Daily streak', `${st.dailyStreak} day${st.dailyStreak === 1 ? '' : 's'}`],
      ['Time played', `${Math.floor(st.seconds / 60)} min`],
    ];
    const grid = $('statGrid');
    grid.innerHTML = '';
    rows.forEach(([k, v]) => {
      const d = document.createElement('div');
      const s = document.createElement('span'); s.className = 'label'; s.textContent = k;
      const b = document.createElement('b'); b.textContent = v;
      d.append(s, b); grid.appendChild(d);
    });
    const list = $('achList');
    list.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
      const li = document.createElement('li');
      const done = save.achievements.includes(a.id);
      li.className = done ? 'done' : '';
      const b = document.createElement('b'); b.textContent = a.name;
      const s = document.createElement('span'); s.textContent = a.desc;
      li.append(b, s); list.appendChild(li);
    });
    $('achCount').textContent = `${save.achievements.length} / ${ACHIEVEMENTS.length}`;
    show('stats');
    say('your progress');
  }

  document.querySelectorAll('.world').forEach(b => {
    const w = b.dataset.world;
    b.prepend(miniBoard(w, initial(w), 'icon'));
    b.addEventListener('click', () => chooseWorld(w));
  });
  document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => {
    audio.ensure();
    const m = b.dataset.mode;
    if (m === 'gates' && !settings.tutorialDone) startGame('tutorial');
    else startGame(m);
  }));
  $('howTo').addEventListener('click', () => startGame('tutorial'));
  $('statsBtn').addEventListener('click', () => (screen === 'stats' ? goHome() : openStats()));
  document.querySelectorAll('[data-home]').forEach(b => b.addEventListener('click', goHome));
  $('quit').addEventListener('click', quit);
  $('tutSkip').addEventListener('click', quit);
  $('pause').addEventListener('click', pause);
  $('resume').addEventListener('click', resume);
  $('pausedQuit').addEventListener('click', quit);
  ['slow', 'skip'].forEach(k => $('item-' + k).addEventListener('click', () => useItem(k)));

  // ---------- Settings ----------
  function syncToggles() {
    [['soundBtn', 'sound', 'Sound'], ['musicBtn', 'music', 'Music'], ['vibeBtn', 'vibe', 'Vibration']].forEach(([id, key, name]) => {
      $(id).setAttribute('aria-pressed', settings[key]);
      $(id).setAttribute('aria-label', `${name} ${settings[key] ? 'on' : 'off'}`);
    });
  }
  $('soundBtn').addEventListener('click', () => {
    settings.sound = !settings.sound; saveSettings(); syncToggles();
    if (settings.sound) audio.play('match');
  });
  $('musicBtn').addEventListener('click', () => {
    settings.music = !settings.music; saveSettings(); syncToggles();
    if (!settings.music) audio.stopMusic();
    else if (G && isWallMode(G.mode) && G.mode !== 'tutorial' && !G.paused) audio.startMusic();
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
  let down = null;
  stageEl.addEventListener('pointerdown', e => {
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
  // pointing at a side works it too (also W A S D). Q / E use slow motion / skip. Esc steps back.
  const SQUARE_KEYS = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('.edge') && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key.toLowerCase();
    if (/^[1-6]$/.test(k)) { e.preventDefault(); move(Number(k) - 1); }
    else if (mainView.world === 'square' && k in SQUARE_KEYS) { e.preventDefault(); move(SQUARE_KEYS[k]); }
    else if (k === 'q') useItem('slow');
    else if (k === 'e') useItem('skip');
    else if (e.key === 'Escape') back();
  });

  // ---------- App life cycle ----------
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); audio.stopMusic(); audio.suspend(); }
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
