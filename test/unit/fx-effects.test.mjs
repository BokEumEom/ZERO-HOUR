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

test('G1 effect rects exist on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = {
    fxWarpRing: { x: 745, y: 398, w: 151, h: 98 },
    fxBurstLg:  { x: 1241, y: 396, w: 136, h: 101 },
    fxBurstMd:  { x: 1088, y: 414, w: 102, h: 79 },
    fxBurstSm:  { x: 1236, y: 288, w: 81, h: 73 },
    fxSwoosh:   { x: 1335, y: 295, w: 75, h: 78 },
    fxDebris:   { x: 954, y: 422, w: 84, h: 62 },
  };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas (no sheet tag)`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});

test('a destroyed crate emits a warm fxBurstSm flash', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'crate', x: 480, y: 300, r: 20, hp: 1, maxHp: 3, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.blasts = [];
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.crates.length, 0, 'crate destroyed');
  assert.ok(s.blasts.some((b) => b.key === 'fxBurstSm'), 'crate break uses the small warm burst');
});

test('the boss entrance spawns a warp-in ring', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.warps = []; s.boss = null; s.bossDown = false;
  s.timeLeft = 19; // boss spawns at duration>=40 && timeLeft<=20
  G.update(1 / 60);
  assert.ok(s.boss, 'boss spawned');
  assert.ok(s.warps.length >= 1, 'a warp ring was emitted on entrance');
});

test('a destroyed crate scatters debris', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'crate', x: 480, y: 300, r: 20, hp: 1, maxHp: 3, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.debris = [];
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.ok(s.debris.length >= 1, 'crate break scattered debris');
});
