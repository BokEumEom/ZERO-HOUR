import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('the flail-ball rect exists on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  assert.ok(A.flailBall, 'flailBall rect exists');
  assert.equal(A.flailBall.sheet, undefined, 'flailBall stays on the atlas');
  assert.deepEqual({ x: A.flailBall.x, y: A.flailBall.y, w: A.flailBall.w, h: A.flailBall.h },
    { x: 835, y: 64, w: 46, h: 54 }, 'flailBall rect');
});
