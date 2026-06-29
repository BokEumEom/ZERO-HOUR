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
function grab(G, s, type) {
  s.pows.push({ x: s.player.x, y: s.player.y, type, r: 12, life: 9, phase: 0, vy: 0 });
  G.update(1 / 60);
}

test('INTEL is an instant, out-of-bag pickup with meta', () => {
  const G = boot().SY.nvGame;
  assert.ok(G.POWER_META.INTEL, 'INTEL meta present');
  assert.equal(G.POWER_DURATION.INTEL, undefined, 'INTEL is instant (not a timed bag buff)');
});

test('collecting INTEL grants +250 into the loot bucket (instant, no timed fx)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fx.X2 = 0; s.tokens = [];
  const before = s.breakdown.loot;
  grab(G, s, 'INTEL');
  assert.equal(s.breakdown.loot - before, 250, 'INTEL adds 250 to the loot bucket');
  assert.equal(s.fx.INTEL, undefined, 'INTEL leaves no timed buff');
});

test('INTEL spawns gated to one at a time', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.pows = []; s.spawnT.intel = 0; s.timeLeft = 30; s.rng = () => 0.01; // force the gated roll
  G.update(1 / 60);
  assert.equal(s.pows.filter((o) => o.type === 'INTEL').length, 1, 'one INTEL spawned when the roll passes');
  s.spawnT.intel = 0; s.rng = () => 0.01;
  G.update(1 / 60);
  assert.equal(s.pows.filter((o) => o.type === 'INTEL').length, 1, 'no second INTEL while one exists');
});

test('INTEL pickup icon maps to the section-1 card sprite', () => {
  const SP = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites;
  const r = SP.powerIcons.INTEL;
  assert.ok(r, 'INTEL power icon present');
  assert.deepEqual({ x: r.x, y: r.y, w: r.w, h: r.h }, { x: 556, y: 44, w: 62, h: 72 }, 'INTEL icon rect');
});
