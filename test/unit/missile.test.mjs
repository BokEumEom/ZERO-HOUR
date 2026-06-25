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

test('MISSILE is a ninth power-up type with a duration', () => {
  const G = boot().SY.nvGame;
  assert.ok(G.POWER_META.MISSILE, 'MISSILE meta present');
  assert.equal(G.POWER_DURATION.MISSILE, 8);
});

test('while MISSILE is active the player fires a homing bullet', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fx.MISSILE = 8; s.player.fireCd = 0;
  s.mines = [{ x: s.player.x + 200, y: s.player.y, r: 11, hp: 1, speed: 60, phase: 0, flash: 0, vx: 0, vy: 0, entryT: 0 }];
  s.rocks = []; s.boss = null; s.turrets = []; s.foes = []; s.crates = []; s.bullets = []; s.elite = null;
  G.update(1 / 60);
  assert.ok(s.bullets.some(b => b.homing), 'a homing missile was fired');
});

test('a homing missile steers toward the nearest enemy', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fx.MISSILE = 0; s.player.fireCd = 99; // no new fire; isolate the one missile
  s.bullets = [{ x: 480, y: 300, vx: 430, vy: 0, life: 1.3, homing: true }]; // flying +x
  s.mines = [{ x: 480, y: 80, r: 11, hp: 5, speed: 0, phase: 0, flash: 0, vx: 0, vy: 0, entryT: 0 }]; // enemy straight up
  s.rocks = []; s.boss = null; s.turrets = []; s.foes = []; s.crates = []; s.elite = null;
  const b = s.bullets[0];
  for (let i = 0; i < 8 && s.bullets[0] === b; i++) G.update(1 / 60);
  assert.ok(b.vy < -20, 'missile turned toward the enemy above (vy negative)');
});

test('a homing missile damages enemies through the shared bullet pipeline', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.fireCd = 99;
  s.mines = [{ x: 480, y: 300, r: 11, hp: 1, speed: 0, phase: 0, flash: 0, vx: 0, vy: 0, entryT: 0 }];
  s.bullets = [{ x: 478, y: 300, vx: 430, vy: 0, life: 1.3, homing: true }];
  s.rocks = []; s.boss = null; s.turrets = []; s.foes = []; s.crates = []; s.elite = null;
  G.update(1 / 60);
  assert.equal(s.mines.length, 0, 'the homing missile destroyed the mine');
});
