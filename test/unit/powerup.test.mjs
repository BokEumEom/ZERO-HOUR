import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });

function playing(G) {
  G.start('free', 'normal');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}
// drop a power-up of `type` onto the player and step one frame to apply it
function pickUp(G, s, type) {
  s.pows.push({ x: s.player.x, y: s.player.y, type, r: 12, life: 9, phase: 0, vy: 0 });
  G.update(1 / 60);
}

test('G.POWER_DURATION exposes the new per-power durations', () => {
  const G = boot().SY.nvGame;
  assert.equal(G.POWER_DURATION.MAGNET, 9);
  assert.equal(G.POWER_DURATION.SLOW, 6);
  assert.equal(G.POWER_DURATION.X2, 9);
  assert.equal(G.POWER_DURATION.BOOST, 8);
  assert.equal(G.POWER_DURATION.SPREAD, 9);
});

test('picking up a power-up sets its base duration (minus the one applied frame)', () => {
  const G = boot().SY.nvGame;
  const s = playing(G);
  s.fx.X2 = 0;
  pickUp(G, s, 'X2');
  // base 9, one frame elapsed -> ~8.98
  assert.ok(s.fx.X2 > 8.9 && s.fx.X2 <= 9, `X2 ~= base after pickup, got ${s.fx.X2}`);
});

test('re-picking a power-up extends remaining time, capped at 2x base', () => {
  const G = boot().SY.nvGame;
  const s = playing(G);
  s.fx.X2 = 5;            // 5s remaining
  pickUp(G, s, 'X2');     // +9 -> 14, then minus a frame
  assert.ok(s.fx.X2 > 13.9 && s.fx.X2 <= 14, `extends to ~14, got ${s.fx.X2}`);
  s.fx.X2 = 17;           // already near the cap
  pickUp(G, s, 'X2');     // 17+9=26 -> capped at 18, minus a frame
  assert.ok(s.fx.X2 <= 18 && s.fx.X2 > 17.9, `capped at 2x base (18), got ${s.fx.X2}`);
});
