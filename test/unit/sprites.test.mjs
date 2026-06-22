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
  // Note: A lives in a vm sandbox (cross-realm object), so spread into a
  // sandbox-side plain object before deepEqual (avoids prototype-mismatch trips).
  assert.deepEqual({ ...A.shielded }, { x: 1050, y: 826, w: 142, h: 142 });
  assert.deepEqual({ ...A.boosted }, { x: 907, y: 827, w: 109, h: 133 });
  assert.deepEqual({ ...A.damaged }, { x: 1209, y: 833, w: 122, h: 126 });
});
