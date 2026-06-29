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

test('portals cycle warn->open->closing and emit mines from the mouth', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.portals = [{ x: 480, y: 300, state: 'warn', t: 1.0, spawnT: 0, spawnsLeft: 4, phase: 0 }];
  s.mines = [];
  const seen = new Set();
  for (let i = 0; i < 60 * 6 && s.portals.length; i++) { G.update(1 / 60); if (s.portals[0]) seen.add(s.portals[0].state); }
  assert.ok(seen.has('open'), 'portal opened');
  assert.ok(s.mines.length > 0, 'portal emitted mines');
});

test('easy difficulty never opens a portal', () => {
  const G = boot().SY.nvGame; const s = play(G, 'easy');
  for (let i = 0; i < 60 * 30; i++) G.update(1 / 60);
  assert.equal(s.portals.length, 0, 'no portals on easy');
});

test('same daily seed -> identical portal layout (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    for (let i = 0; i < 60 * 30; i++) G.update(1 / 60);
    return JSON.stringify(st.portals.map(p => [Math.round(p.x), Math.round(p.y), p.state]));
  };
  assert.equal(run(), run());
});

test('a console drops a power-up + exactly one guaranteed data token when destroyed', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'console', x: 480, y: 300, r: 20, hp: 1, maxHp: 5, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.tokens = []; s.pows = [];
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.crates.length, 0, 'console destroyed');
  assert.equal(s.tokens.length, 1, 'exactly one data salvage token dropped');
  assert.equal(s.tokens[0].tier, 'data', 'the token is a data salvage tier');
  assert.ok(s.pows.length >= 1, 'dropped a power-up');
});

test('a crystal pod bursts a crystal cache (no mines) when destroyed', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'pod', x: 480, y: 300, r: 20, hp: 1, maxHp: 3, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.crystals = [];
  s.spawnT.mine = 999; s.spawnT.crystal = 999; // suppress timer spawns so counts are clean
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.crates.length, 0, 'pod destroyed');
  assert.ok(s.crystals.length >= 6 && s.crystals.length <= 8, 'crystal cache is 6-8 crystals');
  assert.ok(s.crystals.every((c) => typeof c.vx === 'number' && typeof c.r === 'number' && typeof c.phase === 'number'), 'crystals carry the required fields');
  assert.equal(s.mines.length, 0, 'pod releases no mines');
});

test('a hazard mimic releases homing mines plus consolation loot', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'mimic', x: 480, y: 300, r: 20, hp: 1, maxHp: 3, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.tokens = [];
  s.spawnT.mine = 999; // suppress the timer mine so only the mimic's mines count
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.crates.length, 0, 'mimic destroyed');
  assert.ok(s.mines.length >= 2 && s.mines.length <= 3, 'released 2-3 homing mines');
  assert.ok(s.tokens.length >= 1, 'dropped consolation loot tokens');
});

test('section-3 container sprites exist on the atlas (capsulePod/xContainer)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = { capsulePod: { x: 195, y: 390, w: 76, h: 82 }, xContainer: { x: 563, y: 390, w: 87, h: 82 } };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas (no sheet tag)`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
