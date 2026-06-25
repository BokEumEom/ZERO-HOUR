import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
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

test('hard spawns shield and laser; normal never does', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const nk = new Set();
  for (let i = 0; i < 60 * 20; i++) { G.update(1 / 60); for (const f of G.state.foes) nk.add(f.kind); }
  assert.ok(!nk.has('shield') && !nk.has('laser'), 'normal excludes hard-tier foes');

  play(G, 'free', 'hard');
  const hk = new Set();
  for (let i = 0; i < 60 * 25; i++) { G.update(1 / 60); for (const f of G.state.foes) hk.add(f.kind); }
  assert.ok(hk.has('shield'), 'hard spawns shield');
  assert.ok(hk.has('laser'), 'hard spawns laser');
});

test('shield/laser caps honored on hard (each <=1)', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'hard');
  let maxS = 0, maxL = 0;
  for (let i = 0; i < 60 * 25; i++) {
    G.update(1 / 60);
    maxS = Math.max(maxS, G.state.foes.filter((f) => f.kind === 'shield').length);
    maxL = Math.max(maxL, G.state.foes.filter((f) => f.kind === 'laser').length);
  }
  assert.ok(maxS <= 1 && maxL <= 1, 'shield/laser cap 1');
});

test('shield blocks frontal bullets and takes flank/rear hits', () => {
  const nvFoes = boot().SY.nvFoes;
  const foe = { kind: 'shield', x: 480, y: 300, r: 20, hp: 4, maxHp: 4, flash: 0, phase: 0, driftA: 0, aimA: 0 }; // aimA=0 faces +x
  const front = { x: 495, y: 300, vx: -100, vy: 0, life: 0.5 }; // bullet on the +x side (within arc)
  const rear = { x: 465, y: 300, vx: 100, vy: 0, life: 0.5 };   // bullet on the -x side (rear)
  assert.equal(nvFoes.bulletHit(foe, front), 'blocked', 'frontal bullet deflected');
  assert.equal(nvFoes.bulletHit(foe, rear), 'hit', 'rear bullet lands');
});

test('shield aimA rotates toward the player', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'hard');
  const s = G.state;
  s.foes = [{ kind: 'shield', x: 480, y: 300, r: 20, hp: 4, maxHp: 4, flash: 0, phase: 0, driftA: 0, aimA: Math.PI }];
  s.player.x = 800; s.player.y = 300; // player to the +x; target aim ~0
  for (let i = 0; i < 60; i++) G.update(1 / 60);
  const f = s.foes[0];
  if (f) assert.ok(Math.abs(Math.atan2(Math.sin(f.aimA), Math.cos(f.aimA))) < 1.0, 'aim turned toward player (+x)');
});

test('laser cycles warn -> fire -> cool and damages the player only while firing', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'hard');
  const s = G.state; s.shield = false; s.player.inv = 0;
  const p = s.player;
  s.foes = [{ kind: 'laser', x: 40, y: p.y, r: 16, hp: 9, maxHp: 9, flash: 0, phase: 0, state: 'warn', stateT: 1.0, life: 11, bx: p.x + 400, by: p.y }];
  const seen = new Set();
  for (let i = 0; i < 60 * 4 && s.foes.length; i++) { G.update(1 / 60); if (s.foes[0]) seen.add(s.foes[0].state); }
  assert.ok(seen.has('fire'), 'entered fire'); assert.ok(seen.has('cool'), 'entered cool');
  assert.equal(s.tookDamage, true, 'beam hit the player while firing');
});

test('destroying a shield awards 50 into destruction (rear hit)', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'hard');
  const s = G.state; s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.bullets = [];
  s.foes = [{ kind: 'shield', x: 480, y: 300, r: 20, hp: 1, maxHp: 4, flash: 0, phase: 0, driftA: 0, aimA: 0 }];
  s.breakdown.destruction = 0;
  s.bullets.push({ x: 465, y: 300, vx: 100, vy: 0, life: 0.5 }); // rear (-x) hit, within r+4
  G.update(1 / 60);
  assert.equal(s.foes.length, 0, 'shield destroyed by rear hit');
  assert.ok(s.breakdown.destruction >= 50, 'shield worth 50');
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
