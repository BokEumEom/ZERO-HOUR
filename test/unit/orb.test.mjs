import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const MODULES = [
  'js/store.js',
  'js/games/neonvortex/foes.js',
  'js/games/neonvortex/elite.js',
  'js/games/neonvortex/game.js',
];
const boot = () => loadModules(MODULES, { nowIso: '2026-03-01T00:30:00Z' });

function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}

function clearHazards(s) {
  s.boss = null; s.mines = []; s.rocks = []; s.turrets = []; s.foes = [];
  s.ebullets = []; s.portals = []; s.orbs = [];
}

// (a) sprite atlas rects for orbBig and orbSmall exist, no sheet tag
test('orbBig and orbSmall rects exist on the atlas (no sheet tag)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = {
    orbBig:   { x: 1134, y: 147, w: 51, h: 53 },
    orbSmall: { x: 1244, y: 187, w: 30, h: 30 },
  };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas (no sheet tag)`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect coords`);
  }
});

// (b) destroying a big orb splits into 2-3 small orbs
test('destroying a big orb splits into 2-3 small orbs', () => {
  const G = boot().SY.nvGame; const s = play(G);
  clearHazards(s);
  // inject one big orb at a known position
  s.orbs.push({ x: 480, y: 300, vx: 0, vy: 0, r: 18, hp: 1, maxHp: 3,
    tier: 'big', rot: 0, spin: 0, flash: 0 });
  // fire a bullet into it
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  // big orb should be gone, small orbs should have appeared
  assert.equal(s.orbs.filter((o) => o.tier === 'big').length, 0, 'big orb removed');
  const smalls = s.orbs.filter((o) => o.tier === 'small');
  assert.ok(smalls.length >= 2 && smalls.length <= 3, `split produced ${smalls.length} small orbs (expected 2-3)`);
});

// (c) destroying a small orb does NOT split and awards score
test('destroying a small orb does not split and awards score', () => {
  const G = boot().SY.nvGame; const s = play(G);
  clearHazards(s);
  const score0 = s.score;
  // inject one small orb
  s.orbs.push({ x: 480, y: 300, vx: 0, vy: 0, r: 10, hp: 1, maxHp: 1,
    tier: 'small', rot: 0, spin: 0, flash: 0 });
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.orbs.length, 0, 'small orb removed, no split');
  assert.ok(s.score > score0, 'score increased on small orb destroy');
});

// (d) an orb overlapping the player deals damage (contact damage)
test('an orb overlapping the player damages the player', () => {
  const G = boot().SY.nvGame; const s = play(G);
  clearHazards(s);
  s.player.inv = 0; s.shield = false;
  const hp0 = s.player.hp;
  // place a small orb right on the player
  s.orbs.push({ x: s.player.x, y: s.player.y, vx: 0, vy: 0, r: 10, hp: 1, maxHp: 1,
    tier: 'small', rot: 0, spin: 0, flash: 0 });
  // suppress spawn timers so nothing else spawns
  s.spawnT.orb = 999;
  G.update(1 / 60);
  assert.ok(s.player.hp < hp0 || s.player.inv > 0, 'player took damage or invincibility triggered');
});

// (e) orbs bounce and stay within arena bounds over time
test('orbs bounce and stay within arena bounds', () => {
  const G = boot().SY.nvGame; const s = play(G);
  clearHazards(s);
  const { W, H } = G;
  // push orb hard toward a wall
  s.orbs.push({ x: 35, y: 50, vx: -200, vy: 0, r: 18, hp: 3, maxHp: 3,
    tier: 'big', rot: 0, spin: 0, flash: 0 });
  s.spawnT.orb = 999;
  for (let i = 0; i < 60 * 3; i++) G.update(1 / 60);
  for (const o of s.orbs) {
    assert.ok(o.x >= 20 && o.x <= W - 20, `orb x=${o.x} within horizontal bounds`);
    assert.ok(o.y >= 30 && o.y <= H - 30, `orb y=${o.y} within vertical bounds`);
  }
});

// (f) same daily seed → identical orb trace (daily-fairness)
test('same daily seed -> identical orb trace (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    const trace = [];
    for (let i = 0; i < 60 * 30; i++) {
      G.update(1 / 60);
      if (st.orbs.length) {
        trace.push(st.orbs.map((o) => `${o.tier}${Math.round(o.x)},${Math.round(o.y)}`).join(';'));
      }
    }
    return trace.join('|');
  };
  const a = run();
  assert.equal(a, run(), 'identical orb trajectory for the same daily seed');
  assert.ok(a.length > 0, 'at least one orb spawned in 30s (non-empty trace)');
});
