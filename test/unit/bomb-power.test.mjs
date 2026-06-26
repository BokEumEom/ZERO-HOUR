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
function grabBomb(G, s) {
  s.pows.push({ x: s.player.x, y: s.player.y, type: 'BOMB', r: 12, life: 9, phase: 0, vy: 0 });
  G.update(1 / 60);
}

test('BOMB has meta but is NOT in the seeded bag (rare special, instant)', () => {
  const G = boot().SY.nvGame;
  assert.ok(G.POWER_META['BOMB'], 'BOMB meta exists');
  assert.equal(G.POWER_DURATION['BOMB'], undefined, 'BOMB is instant — no duration');
});

test('BOMB destroys all combat enemies and wipes enemy fire', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.rocks = [{ x: 100, y: 100, r: 22, hp: 3, maxHp: 3, rot: 0, spin: 0, flash: 0 }];
  s.mines = [{ x: 200, y: 200, r: 11, hp: 1, speed: 60, phase: 0, flash: 0, vx: 0, vy: 0, entryT: 0 }];
  s.turrets = [{ x: 300, y: 200, r: 16, hp: 5, maxHp: 5, fireT: 9, flash: 0, phase: 0 }];
  s.ebullets = [{ x: 400, y: 400, vx: 0, vy: 0, r: 6, life: 5 }];
  s.crystals = []; s.breakdown.destruction = 0; const before = s.score;
  grabBomb(G, s);
  assert.equal(s.rocks.length, 0, 'rocks cleared');
  assert.equal(s.mines.length, 0, 'mines cleared');
  assert.equal(s.turrets.length, 0, 'turrets cleared');
  assert.equal(s.ebullets.length, 0, 'enemy fire wiped');
  assert.equal(s.breakdown.destruction, 25 + 40 + 60, 'destruction score = mine+rock+turret');
  assert.ok(s.score - before >= 125, 'score increased by the kills');
});

test('BOMB drops NO loot (no crystal/token flood)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.rocks = [{ x: 100, y: 100, r: 22, hp: 3, maxHp: 3, rot: 0, spin: 0, flash: 0 },
             { x: 150, y: 150, r: 22, hp: 3, maxHp: 3, rot: 0, spin: 0, flash: 0 }];
  s.crystals = []; s.tokens = [];
  grabBomb(G, s);
  assert.equal(s.crystals.length, 0, 'no crystals dropped by the bomb');
  assert.equal(s.tokens.length, 0, 'no tokens dropped by the bomb');
});

test('BOMB chips the boss but never kills it (clamped to >=1 hp)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.boss = { x: 480, y: 128, ty: 128, r: 46, hp: 3, maxHp: 72, t: 0, burstT: 9, aimT: 9, plasmaT: 9, fireMul: 1, flash: 0, dying: 0, ringRot: 0 };
  grabBomb(G, s);
  assert.equal(s.boss.hp, 1, 'boss chipped down to the 1-hp floor, not killed');
  assert.equal(s.boss.dying, 0, 'boss is still alive');
});

test('BOMB spawns from its own rare gated timer', () => {
  const G = boot().SY.nvGame; const s = play(G);
  let saw = false;
  for (let i = 0; i < 60 * 40 && !saw; i++) {
    s.spawnT.bomb = 0; // force the seeded roll every frame -> reachable for any seed
    G.update(1 / 60);
    if (s.pows.some((o) => o.type === 'BOMB')) saw = true;
  }
  assert.equal(saw, true, 'a BOMB appears from the rare timer');
});
