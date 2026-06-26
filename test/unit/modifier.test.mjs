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
