import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G) {
  G.start('free', 'normal');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}
function placeBoss(s) {
  s.boss = { x: 480, y: 128, ty: 128, r: 46, hp: 72, maxHp: 72, t: 0, burstT: 9, aimT: 9, plasmaT: 9, fireMul: 1, flash: 0, dying: 0, ringRot: 0, coresDeployed: false };
  s.bossCores = [];
}

test('boss deploys exactly 2 support cores once in position', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  assert.equal(s.bossCores.length, 2, '2 cores deployed');
  G.update(1 / 60);
  assert.equal(s.bossCores.length, 2, 'not re-deployed on later frames');
});

test('cores orbit around the boss', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  const a0 = s.bossCores[0].ang;
  for (let i = 0; i < 30; i++) G.update(1 / 60);
  assert.ok(s.bossCores[0].ang > a0, 'orbit angle advances');
  const dx = s.bossCores[0].x - s.boss.x, dy = s.bossCores[0].y - s.boss.y;
  assert.ok(Math.abs(Math.hypot(dx, dy) - 96) < 2, 'core stays on its orbit radius');
});

test('cores fire enemy bullets over time', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  s.ebullets = [];
  for (let i = 0; i < 60 * 4; i++) G.update(1 / 60); // ~4s — past the fireT interval
  assert.ok(s.ebullets.length > 0, 'cores emitted aimed shots');
});

test('a core is destructible: +120 score and removed at 0 hp', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  const c = s.bossCores[0]; c.hp = 1;
  s.breakdown.destruction = 0; const before = s.score;
  s.bullets.push({ x: c.x, y: c.y, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.bossCores.length, 1, 'one core destroyed');
  assert.equal(s.breakdown.destruction, 120, 'core kill = 120 into destruction');
  assert.ok(s.score - before >= 120);
});

test('cores are cleared when the boss is destroyed', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  assert.equal(s.bossCores.length, 2, 'cores present');
  s.boss.dying = 0.05; // trigger death finalization
  for (let i = 0; i < 10; i++) G.update(1 / 60);
  assert.equal(s.boss, null, 'boss gone');
  assert.equal(s.bossCores.length, 0, 'cores cleared with the boss');
});

test('core orbit/fire is deterministic (no rng) for a fixed setup', () => {
  const run = () => {
    const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
    for (let i = 0; i < 90; i++) G.update(1 / 60);
    return s.bossCores.map((c) => [Math.round(c.x), Math.round(c.y), Math.round(c.ang * 100)]);
  };
  assert.deepEqual(run(), run(), 'identical core trajectories across runs');
});
