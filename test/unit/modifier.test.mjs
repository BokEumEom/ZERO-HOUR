import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' }
);

test('MODS exposes STANDARD + 4 modifiers with display names', () => {
  const G = boot().SY.nvGame;
  // spread into the host realm before deepEqual (sandbox-realm array vs host literal —
  // matches the prototype-mismatch workaround in sprites.test.mjs / game.test.mjs)
  assert.deepEqual([...G.MOD_KEYS], ['standard', 'mineRush', 'ironWarden', 'treasure', 'vanguard']);
  for (const k of G.MOD_KEYS) {
    assert.equal(typeof G.MODS[k].nameKo, 'string', k + ' has KO name');
    assert.equal(typeof G.MODS[k].nameEn, 'string', k + ' has EN name');
  }
});

test('combineDiff multiplies *Mul knobs, adds caps, replaces foes, is immutable', () => {
  const G = boot().SY.nvGame;
  const base = G.DIFF.normal;
  const out = G.combineDiff(base, G.MODS.mineRush);
  assert.equal(out.surgeMul, base.surgeMul * 1.5);
  assert.equal(out.mineCap, base.mineCap + 6);
  assert.equal(out.mineSpeedMul, base.mineSpeedMul * 1.1);
  assert.equal(out.spawnMul, base.spawnMul);
  assert.equal(out.foes, base.foes, 'mineRush keeps tier foes');
  assert.notEqual(out, base);
  assert.equal(G.DIFF.normal.mineCap, 12, 'base unchanged');
  assert.ok(Object.isFrozen(out), 'result frozen');
});

test('combineDiff: vanguard replaces foes and bumps turretCap', () => {
  const G = boot().SY.nvGame;
  const out = G.combineDiff(G.DIFF.normal, G.MODS.vanguard);
  assert.deepEqual({ ...out.foes }, { hunter: 2, charger: 2, shield: 1, laser: 1 });
  assert.equal(out.turretCap, G.DIFF.normal.turretCap + 1);
});

test('combineDiff: treasure/ironWarden scale lootMul; STANDARD is a true no-op', () => {
  const G = boot().SY.nvGame;
  assert.equal(G.DIFF.normal.lootMul, 1.0, 'tiers carry a neutral lootMul');
  assert.equal(G.combineDiff(G.DIFF.normal, G.MODS.treasure).lootMul, 1.8);
  assert.equal(G.combineDiff(G.DIFF.normal, G.MODS.treasure).spawnMul, G.DIFF.normal.spawnMul * 0.8);
  assert.equal(G.combineDiff(G.DIFF.normal, G.MODS.ironWarden).bossHpMul, G.DIFF.normal.bossHpMul * 1.4);
  assert.equal(G.combineDiff(G.DIFF.normal, G.MODS.ironWarden).bossFireMul, G.DIFF.normal.bossFireMul * 0.85);
  assert.deepEqual(G.combineDiff(G.DIFF.normal, G.MODS.standard), G.DIFF.normal);
});

test('previewModifier is deterministic per seed and uses a dedicated :mod sub-RNG', () => {
  const G = boot().SY.nvGame;
  const a = G.previewModifier('daily-2026-06-26');
  const b = G.previewModifier('daily-2026-06-26');
  assert.equal(a.key, b.key, 'same seed -> same modifier');
  assert.ok(G.MOD_KEYS.includes(a.key));
  assert.equal(a.nameEn, G.MODS[a.key].nameEn);
  assert.ok(G.MOD_KEYS.includes(G.previewModifier('free-abc123').key));
});

test('a daily date is identical worldwide (two independent boots agree)', () => {
  const k1 = boot().SY.nvGame.previewModifier('daily-2026-07-04').key;
  const k2 = boot().SY.nvGame.previewModifier('daily-2026-07-04').key;
  assert.equal(k1, k2);
});

test('modifier distribution covers all 5 keys across many seeds (uniform-ish)', () => {
  const G = boot().SY.nvGame;
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(G.previewModifier('free-seed-' + i).key);
  assert.equal(seen.size, 5, 'all five modifiers are reachable');
});

test("freshState composes s.diff and stores s.modifier matching the seed's preview", () => {
  const G = boot().SY.nvGame;
  G.start('free', 'normal');
  const s = G.state;
  assert.ok(s.modifier && G.MOD_KEYS.includes(s.modifier.key), 's.modifier set');
  assert.equal(s.modifier.key, G.previewModifier(s.seedStr).key);
  assert.deepEqual({ ...s.diff }, { ...G.combineDiff(G.DIFF.normal, G.MODS[s.modifier.key]) });
});

test('daily modifier is deterministic for the frozen date and survives into the result', () => {
  const sb = boot();
  const G = sb.SY.nvGame;
  const expected = G.previewModifier('daily-' + sb.SY.todayUTC()).key;
  G.start('daily');
  assert.equal(G.state.modifier.key, expected);
  let res = null;
  G.events.onGameOver = (r) => { res = r; };
  for (let i = 0; i < 60 * 80 && !res; i++) { G.state.player.hp = 0; G.update(1 / 60); }
  assert.ok(res, 'run ended');
  assert.equal(res.modifier.key, expected);
});

test('HARD + modifier stack: tier knobs and modifier knobs both apply', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'hard');
  const s = G.state;
  assert.deepEqual({ ...s.diff }, { ...G.combineDiff(G.DIFF.hard, G.MODS[s.modifier.key]) });
});
