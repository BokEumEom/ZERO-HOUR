// Scoreyard — core game engine (state + simulation). Rendering lives in render.js.
(function () {
  const SY = (window.SY = window.SY || {});

  const W = 960, H = 600;
  const POWER_TYPES = ['MAGNET', 'SHIELD', 'SLOW', 'X2', 'BOOST', 'SPREAD', 'TIME'];

  const POWER_META = {
    MAGNET: { glyph: 'M',  color: '#2de2c6', label: 'MAGNET' },
    SHIELD: { glyph: 'S',  color: '#5aa7ff', label: 'SHIELD' },
    SLOW:   { glyph: 'T',  color: '#b48bff', label: 'SLOW-MO' },
    X2:     { glyph: '×2', color: '#ffc34d', label: '×2 SCORE' },
    BOOST:  { glyph: '»',  color: '#7dff8a', label: 'BOOST' },
    SPREAD: { glyph: 'Ψ',  color: '#ff9a5a', label: 'SPREAD' },
    TIME:   { glyph: '+5', color: '#eaf6ff', label: '+5 SEC' },
  };

  // tweakable knobs (written by tweaks UI)
  SY.tweaks = SY.tweaks || { duration: 75, spawnRate: 1.0, particles: 1.0, shake: 1.0 };
  SY.input = { ax: 0, ay: 0 }; // touch joystick axis, merged with keyboard

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  function resetKeys() { for (const k in keys) keys[k] = false; }

  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  const G = {
    W, H, POWER_META,
    phase: 'menu', // menu | ready | playing | paused | over
    mode: 'daily',
    state: null,
    events: {}, // onGameOver(res), onReadySound...
  };
  SY.game = G;

  function freshState(mode, seedStr) {
    const rng = SY.makeRng(seedStr);
    const duration = Math.round(SY.tweaks.duration);
    return {
      rng, seedStr, mode, duration,
      t: 0,                       // elapsed sim time
      timeLeft: duration,
      readyT: 1.4,
      score: 0, combo: 0, maxCombo: 0, comboT: 0,
      pace: [0], paceSec: 0,
      player: { x: W / 2, y: H * 0.68, vx: 0, vy: 0, r: 13, hp: 3, inv: 0, fireCd: 0, angle: -Math.PI / 2, thrust: 0 },
      crystals: [], rocks: [], mines: [], bullets: [], ebullets: [], pows: [],
      parts: [], waves: [], floats: [],
      boss: null, bossDown: false, bossWarnT: 0,
      fx: { MAGNET: 0, SLOW: 0, X2: 0, BOOST: 0, SPREAD: 0 },
      shield: false,
      freeze: 0, shake: 0,
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6 },
      powBag: [],
      lastWholeSec: duration,
      collected: 0,
      breakdown: { crystals: 0, combo: 0, destruction: 0, boss: 0 },
    };
  }

  function nextPowType(s) {
    if (s.powBag.length === 0) {
      const bag = POWER_TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(s.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      s.powBag = bag;
    }
    return s.powBag.pop();
  }

  // ---------- spawning ----------
  function spawnCrystalCluster(s) {
    const cx = 70 + s.rng() * (W - 140);
    const cy = 70 + s.rng() * (H - 140);
    const n = 4 + Math.floor(s.rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = s.rng() * Math.PI * 2, d = s.rng() * 52;
      s.crystals.push({
        x: Math.min(W - 20, Math.max(20, cx + Math.cos(a) * d)),
        y: Math.min(H - 20, Math.max(20, cy + Math.sin(a) * d)),
        vx: 0, vy: 0, r: 7, phase: s.rng() * Math.PI * 2,
      });
    }
  }

  function spawnRock(s) {
    s.rocks.push({
      x: 90 + s.rng() * (W - 180),
      y: 80 + s.rng() * (H - 200),
      r: 22, hp: 3, maxHp: 3, rot: s.rng() * Math.PI * 2,
      spin: (s.rng() - 0.5) * 0.8, flash: 0,
    });
  }

  function spawnMine(s) {
    const edge = Math.floor(s.rng() * 4);
    let x, y;
    if (edge === 0) { x = s.rng() * W; y = -20; }
    else if (edge === 1) { x = W + 20; y = s.rng() * H; }
    else if (edge === 2) { x = s.rng() * W; y = H + 20; }
    else { x = -20; y = s.rng() * H; }
    s.mines.push({ x, y, r: 11, hp: 1, speed: 62 + s.t * 1.1, phase: s.rng() * Math.PI * 2, flash: 0 });
  }

  function spawnPow(s, x, y) {
    const type = nextPowType(s);
    s.pows.push({
      x: x !== undefined ? x : 80 + s.rng() * (W - 160),
      y: y !== undefined ? y : 80 + s.rng() * (H - 160),
      type, r: 12, life: 9, phase: s.rng() * Math.PI * 2, vy: -30,
    });
  }

  function spawnBoss(s) {
    s.boss = {
      x: W / 2, y: -90, ty: 128, r: 46, hp: 72, maxHp: 72,
      t: 0, burstT: 1.8, aimT: 2.6, flash: 0, dying: 0, ringRot: 0,
    };
    s.bossWarnT = 1.6;
    s.shake = Math.max(s.shake, 7);
    SY.audio.bossSpawn();
  }

  // ---------- fx helpers ----------
  function burst(s, x, y, color, n, speed, size) {
    const cnt = Math.round(n * SY.tweaks.particles);
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      s.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
        color, size: size * (0.5 + Math.random() * 0.8),
      });
    }
  }
  function wave(s, x, y, maxR, color) {
    s.waves.push({ x, y, r: 6, maxR, life: 1, color });
  }
  function floatText(s, x, y, text, color) {
    s.floats.push({ x, y, text, color, life: 1 });
  }
  function addScore(s, base, x, y, label, bucket) {
    const mul = s.fx.X2 > 0 ? 2 : 1;
    const v = base * mul;
    s.score += v;
    if (bucket === 'crystal') {
      // base is 10 + combo: split the combo part into its own bucket
      s.breakdown.crystals += 10 * mul;
      s.breakdown.combo += (base - 10) * mul;
    } else if (bucket === 'destroy') {
      s.breakdown.destruction += v;
    } else if (bucket === 'boss') {
      s.breakdown.boss += v;
    }
    if (x !== undefined) floatText(s, x, y, '+' + v + (label ? ' ' + label : ''), mul === 2 ? '#ffc34d' : '#9ff5e8');
  }

  // ---------- player damage ----------
  function hurtPlayer(s, x, y) {
    const p = s.player;
    if (p.inv > 0) return;
    if (s.shield) {
      s.shield = false;
      p.inv = 1.0;
      wave(s, p.x, p.y, 90, '#5aa7ff');
      burst(s, p.x, p.y, '#5aa7ff', 18, 220, 3);
      SY.audio.shieldPop();
      s.freeze = Math.max(s.freeze, 0.09);
      s.shake = Math.max(s.shake, 5);
      return;
    }
    p.hp -= 1;
    p.inv = 1.5;
    s.combo = 0; s.comboT = 0;
    s.freeze = Math.max(s.freeze, 0.18);
    s.shake = Math.max(s.shake, 11);
    wave(s, x, y, 70, '#ff5a78');
    burst(s, p.x, p.y, '#ff5a78', 26, 260, 3.5);
    SY.audio.hit();
    if (p.hp <= 0) endGame(s, 'down');
  }

  // ---------- boss ----------
  function updateBoss(s, dt, slowMul) {
    const b = s.boss;
    b.t += dt;
    b.ringRot += dt * 0.9;
    if (b.flash > 0) b.flash -= dt;

    if (b.dying > 0) {
      b.dying -= dt;
      if (Math.random() < 0.4) burst(s, b.x + (Math.random() - 0.5) * 70, b.y + (Math.random() - 0.5) * 70, '#ffc34d', 6, 200, 3);
      if (b.dying <= 0) {
        // final detonation
        wave(s, b.x, b.y, 320, '#ffc34d');
        wave(s, b.x, b.y, 220, '#2de2c6');
        burst(s, b.x, b.y, '#ffc34d', 60, 420, 4);
        burst(s, b.x, b.y, '#eaf6ff', 40, 320, 2.5);
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 70;
          s.crystals.push({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 7, phase: Math.random() * 6 });
        }
        addScore(s, 1500, b.x, b.y, 'CORE WARDEN', 'boss');
        s.bossDown = true;
        s.boss = null;
        s.freeze = Math.max(s.freeze, 0.32);
        s.shake = Math.max(s.shake, 16);
        SY.audio.bossDown();
      }
      return;
    }

    // entrance
    if (b.y < b.ty) { b.y += dt * 90; if (b.y > b.ty) b.y = b.ty; return; }
    // sway
    b.x = W / 2 + Math.sin(b.t * 0.55) * (W * 0.27);
    b.y = b.ty + Math.sin(b.t * 1.1) * 16;

    // radial burst
    b.burstT -= dt * slowMul;
    if (b.burstT <= 0) {
      b.burstT = 2.4;
      const n = 10, off = b.t;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        s.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 6 });
      }
      wave(s, b.x, b.y, 70, '#ff5a78');
    }
    // aimed volley
    b.aimT -= dt * slowMul;
    if (b.aimT <= 0) {
      b.aimT = 1.7;
      const p = s.player;
      const base = Math.atan2(p.y - b.y, p.x - b.x);
      for (let k = -1; k <= 1; k++) {
        const a = base + k * 0.16;
        s.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 235, vy: Math.sin(a) * 235, r: 5 });
      }
    }
    // contact damage
    if (dist2(b, s.player) < (b.r + s.player.r) * (b.r + s.player.r)) hurtPlayer(s, s.player.x, s.player.y);
  }

  // ---------- end ----------
  function endGame(s, reason) {
    if (G.phase === 'over') return;
    G.phase = 'over';
    // snapshot final pace point
    s.pace.push(s.score);
    const res = {
      mode: s.mode, score: s.score, maxCombo: s.maxCombo,
      bossDown: s.bossDown, reason, pace: s.pace.slice(),
      collected: s.collected, duration: s.duration,
      breakdown: { ...s.breakdown },
    };
    SY.audio.gameOver();
    if (G.events.onGameOver) G.events.onGameOver(res);
  }

  // ---------- main update ----------
  function update(dt) {
    const s = G.state;
    if (!s) return;

    if (G.phase === 'paused') return; // sim + cosmetics fully frozen

    if (G.phase === 'ready') {
      s.readyT -= dt;
      if (s.readyT <= 0) { G.phase = 'playing'; SY.audio.start(); }
      return;
    }
    if (G.phase !== 'playing') {
      // keep ambient particles drifting on the over screen
      stepCosmetics(s, dt);
      return;
    }

    // hitstop
    if (s.freeze > 0) { s.freeze -= dt; stepCosmeticsLight(s, dt); return; }

    s.t += dt;
    s.timeLeft -= dt;
    const slowMul = s.fx.SLOW > 0 ? 0.42 : 1;

    // per-second bookkeeping: pace + time warning
    const whole = Math.ceil(s.timeLeft);
    if (whole !== s.lastWholeSec) {
      s.lastWholeSec = whole;
      s.pace.push(s.score);
      if (whole <= 5 && whole > 0) SY.audio.timeWarn();
    }
    if (s.timeLeft <= 0) { s.timeLeft = 0; endGame(s, 'time'); return; }

    // boss trigger at last 20s (only if round is long enough)
    if (!s.boss && !s.bossDown && s.duration >= 40 && s.timeLeft <= 20) spawnBoss(s);
    if (s.bossWarnT > 0) s.bossWarnT -= dt;

    // effect timers
    for (const k in s.fx) if (s.fx[k] > 0) s.fx[k] -= dt;
    if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 0; }

    // ---------- player ----------
    const p = s.player;
    let ax = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + SY.input.ax;
    let ay = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + SY.input.ay;
    const alen = Math.hypot(ax, ay);
    if (alen > 1) { ax /= alen; ay /= alen; }
    const speed = 265 * (s.fx.BOOST > 0 ? 1.5 : 1);
    p.vx += (ax * speed - p.vx) * Math.min(1, dt * 12);
    p.vy += (ay * speed - p.vy) * Math.min(1, dt * 12);
    p.x = Math.min(W - 16, Math.max(16, p.x + p.vx * dt));
    p.y = Math.min(H - 16, Math.max(16, p.y + p.vy * dt));
    p.thrust = Math.min(1, Math.hypot(p.vx, p.vy) / speed);
    if (Math.hypot(p.vx, p.vy) > 30) p.angle = Math.atan2(p.vy, p.vx);
    if (p.inv > 0) p.inv -= dt;
    // engine trail
    if (p.thrust > 0.25 && Math.random() < 0.7 * SY.tweaks.particles) {
      s.parts.push({
        x: p.x - Math.cos(p.angle) * 14, y: p.y - Math.sin(p.angle) * 14,
        vx: -Math.cos(p.angle) * 60 + (Math.random() - 0.5) * 30,
        vy: -Math.sin(p.angle) * 60 + (Math.random() - 0.5) * 30,
        life: 0.3, maxLife: 0.3, color: s.fx.BOOST > 0 ? '#7dff8a' : '#1b9e8c', size: 2.4,
      });
    }

    // ---------- auto-fire ----------
    p.fireCd -= dt;
    if (p.fireCd <= 0) {
      let target = null, best = 380 * 380;
      const cand = [];
      if (s.boss && s.boss.dying <= 0 && s.boss.y > 0) cand.push(s.boss);
      for (const m of s.mines) cand.push(m);
      for (const r of s.rocks) cand.push(r);
      for (const c of cand) { const d = dist2(c, p); if (d < best) { best = d; target = c; } }
      if (target) {
        p.fireCd = 0.19;
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        const angles = s.fx.SPREAD > 0 ? [a - 0.22, a, a + 0.22] : [a];
        for (const an of angles) {
          s.bullets.push({ x: p.x + Math.cos(an) * 16, y: p.y + Math.sin(an) * 16, vx: Math.cos(an) * 520, vy: Math.sin(an) * 520, life: 0.85 });
        }
        SY.audio.shoot();
      } else p.fireCd = 0.06;
    }

    // ---------- spawning ----------
    s.spawnT.crystal -= dt;
    if (s.spawnT.crystal <= 0) { s.spawnT.crystal = 1.55; if (s.crystals.length < 36) spawnCrystalCluster(s); }
    s.spawnT.rock -= dt;
    if (s.spawnT.rock <= 0) { s.spawnT.rock = 5; if (s.rocks.length < 4) spawnRock(s); }
    s.spawnT.mine -= dt;
    if (s.spawnT.mine <= 0) {
      const ramp = Math.max(0.45, 1 - s.t * 0.007);
      s.spawnT.mine = (2.7 * ramp) / Math.max(0.2, SY.tweaks.spawnRate);
      if (s.mines.length < 12) spawnMine(s);
    }
    s.spawnT.pow -= dt;
    if (s.spawnT.pow <= 0) { s.spawnT.pow = 9.5; if (s.pows.length < 3) spawnPow(s); }

    // ---------- crystals ----------
    const magnetR = s.fx.MAGNET > 0 ? 215 : 0;
    for (let i = s.crystals.length - 1; i >= 0; i--) {
      const c = s.crystals[i];
      c.phase += dt * 3;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= Math.pow(0.05, dt); c.vy *= Math.pow(0.05, dt);
      c.x = Math.min(W - 10, Math.max(10, c.x)); c.y = Math.min(H - 10, Math.max(10, c.y));
      const d = Math.sqrt(dist2(c, p)) || 1;
      if (magnetR && d < magnetR) {
        const pull = 900 * (1 - d / magnetR) + 150;
        c.vx += ((p.x - c.x) / d) * pull * dt;
        c.vy += ((p.y - c.y) / d) * pull * dt;
      }
      if (d < p.r + c.r + 6) {
        s.crystals.splice(i, 1);
        s.combo += 1; s.comboT = 2.6;
        s.maxCombo = Math.max(s.maxCombo, s.combo);
        s.collected += 1;
        addScore(s, 10 + s.combo, c.x, c.y, undefined, 'crystal');
        burst(s, c.x, c.y, '#2de2c6', 7, 150, 2.2);
        SY.audio.collect(s.combo);
      }
    }

    // ---------- rocks ----------
    for (const r of s.rocks) { r.rot += r.spin * dt; if (r.flash > 0) r.flash -= dt; }

    // ---------- mines ----------
    for (let i = s.mines.length - 1; i >= 0; i--) {
      const m = s.mines[i];
      m.phase += dt * 5;
      if (m.flash > 0) m.flash -= dt;
      const d = Math.sqrt(dist2(m, p)) || 1;
      m.x += ((p.x - m.x) / d) * m.speed * slowMul * dt;
      m.y += ((p.y - m.y) / d) * m.speed * slowMul * dt;
      if (d < m.r + p.r) {
        s.mines.splice(i, 1);
        burst(s, m.x, m.y, '#ff5a78', 14, 200, 3);
        hurtPlayer(s, m.x, m.y);
        if (G.phase !== 'playing') return;
      }
    }

    // ---------- bullets vs things ----------
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10;
      if (!dead && s.boss && s.boss.dying <= 0 && dist2(b, s.boss) < (s.boss.r + 4) * (s.boss.r + 4)) {
        s.boss.hp -= 1; s.boss.flash = 0.08;
        addScore(s, 5, undefined, undefined, undefined, 'boss');
        burst(s, b.x, b.y, '#ffc34d', 4, 120, 2);
        s.freeze = Math.max(s.freeze, 0.016);
        SY.audio.bossHit();
        if (s.boss.hp <= 0) { s.boss.dying = 0.9; s.freeze = 0.12; s.shake = Math.max(s.shake, 8); }
        dead = true;
      }
      if (!dead) for (let j = s.mines.length - 1; j >= 0; j--) {
        const m = s.mines[j];
        if (dist2(b, m) < (m.r + 4) * (m.r + 4)) {
          m.hp -= 1; m.flash = 0.06; dead = true;
          if (m.hp <= 0) {
            s.mines.splice(j, 1);
            addScore(s, 25, m.x, m.y, undefined, 'destroy');
            burst(s, m.x, m.y, '#ff9a5a', 12, 190, 2.6);
            wave(s, m.x, m.y, 40, '#ff9a5a');
            SY.audio.explode();
          }
          break;
        }
      }
      if (!dead) for (let j = s.rocks.length - 1; j >= 0; j--) {
        const r = s.rocks[j];
        if (dist2(b, r) < (r.r + 4) * (r.r + 4)) {
          r.hp -= 1; r.flash = 0.07; dead = true;
          burst(s, b.x, b.y, '#9ff5e8', 4, 110, 2);
          if (r.hp <= 0) {
            s.rocks.splice(j, 1);
            addScore(s, 40, r.x, r.y, undefined, 'destroy');
            burst(s, r.x, r.y, '#2de2c6', 18, 220, 3);
            wave(s, r.x, r.y, 60, '#2de2c6');
            SY.audio.explode();
            const drops = 4 + Math.floor(s.rng() * 2);
            for (let k = 0; k < drops; k++) {
              const a = s.rng() * Math.PI * 2;
              s.crystals.push({ x: r.x, y: r.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, r: 7, phase: s.rng() * 6 });
            }
            if (s.rng() < 0.45) spawnPow(s, r.x, r.y);
          }
          break;
        }
      }
      if (dead) s.bullets.splice(i, 1);
    }

    // ---------- enemy bullets ----------
    for (let i = s.ebullets.length - 1; i >= 0; i--) {
      const b = s.ebullets[i];
      b.x += b.vx * slowMul * dt; b.y += b.vy * slowMul * dt;
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { s.ebullets.splice(i, 1); continue; }
      if (dist2(b, p) < (b.r + p.r - 2) * (b.r + p.r - 2)) {
        s.ebullets.splice(i, 1);
        hurtPlayer(s, b.x, b.y);
        if (G.phase !== 'playing') return;
      }
    }

    // ---------- powerups ----------
    for (let i = s.pows.length - 1; i >= 0; i--) {
      const o = s.pows[i];
      o.phase += dt * 2.4; o.life -= dt;
      o.vy *= Math.pow(0.1, dt); o.y += o.vy * dt;
      if (o.life <= 0) { s.pows.splice(i, 1); continue; }
      if (dist2(o, p) < (o.r + p.r + 4) * (o.r + p.r + 4)) {
        s.pows.splice(i, 1);
        applyPow(s, o);
      }
    }

    // ---------- boss ----------
    if (s.boss) updateBoss(s, dt, slowMul);

    stepCosmetics(s, dt);
  }

  function applyPow(s, o) {
    const meta = POWER_META[o.type];
    SY.audio.powerup();
    wave(s, o.x, o.y, 56, meta.color);
    burst(s, o.x, o.y, meta.color, 12, 170, 2.6);
    floatText(s, o.x, o.y - 18, meta.label, meta.color);
    switch (o.type) {
      case 'MAGNET': s.fx.MAGNET = 7; break;
      case 'SHIELD': s.shield = true; break;
      case 'SLOW': s.fx.SLOW = 5; break;
      case 'X2': s.fx.X2 = 7; break;
      case 'BOOST': s.fx.BOOST = 6; break;
      case 'SPREAD': s.fx.SPREAD = 7; break;
      case 'TIME':
        s.timeLeft = Math.min(s.duration + 20, s.timeLeft + 5);
        break;
    }
  }

  function stepCosmeticsLight(s, dt) {
    // during hitstop, only fade waves/floats slightly so the frame isn't 100% static
    for (const w of s.waves) w.life -= dt * 0.5;
  }

  function stepCosmetics(s, dt) {
    for (let i = s.parts.length - 1; i >= 0; i--) {
      const pa = s.parts[i];
      pa.x += pa.vx * dt; pa.y += pa.vy * dt;
      pa.vx *= Math.pow(0.2, dt); pa.vy *= Math.pow(0.2, dt);
      pa.life -= dt;
      if (pa.life <= 0) s.parts.splice(i, 1);
    }
    for (let i = s.waves.length - 1; i >= 0; i--) {
      const w = s.waves[i];
      w.r += (w.maxR - w.r) * Math.min(1, dt * 8);
      w.life -= dt * 2.2;
      if (w.life <= 0) s.waves.splice(i, 1);
    }
    for (let i = s.floats.length - 1; i >= 0; i--) {
      const f = s.floats[i];
      f.y -= 34 * dt; f.life -= dt * 0.9;
      if (f.life <= 0) s.floats.splice(i, 1);
    }
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
  }

  // ---------- public API ----------
  G.start = function (mode) {
    const seed = mode === 'daily' ? 'daily-' + SY.todayUTC() : 'free-' + Math.random().toString(36).slice(2);
    G.mode = mode;
    G.state = freshState(mode, seed);
    G.phase = 'ready';
  };
  G.toMenu = function () { G.phase = 'menu'; G.state = null; };
  G.pause = function () {
    if (G.phase !== 'playing' && G.phase !== 'ready') return;
    G.pausedFrom = G.phase;
    G.phase = 'paused';
    resetKeys();
    SY.input.ax = 0; SY.input.ay = 0;
  };
  G.resume = function () {
    if (G.phase !== 'paused') return;
    G.phase = G.pausedFrom || 'playing';
    resetKeys(); // keys pressed while the overlay was up must not leak in
  };
  G.update = update;
})();
