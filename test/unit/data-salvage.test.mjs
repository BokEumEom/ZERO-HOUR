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
// Break one crate of `kind` at (480,300) with a forced rng; return dropped token tiers.
function dropTiers(kind, rngVal) {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind, x: 480, y: 300, r: kind === 'chest' ? 24 : 20, hp: 1, maxHp: 6, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.tokens = [];
  s.rng = () => rngVal; // force the tier roll deterministically
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  return s.tokens.map((t) => t.tier);
}

test('data/core tokens are worth 150/250 into the loot bucket', () => {
  const G = boot().SY.nvGame; const s = play(G);
  const p = s.player;
  for (const [tier, val] of [['data', 150], ['core', 250]]) {
    s.tokens = [{ x: p.x, y: p.y, vx: 0, vy: 0, r: 10, phase: 0, tier }];
    s.fx.X2 = 0;
    const before = s.breakdown.loot;
    G.update(1 / 60);
    assert.equal(s.breakdown.loot - before, val, `${tier} loot value`);
    assert.equal(s.tokens.length, 0, `${tier} token collected`);
  }
});

test('a chest jackpot can drop core (roll<0.05) and data (0.05<=roll<0.17)', () => {
  assert.ok(dropTiers('chest', 0.01).includes('core'), 'chest drops core');
  assert.ok(dropTiers('chest', 0.10).includes('data'), 'chest drops data');
});

test('crates and canisters never drop data/core salvage', () => {
  for (const kind of ['crate', 'canister']) {
    for (const rv of [0.01, 0.10, 0.5, 0.99]) {
      const tiers = dropTiers(kind, rv);
      assert.ok(!tiers.some((t) => t === 'data' || t === 'core'), `${kind}@${rv} has no salvage`);
    }
  }
});

test('breaking a console yields exactly one guaranteed data token', () => {
  assert.deepEqual(dropTiers('console', 0.5), ['data'], 'console drops one data token');
});
