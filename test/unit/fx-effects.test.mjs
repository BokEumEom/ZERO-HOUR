import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

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
