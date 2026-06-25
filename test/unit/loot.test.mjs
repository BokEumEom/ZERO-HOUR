import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}

test('crates spawn (seeded, capped) and carry hp', () => {
  const G = boot().SY.nvGame; const s = play(G);
  let max = 0;
  for (let i = 0; i < 60 * 30; i++) { G.update(1 / 60); max = Math.max(max, s.crates.length); }
  assert.ok(max > 0, 'crates spawned');
  assert.ok(max <= 2, 'crate cap 2');
  for (const c of s.crates) assert.ok(c.hp > 0 && c.r > 0);
});

test('breaking a crate drops loot tokens and credits the loot bucket', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'crate', x: 480, y: 300, r: 20, hp: 1, maxHp: 4, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.tokens = [];
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 }); G.update(1 / 60);
  assert.equal(s.crates.length, 0, 'crate destroyed');
  assert.ok(s.tokens.length >= 1, 'loot tokens dropped');
});

test('collecting a token adds its tier value into the loot bucket', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crystals = []; s.tokens = [{ x: s.player.x, y: s.player.y, vx: 0, vy: 0, r: 8, phase: 0, tier: 'amber' }];
  s.breakdown.loot = 0; const before = s.score;
  G.update(1 / 60);
  assert.equal(s.tokens.length, 0, 'token collected');
  assert.equal(s.breakdown.loot, 50, 'amber tier = 50 into loot');
  assert.equal(s.score - before, 50);
});

test('same daily seed → identical crate layout (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    for (let i = 0; i < 60 * 20; i++) G.update(1 / 60);
    return JSON.stringify(st.crates.map((c) => [c.kind, Math.round(c.x), Math.round(c.y)]));
  };
  assert.equal(run(), run(), 'daily crates identical across same-seed runs');
});
