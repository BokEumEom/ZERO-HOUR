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
function clearHazards(s) {
  s.boss = null; s.mines = []; s.rocks = []; s.turrets = []; s.foes = []; s.ebullets = []; s.portals = [];
}

test('hazardStripe rect exists on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  assert.ok(A.hazardStripe, 'hazardStripe rect exists');
  assert.equal(A.hazardStripe.sheet, undefined, 'hazardStripe stays on the atlas (no sheet tag)');
  assert.deepEqual(
    { x: A.hazardStripe.x, y: A.hazardStripe.y, w: A.hazardStripe.w, h: A.hazardStripe.h },
    { x: 363, y: 523, w: 69, h: 79 },
    'hazardStripe rect coords'
  );
});

test('a sweeping barrier cycles warn -> sweep and pos moves during sweep', () => {
  const G = boot().SY.nvGame; const s = play(G);
  clearHazards(s);
  // inject a horizontal barrier starting at top edge (dir=1 = moving down)
  const initialPos = 70;
  s.barriers = [{ orient: 'h', pos: initialPos, half: 22, dir: 1, speed: 120, state: 'warn', t: 1.2, phase: 0 }];
  const seen = new Set();
  let sweepFrames = 0;
  let finalPos = initialPos;
  for (let i = 0; i < 60 * 6; i++) {
    const ba = s.barriers[0];
    if (!ba) break;
    seen.add(ba.state);
    if (ba.state === 'sweep') { sweepFrames++; finalPos = ba.pos; }
    G.update(1 / 60);
  }
  assert.ok(seen.has('warn'), 'barrier passes through warn state');
  assert.ok(seen.has('sweep'), 'barrier transitions to sweep state');
  // after multiple sweep frames, pos must have moved from the initial position
  assert.ok(sweepFrames > 0, 'barrier spent at least one frame in sweep');
  assert.ok(finalPos > initialPos, 'barrier pos advanced during sweep (dir=1, speed=120)');
});

test('a sweeping barrier on the player perpendicular line damages; off the line does not', () => {
  // ON the line: barrier at same y as player (horizontal orient, dir doesn't matter for this test)
  let G = boot().SY.nvGame; let s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp0 = s.player.hp;
  // place a sweeping barrier exactly at the player's y
  s.barriers = [{ orient: 'h', pos: s.player.y, half: 22, dir: 1, speed: 120, state: 'sweep', t: 5, phase: 0 }];
  G.update(1 / 60);
  assert.ok(s.player.hp < hp0, 'player on the barrier line takes damage');

  // OFF the line
  G = boot().SY.nvGame; s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp1 = s.player.hp;
  s.barriers = [{ orient: 'h', pos: s.player.y + 200, half: 22, dir: 1, speed: 120, state: 'sweep', t: 5, phase: 0 }];
  G.update(1 / 60);
  assert.equal(s.player.hp, hp1, 'player far off the barrier line is unharmed');
});

test('a sweeping barrier is removed when it sweeps off-screen', () => {
  const G = boot().SY.nvGame; const s = play(G);
  const GW = G.W, GH = G.H; // use game constants (960 x 600)
  clearHazards(s);
  // barrier just past the bottom edge heading further down — should be removed this frame
  s.barriers = [{ orient: 'h', pos: GH + 5, half: 22, dir: 1, speed: 120, state: 'sweep', t: 99, phase: 0 }];
  G.update(1 / 60); // one frame pushes it to GH + 5 + 120/60 = GH + 7 > GH + 30? No, 7 < 30.
  // Use a position that clears the +30 margin in one frame:  GH + 25 -> GH + 25 + 2 = GH + 27, still < 30.
  // Instead start beyond GH + 30 directly:
  s.barriers = [{ orient: 'h', pos: GH + 31, half: 22, dir: 1, speed: 120, state: 'sweep', t: 99, phase: 0 }];
  G.update(1 / 60);
  assert.equal(s.barriers.length, 0, 'off-screen barrier (already > H+30) is spliced out immediately');
});

test('easy difficulty never spawns a sweeping barrier', () => {
  const G = boot().SY.nvGame; const s = play(G, 'easy');
  for (let i = 0; i < 60 * 40; i++) G.update(1 / 60);
  assert.equal(s.barriers.length, 0, 'no barriers on easy');
});

test('same daily seed -> identical barrier trace (non-empty fairness check)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    const trace = [];
    for (let i = 0; i < 60 * 60; i++) {
      // Keep the player alive so barriers can spawn (player dying at ~13s stops spawns).
      // This does NOT affect the seeded RNG stream — inv is cosmetic/gating only.
      if (G.phase === 'playing') { st.player.inv = 1; st.player.hp = 3; }
      G.update(1 / 60);
      if (st.barriers.length) {
        trace.push(st.barriers.map((ba) => `${ba.orient}${Math.round(ba.pos)}`).join(';'));
      }
    }
    return trace.join('|');
  };
  const a = run();
  assert.equal(a, run(), 'identical barrier trajectory for the same seed');
  assert.ok(a.length > 0, 'at least one barrier spawned in 60s (trace is not trivially empty)');
});
