// Carreau board drawing: one SVG per board, pieces that spring to new sizes, and the Gates wall.
(function (root) {
  const { world, clone, vertices, piecePolygon } = root.CarreauCore;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const SQUARE_SIDE_NAMES = ['Top', 'Right', 'Bottom', 'Left'];
  const reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const pts = poly => poly.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(' ');
  const pathOf = poly => 'M' + poly.map(p => p[0].toFixed(3) + ' ' + p[1].toFixed(3)).join('L') + 'Z';

  class BoardView {
    constructor(svg, opts) { this.svg = svg; this.opts = opts || {}; this.raf = 0; }

    setWorld(worldId, state) {
      const svg = this.svg, n = world(worldId).sides, main = !!this.opts.arrows;
      this.world = worldId;
      svg.innerHTML = '';
      const verts = this.verts = vertices(worldId);
      this.R = Math.hypot(verts[0][0], verts[0][1]);
      const xs = verts.map(v => v[0]), ys = verts.map(v => v[1]);
      const pad = main ? 1.75 : .3;
      const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
      const size = Math.max(maxX - minX, maxY - minY), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      svg.setAttribute('viewBox', `${(cx - size / 2).toFixed(3)} ${(cy - size / 2).toFixed(3)} ${size.toFixed(3)} ${size.toFixed(3)}`);
      svgEl('polygon', { class: 'outline', points: pts(verts) }, svg);
      if (main) {
        // Gates: a wall with holes in the target's shape, drawn under the pieces.
        this.wallG = svgEl('g', { class: 'wall', visibility: 'hidden' }, svg);
        this.wallPanel = svgEl('path', { class: 'panel', 'fill-rule': 'evenodd' }, this.wallG);
        this.wallHoles = svgEl('path', { class: 'holes' }, this.wallG);
        this.wallBadge = svgEl('text', { class: 'badge', x: 0, y: .25, 'text-anchor': 'middle' }, this.wallG);
        this.lockLine = svgEl('line', { class: 'lockline', visibility: 'hidden' }, svg);
      }
      this.pieces = verts.map(() => svgEl('polygon', { class: 'piece' }, svg));
      this.edges = [];
      if (main) {
        this.guide = svgEl('path', { class: 'guide', visibility: 'hidden' }, svg);
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
        this.fx = svgEl('g', { class: 'fx' }, svg);
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
    draw() {
      this.pieces.forEach((p, i) => p.setAttribute('points', pts(piecePolygon(this.verts, i, this.cur[i][0], this.cur[i][1]))));
    }

    // ---------- Gates wall ----------
    setWall(target, kind, badge) {
      if (!this.wallG) return;
      if (!target) {
        this.wallG.setAttribute('visibility', 'hidden');
        this.setLock(null);
        this.setGuide(null);
        return;
      }
      const k = (this.R + .75) / this.R;
      const holes = target.map(([a, b], i) => pathOf(piecePolygon(this.verts, i, a, b))).join('');
      this.holesPath = holes;
      this.outerPath = pathOf(this.verts.map(([x, y]) => [x * k, y * k]));
      this.wallPanel.setAttribute('d', this.outerPath + holes);
      this.wallHoles.setAttribute('d', holes);
      this.wallBadge.textContent = badge || '';
      this.kind = kind || 'normal';
      this.wallG.setAttribute('class', 'wall ' + this.kind);
      this.wallG.setAttribute('visibility', 'visible');
    }
    // Blink walls close their holes: the panel goes solid until the wall arrives.
    showHoles(on) {
      if (!this.wallG) return;
      this.wallPanel.setAttribute('d', this.outerPath + (on ? this.holesPath : ''));
      this.wallHoles.setAttribute('visibility', on ? 'visible' : 'hidden');
    }
    setWallView(scale, opacity, state) {
      if (!this.wallG) return;
      this.wallG.setAttribute('transform', `scale(${scale.toFixed(4)})`);
      this.wallG.style.opacity = opacity.toFixed(3);
      this.wallG.setAttribute('class', `wall ${this.kind || 'normal'} ${state || ''}`);
    }
    // Outline in green each piece that already fits its hole.
    markFit(target) {
      this.pieces.forEach((p, i) => p.classList.toggle('fit', !!target && target[i][0] === this.target[i][0] && target[i][1] === this.target[i][1]));
    }
    // Locked walls chain one side: its arrows grey out and the side is drawn as a chain.
    setLock(side) {
      if (!this.lockLine) return;
      this.edges.forEach((g, s) => g.classList.toggle('locked', s === side));
      if (side == null) { this.lockLine.setAttribute('visibility', 'hidden'); return; }
      const A = this.verts[side], B = this.verts[(side + 1) % this.verts.length];
      Object.entries({ x1: A[0], y1: A[1], x2: B[0], y2: B[1] }).forEach(([k, v]) => this.lockLine.setAttribute(k, v.toFixed(3)));
      this.lockLine.setAttribute('visibility', 'visible');
    }
    // Tutorial: an animated arrow along a side, on that side's half of the board.
    setGuide(side) {
      if (!this.guide) return;
      this.edges.forEach((g, s) => g.classList.toggle('hint', s === side));
      if (side == null) { this.guide.setAttribute('visibility', 'hidden'); return; }
      const n = this.verts.length, A = this.verts[side], B = this.verts[(side + 1) % n];
      const f = .55, a = [A[0] * f, A[1] * f], b = [B[0] * f, B[1] * f];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const head = [b[0] - ux * .45 + uy * .3, b[1] - uy * .45 - ux * .3, b[0] - ux * .45 - uy * .3, b[1] - uy * .45 + ux * .3];
      this.guide.setAttribute('d', `M${a[0].toFixed(3)} ${a[1].toFixed(3)}L${b[0].toFixed(3)} ${b[1].toFixed(3)}M${head[0].toFixed(3)} ${head[1].toFixed(3)}L${b[0].toFixed(3)} ${b[1].toFixed(3)}L${head[2].toFixed(3)} ${head[3].toFixed(3)}`);
      this.guide.setAttribute('visibility', 'visible');
    }
    // The wall bursts into shards that fly outward and fade.
    shatter(cls) {
      if (!this.fx || reduceMotion) return;
      const k = (this.R + .4) / this.R, n = this.verts.length, shards = [];
      for (let i = 0; i < 22; i++) {
        const s = i % n, A = this.verts[s], B = this.verts[(s + 1) % n], t = Math.random();
        const x = (A[0] + (B[0] - A[0]) * t) * k, y = (A[1] + (B[1] - A[1]) * t) * k;
        const d = Math.hypot(x, y), sp = 3 + Math.random() * 5, r = .2 + Math.random() * .35;
        const el = svgEl('polygon', { class: 'shard ' + (cls || ''), points: `0,${-r} ${r * .9},${r * .6} ${-r * .8},${r * .5}` }, this.fx);
        shards.push({ el, x, y, vx: x / d * sp + (Math.random() - .5) * 2, vy: y / d * sp + (Math.random() - .5) * 2, rot: Math.random() * 360, vr: (Math.random() - .5) * 720 });
      }
      const start = performance.now();
      let last = start;
      const frame = t => {
        const dt = Math.min(.05, (t - last) / 1000), age = (t - start) / 650;
        last = t;
        shards.forEach(p => {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt; p.rot += p.vr * dt;
          p.el.setAttribute('transform', `translate(${p.x.toFixed(3)} ${p.y.toFixed(3)}) rotate(${p.rot.toFixed(1)})`);
          p.el.style.opacity = Math.max(0, 1 - age).toFixed(3);
        });
        if (age < 1) requestAnimationFrame(frame); else shards.forEach(p => p.el.remove());
      };
      requestAnimationFrame(frame);
    }
  }

  function miniBoard(worldId, s, cls) {
    const wrap = document.createElement('div');
    wrap.className = 'mini ' + (cls || '');
    const svg = svgEl('svg', { class: 'board', 'aria-hidden': 'true' }, wrap);
    new BoardView(svg).setWorld(worldId, s);
    return wrap;
  }

  root.CarreauBoard = { BoardView, miniBoard, svgEl };
})(typeof self !== 'undefined' ? self : this);
