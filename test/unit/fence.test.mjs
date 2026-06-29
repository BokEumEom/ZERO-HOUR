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

test('a laser fence cycles warn -> firing -> fade and is removed', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fences = [{ orient: 'h', pos: 300, state: 'warn', t: 1.1, phase: 0 }];
  const seen = new Set();
  for (let i = 0; i < 60 * 5 && s.fences.length; i++) { if (s.fences[0]) seen.add(s.fences[0].state); G.update(1 / 60); }
  assert.ok(seen.has('warn') && seen.has('firing') && seen.has('fade'), 'cycled all three states');
  assert.equal(s.fences.length, 0, 'fence removed after fade');
});

test('a firing fence on the player line damages; off the line does not', () => {
  let G = boot().SY.nvGame; let s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp0 = s.player.hp;
  s.fences = [{ orient: 'h', pos: s.player.y, state: 'firing', t: 1.4, phase: 0 }];
  G.update(1 / 60);
  assert.ok(s.player.hp < hp0, 'player on the beam line takes damage');

  G = boot().SY.nvGame; s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp1 = s.player.hp;
  s.fences = [{ orient: 'h', pos: s.player.y + 200, state: 'firing', t: 1.4, phase: 0 }];
  G.update(1 / 60);
  assert.equal(s.player.hp, hp1, 'player off the line is unharmed');
});

test('easy difficulty never spawns a laser fence', () => {
  const G = boot().SY.nvGame; const s = play(G, 'easy');
  for (let i = 0; i < 60 * 40; i++) G.update(1 / 60);
  assert.equal(s.fences.length, 0, 'no fences on easy');
});

test('same daily seed -> identical fence layout (fairness)', () => {
  // trace fences every frame they exist, so the check captures spawn events (not just the
  // end snapshot, which could be trivially empty).
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    const trace = [];
    for (let i = 0; i < 60 * 40; i++) {
      G.update(1 / 60);
      if (st.fences.length) trace.push(st.fences.map((f) => `${f.orient}${Math.round(f.pos)}`).join(';'));
    }
    return trace.join('|');
  };
  const a = run();
  assert.equal(a, run(), 'identical fence trajectory for the same seed');
  assert.ok(a.length > 0, 'at least one fence spawned in 40s (test is not trivially empty)');
});

test('fence atlas sprites exist (hazardNode/laserColumn)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = { hazardNode: { x: 335, y: 412, w: 60, h: 66 }, laserColumn: { x: 989, y: 150, w: 26, h: 87 } };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
