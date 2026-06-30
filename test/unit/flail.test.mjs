import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('the flail-ball rect exists on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  assert.ok(A.flailBall, 'flailBall rect exists');
  assert.equal(A.flailBall.sheet, undefined, 'flailBall stays on the atlas');
  assert.deepEqual({ x: A.flailBall.x, y: A.flailBall.y, w: A.flailBall.w, h: A.flailBall.h },
    { x: 835, y: 64, w: 46, h: 54 }, 'flailBall rect');
});

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}
function clearHazards(s) {
  s.boss = null; s.mines = []; s.rocks = []; s.turrets = []; s.foes = []; s.ebullets = []; s.fences = [];
}

test('a flail cycles warn -> sweep -> leave and is removed', () => {
  const G = boot().SY.nvGame; const s = play(G);
  clearHazards(s);
  s.flails = [{ ax: 480, ay: 300, len: 100, ang: 0, spin: 1.8, ballR: 16, state: 'warn', t: 1.0, phase: 0 }];
  const seen = new Set();
  for (let i = 0; i < 60 * 7 && s.flails.length; i++) { if (s.flails[0]) seen.add(s.flails[0].state); G.update(1 / 60); }
  assert.ok(seen.has('warn') && seen.has('sweep') && seen.has('leave'), 'cycled all three states');
  assert.equal(s.flails.length, 0, 'flail removed after leave');
});

test('a sweeping flail ball on the player damages; off the player does not', () => {
  let G = boot().SY.nvGame; let s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp0 = s.player.hp;
  // ball at (ax+len, ay) with ang 0 -> place it on the player
  s.flails = [{ ax: s.player.x - 100, ay: s.player.y, len: 100, ang: 0, spin: 1.8, ballR: 16, state: 'sweep', t: 4.5, phase: 0 }];
  G.update(1 / 60);
  assert.ok(s.player.hp < hp0, 'player under the ball takes damage');

  G = boot().SY.nvGame; s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp1 = s.player.hp;
  s.flails = [{ ax: 60, ay: 60, len: 50, ang: 0, spin: 1.8, ballR: 16, state: 'sweep', t: 4.5, phase: 0 }];
  G.update(1 / 60);
  assert.equal(s.player.hp, hp1, 'player far from the ball is unharmed');
});

test('a flail is non-destructible (bullets pass through)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  clearHazards(s);
  s.flails = [{ ax: 480, ay: 300, len: 0, ang: 0, spin: 1.8, ballR: 16, state: 'sweep', t: 4.5, phase: 0 }];
  s.bullets = [{ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 }];
  G.update(1 / 60);
  assert.equal(s.flails.length, 1, 'flail survives a bullet overlap');
});

test('easy difficulty never spawns a flail', () => {
  const G = boot().SY.nvGame; const s = play(G, 'easy');
  for (let i = 0; i < 60 * 40; i++) G.update(1 / 60);
  assert.equal(s.flails.length, 0, 'no flails on easy');
});

test('same daily seed -> identical flail trajectory (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    const trace = [];
    for (let i = 0; i < 60 * 40; i++) {
      G.update(1 / 60);
      if (st.flails.length) trace.push(st.flails.map((f) => `${Math.round(f.ax)},${Math.round(f.ay)},${Math.round(f.len)},${f.spin.toFixed(1)}`).join(';'));
    }
    return trace.join('|');
  };
  const a = run();
  assert.equal(a, run(), 'identical flail trajectory for the same seed');
  assert.ok(a.length > 0, 'at least one flail spawned in 40s (not trivially empty)');
});
