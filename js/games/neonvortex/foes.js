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

  function spawnShield(s) {
    const x = 120 + s.rng() * (W - 240), y = 90 + s.rng() * (H - 220);
    s.foes.push({
      kind: 'shield', x, y, r: 20, hp: 4, maxHp: 4, flash: 0, phase: s.rng() * 6,
      driftA: s.rng() * Math.PI * 2, aimA: s.rng() * Math.PI * 2,
    });
  }
  function spawnLaser(s) {
    const p = edgePoint(s); // edge-anchored emitter
    const x = Math.max(40, Math.min(W - 40, p.x)), y = Math.max(40, Math.min(H - 40, p.y));
    s.foes.push({
      kind: 'laser', x, y, r: 16, hp: 3, maxHp: 3, flash: 0, phase: s.rng() * 6,
      state: 'warn', stateT: 1.0, life: 11, bx: x, by: y,
    });
  }

  function initTimers(s) {
    s.foeSpawnT = { hunter: 2.5 + s.rng() * 2, charger: 4 + s.rng() * 2, shield: 6 + s.rng() * 3, laser: 8 + s.rng() * 3 };
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
    if (gate.shield) {
      s.foeSpawnT.shield -= dt;
      if (s.foeSpawnT.shield <= 0) {
        s.foeSpawnT.shield = (9 + s.rng() * 4) / s.diff.spawnMul;
        if (count(s, 'shield') < gate.shield) spawnShield(s);
      }
    }
    if (gate.laser) {
      s.foeSpawnT.laser -= dt;
      if (s.foeSpawnT.laser <= 0) {
        s.foeSpawnT.laser = (10 + s.rng() * 5) / s.diff.spawnMul;
        if (count(s, 'laser') < gate.laser) spawnLaser(s);
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
        if (dist2(f, p) < (f.r + p.r) * (f.r + p.r)) {
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
          if (dist2(f, p) < (f.r + p.r) * (f.r + p.r)) api.hurtPlayer(s, f.x, f.y);
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

      if (f.kind === 'shield') {
        const spd = 26 * s.diff.mineSpeedMul; // slow drift, bounce off inner bounds
        f.x += Math.cos(f.driftA) * spd * slowMul * dt;
        f.y += Math.sin(f.driftA) * spd * slowMul * dt;
        if (f.x < 40 || f.x > W - 40) { f.driftA = Math.PI - f.driftA; f.x = Math.max(40, Math.min(W - 40, f.x)); }
        if (f.y < 60 || f.y > H - 60) { f.driftA = -f.driftA; f.y = Math.max(60, Math.min(H - 60, f.y)); }
        // rotate the shield to face the player (shortest direction)
        const want = Math.atan2(p.y - f.y, p.x - f.x);
        let d = want - f.aimA; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        const step = 2.2 * dt; f.aimA += Math.max(-step, Math.min(step, d));
        if (dist2(f, p) < (f.r + p.r) * (f.r + p.r)) api.hurtPlayer(s, f.x, f.y);
        continue;
      }

      if (f.kind === 'laser') {
        f.life -= dt;
        f.stateT -= dt * slowMul;
        if (f.state === 'warn') {
          if (f.stateT >= 0.98) { f.bx = p.x; f.by = p.y; } // lock the beam target at warn entry
          if (f.stateT <= 0) { f.state = 'fire'; f.stateT = 1.2; }
        } else if (f.state === 'fire') {
          // point->segment distance from player to the beam line (emitter -> locked target)
          const ex = f.x, ey = f.y, dx = f.bx - ex, dy = f.by - ey;
          const len2 = dx * dx + dy * dy || 1;
          let t = ((p.x - ex) * dx + (p.y - ey) * dy) / len2;
          t = Math.max(0, Math.min(1.4, t)); // allow the beam to overshoot past the locked point
          const cx = ex + dx * t, cy = ey + dy * t;
          if ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy) < (p.r + 6) * (p.r + 6)) api.hurtPlayer(s, p.x, p.y);
          if (f.stateT <= 0) { f.state = 'cool'; f.stateT = 1.6; }
        } else { // cool
          if (f.stateT <= 0) { f.state = 'warn'; f.stateT = 1.0; }
        }
        if (f.life <= 0) { s.foes.splice(i, 1); continue; }
        continue;
      }
    }
  }

  // bullet geometry. Shield deflects bullets that strike its front arc.
  const SHIELD_ARC = 1.05; // half-angle (~60deg) of the deflecting front
  function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); }
  function bulletHit(foe, b) {
    if (dist2(foe, b) >= (foe.r + 4) * (foe.r + 4)) return 'miss';
    if (foe.kind === 'shield') {
      const toB = Math.atan2(b.y - foe.y, b.x - foe.x); // side the bullet is on
      if (angDiff(toB, foe.aimA) < SHIELD_ARC) return 'blocked'; // struck the shielded front
    }
    return 'hit';
  }

  // apply damage; on death award score (+ drops) and remove. Returns true if killed.
  const FOE_SCORE = { hunter: 30, charger: 35, shield: 50, laser: 40 };
  function damage(s, foe, dmg, api) {
    foe.hp -= dmg; foe.flash = 0.07;
    if (foe.hp > 0) return false;
    const idx = s.foes.indexOf(foe);
    if (idx >= 0) s.foes.splice(idx, 1);
    api.addScore(s, FOE_SCORE[foe.kind] || 30, foe.x, foe.y, undefined, 'destroy');
    api.burst(s, foe.x, foe.y, '#ff9a5a', 16, 230, 3);
    api.wave(s, foe.x, foe.y, 52, '#ff9a5a');
    if (api.blast) api.blast(s, foe.x, foe.y, 58);
    if (foe.kind === 'shield') api.dropCrystals(s, foe.x, foe.y, 3);
    else if (foe.kind === 'laser') api.dropCrystals(s, foe.x, foe.y, 2);
    return true;
  }

  SY.nvFoes = { initTimers, update, bulletHit, damage, FOE_SCORE };
})();
