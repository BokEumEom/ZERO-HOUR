import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}

test('elite spawns once mid-run (~24s) on a 60s run, not before', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.hp = 99;
  const tick = () => { s.player.inv = 1; G.update(1 / 60); }; // keep the pilot alive
  for (let i = 0; i < 60 * 20; i++) tick();   // ~20s
  assert.equal(s.elite, null, 'no elite before eliteAt');
  for (let i = 0; i < 60 * 8; i++) tick();    // ~28s
  assert.ok(s.eliteSpawned, 'elite scheduled');
});

test('the beam sweep can hit the player on the ray', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.x = 480; s.player.y = 300; s.player.inv = 0; s.shield = false;
  s.elite = { x: 480, y: 120, hx: 480, hy: 120, r: 30, hp: 20, maxHp: 20, state: 'firing', t: 1.4, flash: 0, phase: 0, beamA: Math.PI / 2, beamFrom: Math.PI / 2, beamTo: Math.PI / 2, beamDir: 1 };
  const hp0 = s.player.hp;
  G.update(1 / 60);
  assert.ok(s.player.hp < hp0, 'beam damaged the player');
});

test('killing the elite drops a power-up + jackpot loot + big score, clears slot', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.elite = { x: 480, y: 200, hx: 480, hy: 200, r: 30, hp: 1, maxHp: 20, state: 'telegraph', t: 1, flash: 0, phase: 0, beamA: 0, beamFrom: 0, beamTo: 0, beamDir: 1 };
  s.pows = []; s.tokens = []; const sc0 = s.score;
  s.bullets = [{ x: 480, y: 200, vx: 0, vy: 0, life: 0.5 }];
  G.update(1 / 60);
  assert.equal(s.elite, null, 'elite cleared');
  assert.ok(s.score - sc0 >= 250, 'awarded >=250');
  assert.ok(s.pows.length >= 1, 'guaranteed power-up');
  assert.ok(s.tokens.length >= 1, 'jackpot loot burst');
});

test('the sentinel retreats when the boss arrives (no overlap)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.elite = { x: 480, y: 200, hx: 480, hy: 200, r: 30, hp: 20, maxHp: 20, state: 'telegraph', t: 1, flash: 0, phase: 0, beamA: 0, beamFrom: 0, beamTo: 0, beamDir: 1 };
  s.timeLeft = 19.9; s.bossDown = false; s.boss = null;
  G.update(1 / 60);
  assert.ok(s.boss, 'boss spawned'); assert.equal(s.elite, null, 'elite retreated');
});

test('same daily seed + no input -> identical elite spawn (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
    st.player.hp = 99;
    for (let i = 0; i < 60 * 30; i++) { st.player.inv = 1; G.update(1 / 60); } // alive to ~30s
    const e = st.elite;
    return e ? [Math.round(e.x), Math.round(e.y), Math.round(e.hx), Math.round(e.hy), e.beamDir].join(',') : 'none';
  };
  const a = run(), b = run();
  assert.equal(a, b);
  assert.notEqual(a, 'none', 'elite actually spawned (meaningful fairness check)');
});
