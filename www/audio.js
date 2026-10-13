// Carreau sound: synthesized effects and a small generative music loop. No audio files.
(function (root) {
  root.CarreauAudio = function createAudio(settings) {
    const a = {
      ctx: null,
      context() {
        try {
          if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
            this.out = this.ctx.createGain();      // effects
            this.out.gain.value = .6;
            this.out.connect(this.ctx.destination);
            this.musicOut = this.ctx.createGain(); // music, kept under the effects
            this.musicOut.gain.value = .45;
            this.musicOut.connect(this.ctx.destination);
          }
          if (this.ctx.state === 'suspended') this.ctx.resume();
          return this.ctx;
        } catch (e) { return null; }
      },
      ensure() { return settings.sound ? this.context() : null; },
      suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) {} },

      tone(f, at, dur, type, vol, dest) {
        const c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(f, at);
        g.gain.setValueAtTime(.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + .012);
        g.gain.exponentialRampToValueAtTime(.0001, at + dur);
        o.connect(g); g.connect(dest || this.out);
        o.start(at); o.stop(at + dur + .05);
      },
      noise(at, dur, f0, f1, vol, dest) {
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
        src.connect(f); f.connect(g); g.connect(dest || this.out);
        src.start(at); src.stop(at + dur + .05);
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
          case 'tick': this.tone(1200, t, .04, 'square', .035); break;
          // Gates: the chime climbs a semitone with every wall in the combo.
          case 'pass': {
            const up = Math.pow(2, Math.min(arg || 1, 12) / 12);
            arp([523.25, 659.25, 783.99].map(f => f * up), .045, .2, 'sine', .14);
            this.noise(t, .35, 400, 2600, .22);
            break;
          }
          case 'gold': arp([783.99, 987.77, 1174.66, 1567.98, 1975.53], .04, .3, 'triangle', .1); this.noise(t, .4, 600, 3200, .2); break;
          case 'crash': this.noise(t, .5, 900, 110, .4); this.tone(98, t, .32, 'square', .06); break;
          case 'shatter': this.noise(t, .3, 2400, 500, .25); arp([880, 660], .05, .12, 'triangle', .06); break;
          case 'locked': this.tone(140, t, .08, 'square', .05); this.tone(120, t + .07, .1, 'square', .05); break;
          case 'item': arp([659.25, 987.77, 1318.5], .06, .18, 'triangle', .1); break;
          case 'slow': this.tone(600, t, .5, 'sine', .08); this.tone(300, t + .05, .6, 'sine', .06); break;
          case 'blink': this.tone(1318.5, t, .08, 'sine', .06); this.tone(987.77, t + .08, .12, 'sine', .05); break;
          case 'unlock': arp([392, 523.25, 659.25, 783.99, 1046.5], .09, .45, 'triangle', .12); break;
        }
      },

      // ---------- Music ----------
      // Eight-step bars over a four-chord loop; busier and faster as `level` rises.
      m: { timer: null, step: 0, next: 0, bpm: 96, level: 0 },
      startMusic() {
        if (!settings.music || this.m.timer) return;
        const c = this.context();
        if (!c) return;
        this.m.step = 0;
        this.m.next = c.currentTime + .08;
        this.m.timer = setInterval(() => this.schedule(), 50);
      },
      stopMusic() { clearInterval(this.m.timer); this.m.timer = null; },
      setIntensity(level) {
        this.m.level = level;
        this.m.bpm = 96 + Math.min(64, level * 2);
      },
      schedule() {
        const c = this.ctx;
        if (!c || !settings.music) return this.stopMusic();
        while (this.m.next < c.currentTime + .15) {
          this.note(this.m.step, this.m.next);
          this.m.next += 60 / this.m.bpm / 2;
          this.m.step++;
        }
      },
      note(step, t) {
        const roots = [130.81, 110, 87.31, 98]; // C, A, F, G
        const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
        const bar = Math.floor(step / 8) % 4, beat = step % 8, root = roots[bar], lvl = this.m.level, out = this.musicOut;
        if (beat % 4 === 0) this.tone(root, t, .4, 'triangle', .09, out);
        if (beat === 6 && lvl >= 10) this.tone(root * 1.5, t, .2, 'triangle', .05, out);
        if (beat % 2 === 1 || lvl >= 6) {
          const f = root * 2 * scale[(step * 3 + bar * 2) % scale.length];
          this.tone(f, t, .14, 'sine', .04, out);
        }
        if (lvl >= 3 && beat % 2 === 0) this.noise(t, .05, 7000, 9000, .03, out);
      },
    };
    return a;
  };
})(typeof self !== 'undefined' ? self : this);
