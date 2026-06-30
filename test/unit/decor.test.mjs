import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('R1 decor rects exist on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = {
    decoHexFrame: { x: 148, y: 527, w: 75, h: 68 },
    decoChip:     { x: 363, y: 616, w: 108, h: 67 },
    decoConduit:  { x: 38, y: 623, w: 156, h: 29 },
    miniIcon:     { x: 1357, y: 881, w: 54, h: 47 },
  };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
