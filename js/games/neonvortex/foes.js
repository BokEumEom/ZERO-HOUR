// Neon Vortex — new enemy archetypes (Hunter/Charger now; Shield/Laser in Phase 2).
// Pure simulation on the shared state `s`. Rendering lives in render.js. All
// gameplay randomness uses s.rng() (daily fairness); Math.random() is cosmetic-only.
(function () {
  const SY = (window.SY = window.SY || {});
  const W = 960, H = 600;

  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  // seeded edge spawn point
  function edgePoint(s) {
    const edge = Math.floor(s.rng() * 4);
    if (edge === 0) return { x: s.rng() * W, y: -24 };
    if (edge === 1) return { x: W + 24, y: s.rng() * H };
    if (edge === 2) return { x: s.rng() * W, y: H + 24 };
    return { x: -24, y: s.rng() * H };
  }

  function count(s, kind) { let n = 0; for (const f of s.foes) if (f.kind === kind) n++; return n; }

  function spawnHunter(s) {
    const p = edgePoint(s);
    s.foes.push({ kind: 'hunter', x: p.x, y: p.y, vx: 0, vy: 0, r: 14, hp: 2, maxHp: 2, flash: 0, phase: s.rng() * 6 });
  }
  function spawnCharger(s) {
    const p = edgePoint(s);
    s.foes.push({
      kind: 'charger', x: p.x, y: p.y, vx: 0, vy: 0, r: 18, hp: 2, maxHp: 2, flash: 0, phase: s.rng() * 6,
      state: 'hover', stateT: 1.0, dirX: 0, dirY: 0,
    });
  }

  function initTimers(s) {
    s.foeSpawnT = { hunter: 2.5 + s.rng() * 2, charger: 4 + s.rng() * 2 };
  }

  // spawn pass (gated by s.diff.foes caps), then per-kind sim
  function update(s, dt, slowMul, api) {
    const gate = s.diff.foes;
    if (!gate) return;
    if (gate.hunter) {
      s.foeSpawnT.hunter -= dt;
      if (s.foeSpawnT.hunter <= 0) {
        s.foeSpawnT.hunter = (3.5 + s.rng() * 2.5) / s.diff.spawnMul;
        if (count(s, 'hunter') < gate.hunter) spawnHunter(s);
      }
    }
    if (gate.charger) {
      s.foeSpawnT.charger -= dt;
      if (s.foeSpawnT.charger <= 0) {
        s.foeSpawnT.charger = (5 + s.rng() * 3) / s.diff.spawnMul;
        if (count(s, 'charger') < gate.charger) spawnCharger(s);
      }
    }
    stepFoes(s, dt, slowMul, api);
  }

  function stepFoes(s, dt, slowMul, api) {
    const p = s.player;
    for (let i = s.foes.length - 1; i >= 0; i--) {
      const f = s.foes[i];
      f.phase += dt * 3;
      if (f.flash > 0) f.flash -= dt;

      if (f.kind === 'hunter') {
        const d = Math.sqrt(dist2(f, p)) || 1;
        const spd = (95 + s.t * 1.3) * s.diff.mineSpeedMul;
        f.x += ((p.x - f.x) / d) * spd * slowMul * dt;
        f.y += ((p.y - f.y) / d) * spd * slowMul * dt;
        if (Math.sqrt(dist2(f, p)) < f.r + p.r) {
          s.foes.splice(i, 1);
          api.burst(s, f.x, f.y, '#ff5a78', 14, 200, 3);
          api.hurtPlayer(s, f.x, f.y);
        }
        continue;
      }

      if (f.kind === 'charger') {
        f.stateT -= dt * slowMul;
        if (f.state === 'hover') {
          if (f.stateT <= 0) { f.state = 'lock'; f.stateT = 0.8; }
        } else if (f.state === 'lock') {
          const d = Math.sqrt(dist2(p, f)) || 1; // re-aim each frame; frozen on dash entry
          f.dirX = (p.x - f.x) / d; f.dirY = (p.y - f.y) / d;
          if (f.stateT <= 0) { f.state = 'dash'; f.stateT = 1.0; }
        } else if (f.state === 'dash') {
          f.x += f.dirX * 520 * slowMul * dt;
          f.y += f.dirY * 520 * slowMul * dt;
          if (Math.sqrt(dist2(f, p)) < f.r + p.r) api.hurtPlayer(s, f.x, f.y);
          if (f.stateT <= 0 || f.x < -40 || f.x > W + 40 || f.y < -40 || f.y > H + 40) {
            f.state = 'recover'; f.stateT = 0.8;
          }
        } else { // recover
          if (f.stateT <= 0) {
            if (f.x < -30 || f.x > W + 30 || f.y < -30 || f.y > H + 30) { s.foes.splice(i, 1); continue; }
            f.state = 'lock'; f.stateT = 0.8;
          }
        }
        continue;
      }
    }
  }

  // bullet geometry (shield deflection arrives in Phase 2)
  function bulletHit(foe, b) {
    return dist2(foe, b) < (foe.r + 4) * (foe.r + 4) ? 'hit' : 'miss';
  }

  // apply damage; on death award score (+ drops) and remove. Returns true if killed.
  function damage(s, foe, dmg, api) {
    foe.hp -= dmg; foe.flash = 0.07;
    if (foe.hp > 0) return false;
    const idx = s.foes.indexOf(foe);
    if (idx >= 0) s.foes.splice(idx, 1);
    const sc = foe.kind === 'charger' ? 35 : 30; // hunter 30, charger 35
    api.addScore(s, sc, foe.x, foe.y, undefined, 'destroy');
    api.burst(s, foe.x, foe.y, '#ff9a5a', 16, 230, 3);
    api.wave(s, foe.x, foe.y, 52, '#ff9a5a');
    return true;
  }

  SY.nvFoes = { initTimers, update, bulletHit, damage };
})();
