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

test('the boss fires a heavy plasma orb (large, slow, aimed)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  // boss settled at its hover row, plasma timer due this frame
  s.boss = { x: 480, y: 128, ty: 128, r: 46, hp: 60, maxHp: 72, t: 1, burstT: 9, aimT: 9, plasmaT: 0.001, fireMul: 1, flash: 0, dying: 0, ringRot: 0 };
  s.player.x = 480; s.player.y = 420; s.ebullets = [];
  G.update(1 / 60);
  const orb = s.ebullets.find(b => b.plasma);
  assert.ok(orb, 'a plasma orb was fired');
  assert.ok(orb.r >= 12, 'plasma orb is large');
  const speed = Math.hypot(orb.vx, orb.vy);
  assert.ok(speed < 160, 'plasma orb is slow');
  assert.ok(orb.vy > 0, 'aimed toward the player below the boss');
});
