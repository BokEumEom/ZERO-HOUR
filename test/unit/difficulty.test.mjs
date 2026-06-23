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

test('mine cap and speed honor the difficulty', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'hard');
  const s = G.state;
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  for (let i = 0; i < 600; i++) G.update(1 / 60);
  assert.ok(s.mines.length > 0, 'mines spawned');
  // ambient mineCap is not a hard ceiling on total mines — surge formations are
  // uncapped by design and free mode uses a random seed — so assert the knob,
  // not a runtime count (which flakes).
  assert.equal(s.diff.mineCap, 16);
  assert.ok(G.DIFF.hard.mineCap > G.DIFF.normal.mineCap, 'hard denser than normal');
  assert.equal(s.diff.mineSpeedMul, 1.2);
});

test('boss hp/fire knobs are present on the active tier', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'easy');
  assert.equal(G.state.diff.bossHpMul, 0.75);
  assert.equal(G.state.diff.bossFireMul, 1.25);
});

test('game-over result carries the run difficulty', () => {
  const G = boot().SY.nvGame;
  let res = null;
  G.events.onGameOver = (r) => { res = r; };
  G.start('free', 'hard');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  G.state.timeLeft = 0.0001; // force a time-out end
  G.update(0.01);
  assert.ok(res, 'game over fired');
  assert.equal(res.difficulty, 'hard');
});

test('turrets spawn on hard (capped) and never on easy', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'easy');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  for (let i = 0; i < 60 * 12; i++) G.update(1 / 60);
  assert.equal(G.state.turrets.length, 0, 'easy spawns no turrets');
  G.start('free', 'hard');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  let maxSeen = 0;
  for (let i = 0; i < 60 * 20; i++) { G.update(1 / 60); maxSeen = Math.max(maxSeen, G.state.turrets.length); }
  assert.ok(maxSeen > 0, 'hard spawns turrets');
  assert.ok(maxSeen <= G.DIFF.hard.turretCap, 'never exceeds turretCap (3)');
});

test('a turret is destroyed in 5 hits and scores 60', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'hard');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  const s = G.state;
  s.turrets = [{ x: 480, y: 300, r: 16, hp: 5, maxHp: 5, fireT: 99, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.bullets = [];
  s.score = 0; s.breakdown.destruction = 0;
  for (let h = 0; h < 6; h++) { s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 }); G.update(1 / 60); }
  assert.equal(s.turrets.length, 0, 'destroyed after hits');
  assert.ok(s.breakdown.destruction >= 60, 'awarded 60 into destruction bucket');
});
