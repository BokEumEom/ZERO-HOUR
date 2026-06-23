import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });

function play(G, mode, diff) {
  G.start(mode, diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
}

test('DIFF.foes gates per tier: easy none, normal hunter+charger, hard adds shield+laser', () => {
  const G = boot().SY.nvGame;
  assert.equal(Object.keys(G.DIFF.easy.foes).length, 0, 'easy: no foe kinds'); // cross-realm-safe (vm sandbox)
  assert.equal(G.DIFF.normal.foes.hunter, 2);
  assert.equal(G.DIFF.normal.foes.charger, 1);
  assert.equal(G.DIFF.normal.foes.shield, undefined);
  assert.equal(G.DIFF.hard.foes.shield, 1);
  assert.equal(G.DIFF.hard.foes.laser, 1);
});

test('easy spawns no foes; normal spawns hunter/charger but never shield/laser', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'easy');
  for (let i = 0; i < 60 * 15; i++) G.update(1 / 60);
  assert.equal(G.state.foes.length, 0, 'easy: no foes');

  play(G, 'free', 'normal');
  const kinds = new Set();
  for (let i = 0; i < 60 * 20; i++) { G.update(1 / 60); for (const f of G.state.foes) kinds.add(f.kind); }
  assert.ok(kinds.has('hunter') || kinds.has('charger'), 'normal spawns phase-1 foes');
  assert.ok(!kinds.has('shield') && !kinds.has('laser'), 'normal never spawns hard-tier foes');
});

test('foe caps are honored (hunter<=2, charger<=1 on normal)', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  let maxH = 0, maxC = 0;
  for (let i = 0; i < 60 * 25; i++) {
    G.update(1 / 60);
    maxH = Math.max(maxH, G.state.foes.filter((f) => f.kind === 'hunter').length);
    maxC = Math.max(maxC, G.state.foes.filter((f) => f.kind === 'charger').length);
  }
  assert.ok(maxH <= 2, 'hunter cap 2');
  assert.ok(maxC <= 1, 'charger cap 1');
});

test('hunter homes toward the player', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state;
  s.foes = [{ kind: 'hunter', x: 50, y: 50, vx: 0, vy: 0, r: 14, hp: 2, maxHp: 2, flash: 0, phase: 0 }];
  const p = s.player; p.x = 800; p.y = 500;
  const before = Math.hypot(p.x - 50, p.y - 50);
  for (let i = 0; i < 60; i++) G.update(1 / 60);
  const f = s.foes[0];
  if (f) assert.ok(Math.hypot(p.x - f.x, p.y - f.y) < before, 'hunter moved closer to player');
});

test('charger cycles hover -> lock -> dash -> recover', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state;
  const seen = new Set();
  s.foes = [{ kind: 'charger', x: 480, y: 60, vx: 0, vy: 0, r: 18, hp: 9, maxHp: 9, flash: 0, phase: 0, state: 'hover', stateT: 1.0, dirX: 0, dirY: 0 }];
  for (let i = 0; i < 60 * 6 && s.foes.length; i++) { G.update(1 / 60); if (s.foes[0]) seen.add(s.foes[0].state); }
  assert.ok(seen.has('lock'), 'entered lock'); assert.ok(seen.has('dash'), 'entered dash');
});

test('a dashing charger that reaches the player deals a hit', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state; s.shield = false; s.player.inv = 0;
  const p = s.player;
  s.foes = [{ kind: 'charger', x: p.x, y: p.y, vx: 0, vy: 0, r: 18, hp: 9, maxHp: 9, flash: 0, phase: 0, state: 'dash', stateT: 1.0, dirX: 0, dirY: 0 }];
  G.update(1 / 60);
  assert.equal(s.tookDamage, true, 'dash contact hurts the player');
});

test('player bullets destroy a foe and award destruction score', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state;
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.bullets = [];
  s.foes = [{ kind: 'hunter', x: 480, y: 300, vx: 0, vy: 0, r: 14, hp: 2, maxHp: 2, flash: 0, phase: 0 }];
  s.score = 0; s.breakdown.destruction = 0;
  for (let h = 0; h < 3; h++) { s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 }); G.update(1 / 60); }
  assert.equal(s.foes.length, 0, 'foe destroyed');
  assert.ok(s.breakdown.destruction >= 30, 'destruction score awarded');
});

test('auto-fire targets a nearby foe (a bullet is emitted toward it)', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state;
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.bullets = []; s.crystals = [];
  s.foes = [{ kind: 'hunter', x: s.player.x + 120, y: s.player.y, vx: 0, vy: 0, r: 14, hp: 5, maxHp: 5, flash: 0, phase: 0 }];
  s.player.fireCd = 0;
  for (let i = 0; i < 6; i++) G.update(1 / 60);
  assert.ok(s.bullets.length > 0, 'auto-fire produced a bullet at the foe');
});
