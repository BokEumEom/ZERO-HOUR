// Scoreyard — WebAudio synthesized SFX (zero asset files)
(function () {
  const SY = (window.SY = window.SY || {});

  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function env(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone(type, f0, f1, dur, peak, when, bend) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) {
      if (bend === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    }
    env(g, t0, peak, 0.005, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, peak, when, filterFreq, q) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + (when || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq || 800;
    f.Q.value = q || 1;
    const g = ctx.createGain();
    env(g, t0, peak, 0.004, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  SY.audio = {
    setMuted(m) { muted = !!m; },
    isMuted() { return muted; },
    unlock() { ensure(); },

    // light pew — kept very quiet, fires constantly
    shoot() { tone('square', 880, 220, 0.07, 0.045, 0, 'exp'); },

    // crystal pickup; pitch rises with combo
    collect(combo) {
      const base = 520 + Math.min(combo, 24) * 36;
      tone('sine', base, base * 1.5, 0.09, 0.16, 0, 'lin');
      tone('sine', base * 2, base * 2.4, 0.07, 0.07, 0.02, 'lin');
    },

    powerup() {
      tone('triangle', 392, 392, 0.07, 0.18);
      tone('triangle', 523, 523, 0.07, 0.18, 0.07);
      tone('triangle', 784, 784, 0.12, 0.2, 0.14);
    },

    hit() {
      noise(0.22, 0.4, 0, 240, 0.8);
      tone('sawtooth', 180, 50, 0.25, 0.3, 0, 'exp');
    },

    shieldPop() {
      tone('sine', 700, 180, 0.18, 0.25, 0, 'exp');
      noise(0.12, 0.18, 0, 1400, 2);
    },

    explode() {
      noise(0.3, 0.32, 0, 500, 0.7);
      tone('triangle', 220, 60, 0.28, 0.22, 0, 'exp');
    },

    bossHit() { tone('square', 140, 90, 0.08, 0.14, 0, 'exp'); noise(0.05, 0.1, 0, 2000, 3); },

    bossSpawn() {
      tone('sawtooth', 60, 110, 0.7, 0.3, 0, 'lin');
      tone('sawtooth', 90, 165, 0.7, 0.2, 0.1, 'lin');
      noise(0.6, 0.12, 0, 300, 0.6);
    },

    bossDown() {
      noise(0.7, 0.4, 0, 400, 0.5);
      tone('triangle', 400, 50, 0.6, 0.3, 0, 'exp');
      [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.12, 0.16, 0.25 + i * 0.09));
    },

    newBest() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.14, 0.18, i * 0.11));
      noise(0.5, 0.1, 0.4, 3000, 2);
    },

    start() {
      tone('square', 330, 330, 0.09, 0.15);
      tone('square', 440, 440, 0.09, 0.15, 0.1);
      tone('square', 660, 660, 0.16, 0.18, 0.2);
    },

    countTick() { tone('square', 1100, 1100, 0.05, 0.1); },

    timeWarn() { tone('square', 980, 980, 0.06, 0.12); },

    gameOver() {
      tone('sawtooth', 220, 110, 0.4, 0.2, 0, 'exp');
      tone('sawtooth', 165, 82, 0.5, 0.18, 0.15, 'exp');
    },
  };
})();
