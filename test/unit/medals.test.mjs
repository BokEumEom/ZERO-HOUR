// Neon Vortex medals & tiers — pure logic (no DOM/IDB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const M = () => loadModules(['js/games/neonvortex/medals.js']).SY.nvMedals;
const run = (o) => Object.assign({ score: 0, maxCombo: 0, bossDown: false, noHit: false }, o);

test('rank() maps score to the right tier at each threshold boundary', () => {
  const { rank } = M();
  assert.equal(rank(0).id, 'recruit');
  assert.equal(rank(1499).id, 'recruit');
  assert.equal(rank(1500).id, 'pilot');
  assert.equal(rank(2999).id, 'pilot');
  assert.equal(rank(3000).id, 'ace');
  assert.equal(rank(4999).id, 'ace');
  assert.equal(rank(5000).id, 'legend');
  assert.equal(rank(99999).id, 'legend');
});

test('evalRun awards CORE WARDEN for a boss kill', () => {
  const { evalRun } = M();
  assert.ok(evalRun(run({ bossDown: true })).includes('boss'));
  assert.ok(!evalRun(run({ bossDown: false })).includes('boss'));
});

test('evalRun awards NO HIT only on a damage-free run', () => {
  const { evalRun } = M();
  assert.ok(evalRun(run({ noHit: true })).includes('nohit'));
  assert.ok(!evalRun(run({ noHit: false })).includes('nohit'));
});

test('evalRun awards FLAWLESS only when no-hit AND boss defeated', () => {
  const { evalRun } = M();
  assert.ok(evalRun(run({ noHit: true, bossDown: true })).includes('flawless'));
  assert.ok(!evalRun(run({ noHit: true, bossDown: false })).includes('flawless'));
  assert.ok(!evalRun(run({ noHit: false, bossDown: true })).includes('flawless'));
});

test('evalRun awards COMBO ×25 at the threshold', () => {
  const { evalRun } = M();
  assert.ok(!evalRun(run({ maxCombo: 24 })).includes('combo25'));
  assert.ok(evalRun(run({ maxCombo: 25 })).includes('combo25'));
});

test('evalRun awards LEGEND at the legend score tier', () => {
  const { evalRun } = M();
  assert.ok(!evalRun(run({ score: 4999 })).includes('legend'));
  assert.ok(evalRun(run({ score: 5000 })).includes('legend'));
});

test('evalRun awards WEEK STREAK from ctx.streak >= 7', () => {
  const { evalRun } = M();
  assert.ok(!evalRun(run({}), { streak: 6 }).includes('streak7'));
  assert.ok(evalRun(run({}), { streak: 7 }).includes('streak7'));
  assert.ok(!evalRun(run({})).includes('streak7')); // no ctx -> no streak medal
});

test('a clean low-scoring run earns no medals', () => {
  const { evalRun } = M();
  assert.equal(evalRun(run({ score: 100, maxCombo: 3 }), { streak: 0 }).length, 0);
});

test('every evalRun id has a matching MEDALS definition', () => {
  const m = M();
  const defined = new Set(m.MEDALS.map((x) => x.id));
  const allEarned = m.evalRun(run({ score: 9999, maxCombo: 99, bossDown: true, noHit: true }), { streak: 9 });
  for (const id of allEarned) assert.ok(defined.has(id), `medal '${id}' has no definition`);
  assert.equal(allEarned.length, m.MEDALS.length, 'a perfect run earns the whole set');
});
