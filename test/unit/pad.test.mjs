import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('the boost-pad rects exist on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = {
    padRing:  { x: 34, y: 392, w: 117, h: 95 },
    padArrow: { x: 152, y: 273, w: 74, h: 99 },
  };
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

test('flying over an armed pad grants fx.BOOST and disarms it', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fx.BOOST = 0;
  s.pads = [{ x: s.player.x, y: s.player.y, r: 30, life: 14, cd: 0, armed: true, phase: 0 }];
  G.update(1 / 60);
  assert.ok(s.fx.BOOST > 0, 'pad granted a boost');
  assert.equal(s.pads[0].armed, false, 'pad disarmed after use');
  assert.ok(s.pads[0].cd > 0, 'pad entered cooldown');
});

test('a disarmed pad re-arms after its cooldown', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.pads = [{ x: 60, y: 60, r: 30, life: 14, cd: 5, armed: false, phase: 0 }];
  for (let i = 0; i < 60 * 6; i++) G.update(1 / 60);
  assert.ok(s.pads.length === 1 && s.pads[0].armed, 'pad re-armed after cooldown');
});

test('a pad is removed at end of life', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.pads = [{ x: 60, y: 60, r: 30, life: 0.01, cd: 0, armed: true, phase: 0 }];
  G.update(1 / 60);
  assert.equal(s.pads.length, 0, 'expired pad removed');
});

test('same daily seed -> identical pad layout (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    const trace = [];
    for (let i = 0; i < 60 * 40; i++) {
      G.update(1 / 60);
      if (st.pads.length) trace.push(st.pads.map((pd) => `${Math.round(pd.x)},${Math.round(pd.y)}`).join(';'));
    }
    return trace.join('|');
  };
  const a = run();
  assert.equal(a, run(), 'identical pad layout for the same seed');
  assert.ok(a.length > 0, 'at least one pad spawned in 40s (not trivially empty)');
});
