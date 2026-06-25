// Neon Vortex — elite "Sentinel" mini-boss (beam-sweep). Pure simulation on the
// shared state `s`; rendering lives in render.js. Spawn position + beam sweep
// direction use s.rng() (daily fairness); aim tracks the player like the boss
// (reactive, fair). Math.random() is never used here.
(function () {
  const SY = (window.SY = window.SY || {});
  const W = 960, H = 600;
  const HP = 20, R = 30;
  const BEAM_LEN = 760, BEAM_HALF = 14;
  const T_TELE = 1.0, T_FIRE = 1.4, T_COOL = 2.0, SWEEP = Math.PI * 2 / 3; // 120°

  function edgePoint(s) {
    const edge = Math.floor(s.rng() * 4);
    if (edge === 0) return { x: s.rng() * W, y: -30 };
    if (edge === 1) return { x: W + 30, y: s.rng() * H };
    if (edge === 2) return { x: s.rng() * W, y: H + 30 };
    return { x: -30, y: s.rng() * H };
  }

  function spawn(s) {
    const ep = edgePoint(s);
    const hx = 220 + s.rng() * (W - 440);   // seeded hover anchor
    const hy = 130 + s.rng() * 150;          // upper-mid band
    s.elite = {
      x: ep.x, y: ep.y, hx, hy, r: R, hp: HP, maxHp: HP,
      state: 'enter', t: 0, flash: 0, phase: s.rng() * 6,
      beamA: 0, beamFrom: 0, beamTo: 0, beamDir: 1,
    };
    s.shake = Math.max(s.shake, 6);
    SY.audio.bossSpawn();
  }

  function startTelegraph(s, e) {
    e.state = 'telegraph'; e.t = T_TELE;
    const p = s.player;
    const aim = Math.atan2(p.y - e.y, p.x - e.x); // reactive aim (fair, like boss)
    e.beamDir = s.rng() < 0.5 ? 1 : -1;
    e.beamFrom = aim - e.beamDir * SWEEP / 2;
    e.beamTo = aim + e.beamDir * SWEEP / 2;
    e.beamA = e.beamFrom;
  }

  function hitPlayerByBeam(s, e, api) {
    const p = s.player;
    const dx = Math.cos(e.beamA), dy = Math.sin(e.beamA);
    const rx = p.x - e.x, ry = p.y - e.y;
    const proj = rx * dx + ry * dy;            // along the ray
    if (proj < 0 || proj > BEAM_LEN) return;
    const perp = Math.abs(rx * dy - ry * dx);  // perpendicular distance
    if (perp < BEAM_HALF + p.r) api.hurtPlayer(s, p.x, p.y);
  }

  function update(s, dt, slowMul, api) {
    const e = s.elite; if (!e) return;
    e.phase += dt * 3; if (e.flash > 0) e.flash -= dt;
    if (e.state === 'enter') {
      e.x += (e.hx - e.x) * Math.min(1, dt * 2.2);
      e.y += (e.hy - e.y) * Math.min(1, dt * 2.2);
      if (Math.abs(e.x - e.hx) < 4 && Math.abs(e.y - e.hy) < 4) startTelegraph(s, e);
      return;
    }
    e.x = e.hx + Math.sin(e.phase * 0.5) * 26; // gentle hover
    e.t -= dt * slowMul;
    if (e.state === 'telegraph') {
      if (e.t <= 0) { e.state = 'firing'; e.t = T_FIRE; e.beamA = e.beamFrom; SY.audio.shoot(); }
    } else if (e.state === 'firing') {
      const k = 1 - Math.max(0, e.t) / T_FIRE; // 0..1 sweep progress
      e.beamA = e.beamFrom + (e.beamTo - e.beamFrom) * k;
      hitPlayerByBeam(s, e, api);
      if (e.t <= 0) { e.state = 'cooldown'; e.t = T_COOL; }
    } else { // cooldown
      if (e.t <= 0) startTelegraph(s, e);
    }
  }

  // bullet collision + damage + death reward. Returns true if the bullet hit.
  function bulletHit(s, b, api) {
    const e = s.elite; if (!e || e.state === 'enter') return false;
    const dx = e.x - b.x, dy = e.y - b.y;
    if (dx * dx + dy * dy > (e.r + 4) * (e.r + 4)) return false;
    e.hp -= 1; e.flash = 0.08;
    api.burst(s, b.x, b.y, '#ff7ad1', 4, 120, 2);
    SY.audio.bossHit();
    if (e.hp <= 0) die(s, e, api);
    return true;
  }

  function die(s, e, api) {
    s.elite = null;
    api.addScore(s, 250, e.x, e.y, 'SENTINEL', 'destroy');
    api.blast(s, e.x, e.y, 150);
    api.wave(s, e.x, e.y, 180, '#ff7ad1');
    api.burst(s, e.x, e.y, '#ff7ad1', 40, 320, 3.5);
    api.spawnPow(s, e.x, e.y);            // guaranteed power-up
    api.spawnLoot(s, e.x, e.y, 'chest');  // jackpot loot burst (reuses E1)
    s.freeze = Math.max(s.freeze, 0.2);
    s.shake = Math.max(s.shake, 12);
    SY.audio.bossDown();
  }

  SY.nvElite = { spawn, update, bulletHit, HP };
})();
