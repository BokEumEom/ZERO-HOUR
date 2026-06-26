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

// spawnCrystalCluster is private; drive it by forcing the crystal spawn timer
// (and clearing the field each frame) so many seeded clusters are produced.
test('crystal clusters occasionally spawn a seeded large gem', () => {
  const G = boot().SY.nvGame; const s = play(G);
  let sawBig = false;
  for (let i = 0; i < 400 && !sawBig; i++) {
    s.crystals = []; s.spawnT.crystal = 0; G.update(1 / 60);
    if (s.crystals.some((c) => c.big === true)) sawBig = true;
  }
  assert.equal(sawBig, true, 'a large gem should appear across many seeded clusters');
});

// A large gem is worth 40 (flat) into the crystals bucket; the +1 combo goes to
// the combo bucket. Normal crystals are flat 10. Start combo 0 → pickup makes it 1.
test('large gem awards 40 into crystals + the combo increment into combo', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crystals = [{ x: s.player.x, y: s.player.y, vx: 0, vy: 0, r: 12, phase: 0, big: true }];
  s.tokens = []; s.combo = 0; s.fx.X2 = 0; s.inSurge = false;
  s.breakdown.crystals = 0; s.breakdown.combo = 0; const before = s.score;
  G.update(1 / 60);
  assert.equal(s.crystals.length, 0, 'gem collected');
  assert.equal(s.breakdown.crystals, 40, 'large gem flat value = 40 into crystals');
  assert.equal(s.breakdown.combo, 1, 'combo increment (1) into combo bucket');
  assert.equal(s.score - before, 41, 'total = 40 + combo(1)');
});

// A normal crystal still scores flat 10 (regression on the flatBase split).
test('normal crystal still awards 10 into crystals', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crystals = [{ x: s.player.x, y: s.player.y, vx: 0, vy: 0, r: 7, phase: 0 }];
  s.tokens = []; s.combo = 0; s.fx.X2 = 0; s.inSurge = false;
  s.breakdown.crystals = 0; s.breakdown.combo = 0;
  G.update(1 / 60);
  assert.equal(s.breakdown.crystals, 10, 'normal crystal flat value = 10');
  assert.equal(s.breakdown.combo, 1, 'combo increment into combo bucket');
});

// Determinism: identical daily seed → identical big-gem placement pattern.
test('large-gem placement is deterministic for a fixed daily seed', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const s = G.state;
    const pat = [];
    for (let i = 0; i < 60 * 25; i++) { G.update(1 / 60); }
    for (const c of s.crystals) pat.push(c.big ? 1 : 0);
    return pat.join('');
  };
  assert.equal(run(), run(), 'same seed → same big-gem pattern');
});
