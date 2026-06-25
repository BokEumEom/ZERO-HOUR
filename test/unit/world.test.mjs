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

test('a console drops a power-up (not loot tokens) when destroyed', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'console', x: 480, y: 300, r: 20, hp: 1, maxHp: 5, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.tokens = []; s.pows = [];
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.crates.length, 0, 'console destroyed');
  assert.equal(s.tokens.length, 0, 'no loot tokens dropped');
  assert.ok(s.pows.length >= 1, 'dropped a power-up');
});
