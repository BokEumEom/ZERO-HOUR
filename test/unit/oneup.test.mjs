import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G) {
  G.start('free', 'normal');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}
function grab(G, s, type) {
  s.pows.push({ x: s.player.x, y: s.player.y, type, r: 12, life: 9, phase: 0, vy: 0 });
  G.update(1 / 60);
}

test('1UP has render/apply meta but no duration (instant, out of the timed bag)', () => {
  const G = boot().SY.nvGame;
  assert.ok(G.POWER_META['1UP'], '1UP meta exists for rendering/apply');
  assert.equal(G.POWER_DURATION['1UP'], undefined, 'no duration — it is instant, not a timed buff');
});

test('a 1UP restores a lost hull (capped at 3)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.hp = 1;
  grab(G, s, '1UP');
  assert.equal(s.player.hp, 2, 'healed +1');
});

test('a 1UP at full health converts to a shield (never wasted)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.hp = 3; s.shield = false;
  grab(G, s, '1UP');
  assert.equal(s.player.hp, 3, 'never exceeds 3');
  assert.equal(s.shield, true, 'full health -> shield');
});

test('1UP spawns rarely, seeded, capped at 1 on screen', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.hp = 99;
  let everTwo = false;
  for (let i = 0; i < 60 * 50; i++) {
    s.player.inv = 1; G.update(1 / 60);
    if (s.pows.filter(o => o.type === '1UP').length > 1) everTwo = true;
  }
  assert.equal(everTwo, false, 'never more than one 1UP on screen');
});

test('same daily seed -> identical 1UP spawn schedule (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const s = G.state;
    for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
    s.player.hp = 99; let firstAt = -1;
    for (let i = 0; i < 60 * 45; i++) {
      s.player.inv = 1; G.update(1 / 60);
      if (firstAt < 0 && s.pows.some(o => o.type === '1UP')) firstAt = i;
    }
    return firstAt;
  };
  const a = run(), b = run();
  assert.equal(a, b);
  assert.ok(a >= 0, 'a 1UP actually spawned (meaningful fairness check)');
});
