import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const load = () => loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites;

test('pickHullFrame maps player state to the right hull frame', () => {
  const SP = load();
  const pick = SP.pickHullFrame;
  // fixtures use the adapter shape render.js passes: { shield: bool, hp: number, boost: s.fx.BOOST (0 when inactive) }
  assert.equal(pick({ shield: false, hp: 3, boost: 0 }), 'player', 'default');
  assert.equal(pick({ shield: false, hp: 3, boost: 1.5 }), 'boosted', 'boost flair');
  assert.equal(pick({ shield: false, hp: 1, boost: 0 }), 'damaged', 'last hull');
  assert.equal(pick({ shield: true, hp: 3, boost: 0 }), 'shielded', 'shield bubble');
});

test('pickHullFrame priority: shield > damaged > boosted', () => {
  const pick = load().pickHullFrame;
  assert.equal(pick({ shield: true, hp: 1, boost: 2 }), 'shielded', 'shield wins over all');
  assert.equal(pick({ shield: false, hp: 1, boost: 2 }), 'damaged', 'danger beats flair');
});

test('atlas exposes hull-state frames and renames shieldDome', () => {
  const A = load().atlas;
  assert.ok(A.shielded, 'shielded rect exists');
  assert.ok(A.boosted, 'boosted rect exists');
  assert.ok(A.damaged, 'damaged rect exists');
  assert.equal(A.shieldDome, undefined, 'old shieldDome key removed');
  // Note: A lives in a vm sandbox (cross-realm object), so we compare properties
  // individually rather than using deepStrictEqual (which fails on prototype mismatch).
  const r = A.shielded;
  assert.equal(r.x, 1050); assert.equal(r.y, 826);
  assert.equal(r.w, 142);  assert.equal(r.h, 142);
});
