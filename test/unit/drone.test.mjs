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
function pickUp(G, s, type) {
  s.pows.push({ x: s.player.x, y: s.player.y, type, r: 12, life: 9, phase: 0, vy: 0 });
  G.update(1 / 60);
}

test('DRONE is an eighth power-up type with a duration', () => {
  const G = boot().SY.nvGame;
  assert.ok(G.POWER_META.DRONE, 'DRONE meta present');
  assert.equal(G.POWER_DURATION.DRONE, 9);
});

test('the DRONE power-up spawns two orbiting drones and arms the timer', () => {
  const G = boot().SY.nvGame; const s = play(G);
  assert.equal(s.drones.length, 0);
  pickUp(G, s, 'DRONE');
  assert.equal(s.drones.length, 2, 'two drones deploy');
  assert.ok(s.fx.DRONE > 8.9, 'drone timer armed (~9)');
});

test('drones auto-fire at a nearby enemy into the shared bullet pool', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fx.DRONE = 9; s.drones = [{ angle: 0, orbitR: 40, fireCd: 0, x: s.player.x + 40, y: s.player.y }];
  s.mines = [{ x: s.player.x + 120, y: s.player.y, r: 11, hp: 1, speed: 60, phase: 0, flash: 0, vx: 0, vy: 0, entryT: 0 }];
  s.rocks = []; s.boss = null; s.turrets = []; s.foes = []; s.crates = []; s.bullets = [];
  G.update(1 / 60);
  assert.ok(s.bullets.length > 0, 'a drone bullet was emitted at the enemy');
});

test('drones are removed when the timer expires', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fx.DRONE = 0.005; s.drones = [{ angle: 0, orbitR: 40, fireCd: 1, x: 0, y: 0 }, { angle: 1, orbitR: 40, fireCd: 1, x: 0, y: 0 }];
  for (let i = 0; i < 5; i++) G.update(1 / 60);
  assert.equal(s.drones.length, 0, 'drones cleared after DRONE expires');
});

test('re-picking DRONE extends the timer without adding more drones', () => {
  const G = boot().SY.nvGame; const s = play(G);
  pickUp(G, s, 'DRONE');
  s.fx.DRONE = 3;
  pickUp(G, s, 'DRONE');
  assert.equal(s.drones.length, 2, 'still two drones');
  assert.ok(s.fx.DRONE > 11.9, 'timer extended (3 + 9)');
});
