import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('R6 final-decor rects exist on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = {
    glassTube:   { x: 620, y: 269, w: 54, h: 105 },
    antennaArr:  { x: 436, y: 386, w: 59, h: 101 },
    testTubeA:   { x: 247, y: 614, w: 16, h: 65 },
    testTubeB:   { x: 299, y: 614, w: 31, h: 69 },
    decoBracket: { x: 517, y: 631, w: 140, h: 49 },
    redCorner:   { x: 461, y: 522, w: 76, h: 81 },
    bossConsole: { x: 754, y: 531, w: 81, h: 73 },
    debris2:     { x: 730, y: 159, w: 100, h: 67 },
  };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
