import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('arcNode rect exists on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = { arcNode: { x: 1289, y: 149, w: 140, h: 84 } };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}
function clearHazards(s) {
  s.boss = null; s.mines = []; s.rocks = []; s.turrets = []; s.foes = []; s.ebullets = []; s.portals = [];
}

test('arc warn->active->idle state transitions', () => {
  const G = boot().SY.nvGame; const s = play(G);
  // inject a warn arc manually
  s.arcs = [{ x: 300, y: 300, r: 52, state: 'warn', t: 1.0, phase: 0, life: 13 }];
  // run through warn duration (1.0s)
  const DT = 1 / 60;
  let frameCount = 0;
  while (s.arcs[0] && s.arcs[0].state === 'warn' && frameCount < 600) {
    G.update(DT); frameCount++;
  }
  assert.ok(s.arcs[0] && s.arcs[0].state === 'active', 'transitions to active after warn');
  while (s.arcs[0] && s.arcs[0].state === 'active' && frameCount < 1200) {
    G.update(DT); frameCount++;
  }
  assert.ok(s.arcs[0] && s.arcs[0].state === 'idle', 'transitions to idle after active');
});

test('arc active phase damages player at center, not at distance; warn and idle do NOT damage', () => {
  // --- active damages at center ---
  let G = boot().SY.nvGame; let s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp0 = s.player.hp;
  s.arcs = [{ x: s.player.x, y: s.player.y, r: 52, state: 'active', t: 1.3, phase: 0, life: 13 }];
  G.update(1 / 60);
  assert.ok(s.player.hp < hp0, 'player at arc center takes damage during active');

  // --- active does NOT damage far away ---
  G = boot().SY.nvGame; s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp1 = s.player.hp;
  s.arcs = [{ x: s.player.x + 500, y: s.player.y + 500, r: 52, state: 'active', t: 1.3, phase: 0, life: 13 }];
  G.update(1 / 60);
  assert.equal(s.player.hp, hp1, 'player far from arc center is unharmed during active');

  // --- warn does NOT damage at center ---
  G = boot().SY.nvGame; s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp2 = s.player.hp;
  s.arcs = [{ x: s.player.x, y: s.player.y, r: 52, state: 'warn', t: 1.0, phase: 0, life: 13 }];
  G.update(1 / 60);
  assert.equal(s.player.hp, hp2, 'player at arc center is NOT damaged during warn');

  // --- idle does NOT damage at center ---
  G = boot().SY.nvGame; s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp3 = s.player.hp;
  s.arcs = [{ x: s.player.x, y: s.player.y, r: 52, state: 'idle', t: 2.4, phase: 0, life: 13 }];
  G.update(1 / 60);
  assert.equal(s.player.hp, hp3, 'player at arc center is NOT damaged during idle');
});

test('arc is removed at end of life', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.arcs = [{ x: 300, y: 200, r: 52, state: 'idle', t: 2.4, phase: 0, life: 0.01 }];
  G.update(1 / 60);
  assert.equal(s.arcs.length, 0, 'expired arc removed');
});

test('easy difficulty never spawns an arc', () => {
  const G = boot().SY.nvGame; const s = play(G, 'easy');
  for (let i = 0; i < 60 * 40; i++) G.update(1 / 60);
  assert.equal(s.arcs.length, 0, 'no arcs on easy');
});

test('same daily seed -> identical arc trace (non-empty)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    // Give the player enough HP to survive through the arc spawn window (spawnT.arc=19).
    // This doesn't affect the seeded stream — hp is state, not rng.
    for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
    st.player.hp = 999;
    const trace = [];
    for (let i = 0; i < 60 * 40; i++) {
      G.update(1 / 60);
      if (st.arcs.length) trace.push(st.arcs.map((ar) => `${Math.round(ar.x)},${Math.round(ar.y)},${ar.state}`).join(';'));
    }
    return trace.join('|');
  };
  const a = run();
  assert.equal(a, run(), 'identical arc trace for the same seed');
  assert.ok(a.length > 0, 'at least one arc spawned in 40s (not trivially empty)');
});
