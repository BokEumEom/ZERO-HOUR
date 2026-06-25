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

test('auto-fire exposes the current target for the reticle (display-only)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.fireCd = 0; s.aimTarget = null;
  s.mines = [{ x: s.player.x + 150, y: s.player.y, r: 11, hp: 5, speed: 0, phase: 0, flash: 0, vx: 0, vy: 0, entryT: 0 }];
  s.rocks = []; s.turrets = []; s.foes = []; s.crates = []; s.boss = null; s.elite = null;
  G.update(1 / 60);
  assert.ok(s.aimTarget, 'aimTarget set to the nearest enemy');
  assert.equal(s.aimTarget.x, s.player.x + 150, 'targets the in-range mine');
});

test('no target -> aimTarget is null (reticle hidden)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.fireCd = 0; s.aimTarget = {};
  s.mines = []; s.rocks = []; s.turrets = []; s.foes = []; s.crates = []; s.boss = null; s.elite = null;
  G.update(1 / 60);
  assert.equal(s.aimTarget, null, 'no enemy -> no reticle target');
});

test('boss-down arms the MISSION CLEAR banner timer (display-only)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.boss = { x: 480, y: 128, ty: 128, r: 46, hp: 0, maxHp: 72, t: 1, burstT: 9, aimT: 9, fireMul: 1, flash: 0, dying: 0.001, ringRot: 0 };
  s.clearT = 0;
  G.update(1 / 60);
  assert.ok(s.clearT > 2, 'MISSION CLEAR timer armed on boss-down');
  assert.equal(s.bossDown, true, 'boss recorded as downed');
});
