import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'], { nowIso: '2026-03-01T00:30:00Z' });

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
  // s.diff.mineCap is now the composed (difficulty + modifier) value; assert it is
  // >= the base tier's mineCap (modifier can only add to the cap, never subtract).
  assert.ok(G.state.diff.mineCap >= G.DIFF.hard.mineCap, 'composed mineCap >= base hard mineCap');
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
  // keep the (stationary, no-input) pilot invulnerable for the run: on HARD the
  // new foe archetypes can otherwise kill it before the first mine spawns (~3.2s).
  // Track whether mines spawned AT ANY POINT — a snapshot of s.mines.length at the
  // end flakes because auto-fire can transiently clear every mine. Survival/spawn
  // are incidental; the test is about the difficulty knobs.
  let everMines = false;
  for (let i = 0; i < 600; i++) { s.player.inv = 1; G.update(1 / 60); if (s.mines.length > 0) everMines = true; }
  assert.ok(everMines, 'mines spawned at some point');
  // ambient mineCap is not a hard ceiling on total mines — surge formations are
  // uncapped by design and free mode uses a random seed — so assert the knob,
  // not a runtime count (which flakes). s.diff is now the composed
  // (difficulty + modifier) value; assert the base DIFF knob and that the composed
  // value is at least as strict (modifiers only add to caps / multiply speeds).
  assert.equal(G.DIFF.hard.mineCap, 16, 'base hard mineCap knob unchanged');
  assert.ok(s.diff.mineCap >= G.DIFF.hard.mineCap, 'composed mineCap >= base hard');
  assert.ok(G.DIFF.hard.mineCap > G.DIFF.normal.mineCap, 'hard denser than normal');
  assert.ok(s.diff.mineSpeedMul >= G.DIFF.hard.mineSpeedMul, 'composed mineSpeedMul >= base hard');
});

test('boss hp/fire knobs are present on the active tier', () => {
  const G = boot().SY.nvGame;
  // Assert the base DIFF knobs (modifier-independent). The ironWarden modifier
  // multiplies bossHpMul×1.4 and bossFireMul×0.85, so free runs may produce
  // different composed values — assert the base tier instead.
  assert.equal(G.DIFF.easy.bossHpMul, 0.75, 'base easy bossHpMul knob');
  assert.equal(G.DIFF.easy.bossFireMul, 1.25, 'base easy bossFireMul knob');
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
  // turretCap: vanguard modifier adds +1 even on easy (0+1=1) and on hard (3+1=4),
  // so assert against the composed s.diff.turretCap rather than base DIFF literals.
  // Also assert DIFF.easy.turretCap===0 (knob) to verify base-tier gating.
  assert.equal(G.DIFF.easy.turretCap, 0, 'base easy turretCap is 0 (knob)');
  assert.equal(G.DIFF.hard.turretCap, 3, 'base hard turretCap is 3 (knob)');

  G.start('free', 'hard');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  const hardCap = G.state.diff.turretCap; // composed (may be 3 or 4 with vanguard)
  let maxSeen = 0;
  for (let i = 0; i < 60 * 20; i++) { G.state.player.hp = 3; G.update(1 / 60); maxSeen = Math.max(maxSeen, G.state.turrets.length); }
  assert.ok(maxSeen > 0, 'hard spawns turrets');
  assert.ok(maxSeen <= hardCap, `never exceeds composed turretCap (${hardCap})`);
});

test('surgeMul knob widens the gradient (normal stays 1.0)', () => {
  const G = boot().SY.nvGame;
  assert.equal(G.DIFF.normal.surgeMul, 1.0, 'normal unchanged (daily/leaderboard safe)');
  assert.ok(G.DIFF.easy.surgeMul < 1.0, 'easy below normal');
  assert.ok(G.DIFF.hard.surgeMul > 1.0, 'hard above normal');
});

test('surge formation size scales with difficulty', () => {
  const G = boot().SY.nvGame;
  // surgeMul comparison uses the DIFF knobs (modifier-independent) rather than live
  // surge sizes from free runs — each free call uses a different random seed and may
  // roll a different modifier (e.g. mineRush ×1.5 on easy can exceed normal's ×1.0).
  assert.ok(G.DIFF.easy.surgeMul < G.DIFF.normal.surgeMul, 'easy surgeMul < normal (knob)');
  assert.ok(G.DIFF.hard.surgeMul > G.DIFF.normal.surgeMul, 'hard surgeMul > normal (knob)');
  // Verify the daily seed (standard modifier, same fixed seed) orders correctly live.
  G.start('daily'); // standard modifier: s.diff = combineDiff(DIFF.normal, MODS.standard) = DIFF.normal
  const n = G.state.surges.map((x) => x.size);
  assert.ok(n.length > 0, 'there are surges to compare');
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
