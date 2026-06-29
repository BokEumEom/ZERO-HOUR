import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const load = () => loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites;

// verified, crop-tightened elements-sheet rects (assets/sprite-elements.png 1448×1086)
const EL_RECTS = {
  crystalTeal:  { x: 875,  y: 565, w: 98,  h: 187 },
  crystalAmber: { x: 872,  y: 787, w: 99,  h: 187 },
  crystalLarge: { x: 875,  y: 565, w: 98,  h: 187 },
  enemySmall:   { x: 1320, y: 174, w: 100, h: 86  },
  bulletTeal:   { x: 60,   y: 537, w: 26,  h: 102 },
  bulletPink:   { x: 277,  y: 541, w: 21,  h: 84  },
  burst:        { x: 82,   y: 810, w: 273, h: 223 },
};

test('swapped keys point at the elements sheet with verified rects', () => {
  const A = load().atlas;
  for (const [key, r] of Object.entries(EL_RECTS)) {
    assert.equal(A[key] && A[key].sheet, 'el', `${key} must be tagged sheet:'el'`);
    assert.deepEqual({ x: A[key].x, y: A[key].y, w: A[key].w, h: A[key].h }, r, `${key} rect`);
    assert.ok(
      A[key].x >= 0 && A[key].x + A[key].w <= 1448 && A[key].y >= 0 && A[key].y + A[key].h <= 1086,
      `${key} within sheet bounds`,
    );
  }
});

test('excluded keys stay on the atlas (no sheet tag)', () => {
  const A = load().atlas;
  for (const key of ['player', 'boss', 'bossCore', 'enemyMid', 'enemyBig', 'foeHunter', 'crystalBoss', 'beam', 'lootCrate']) {
    assert.equal(A[key] && A[key].sheet, undefined, `${key} must remain atlas (no sheet tag)`);
  }
});

test('draw()/drawFit() guard on the per-rect decode state (vector fallback in headless)', () => {
  const SP = load();
  assert.equal(SP.draw({}, 'crystalTeal', 0, 0, 20, 0), false, 'el key falls back when undecoded');
  assert.equal(SP.draw({}, 'boss', 0, 0, 20, 0), false, 'atlas key falls back when undecoded');
  assert.equal(SP.drawFit({}, 'player', 0, 0, 20, 20, 0), false, 'drawFit falls back when undecoded');
});
