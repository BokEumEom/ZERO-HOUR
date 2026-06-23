import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(['js/store.js', 'js/games/neonvortex/game.js'], { nowIso: '2026-03-01T00:30:00Z' });

test('DIFF table exposes easy/normal/hard knobs', () => {
  const G = boot().SY.nvGame;
  const D = G.DIFF;
  assert.ok(D.easy && D.normal && D.hard, 'three tiers');
  assert.equal(D.normal.spawnMul, 1.0);
  assert.equal(D.normal.mineCap, 12);
  assert.ok(D.hard.mineCap > D.easy.mineCap, 'hard denser than easy');
  assert.ok(D.hard.bossFireMul < D.normal.bossFireMul, 'hard boss fires faster');
});

test('freshState wires the selected difficulty; unknown falls back to normal', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'hard');
  assert.equal(G.state.difficulty, 'hard');
  assert.equal(G.state.diff.mineCap, G.DIFF.hard.mineCap);
  G.start('free', 'bogus');
  assert.equal(G.state.difficulty, 'normal', 'unknown -> normal');
});

test('daily is always Normal regardless of requested difficulty (fairness)', () => {
  const G = boot().SY.nvGame;
  G.start('daily', 'hard');
  assert.equal(G.state.difficulty, 'normal');
  G.start('daily', 'easy');
  assert.equal(G.state.difficulty, 'normal');
  G.start('daily', undefined);
  assert.equal(G.state.difficulty, 'normal');
});
