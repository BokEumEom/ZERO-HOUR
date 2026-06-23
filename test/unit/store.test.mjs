// Rubric #5 (UTC boundary / streak), #9 (injected values are fixed-format),
// plus seeded-RNG determinism (daily-challenge fairness invariant) and the
// per-game record namespacing + legacy migration (arcade platform).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, fakeIndexedDB, flushMicrotasks } from './helpers.mjs';

const NOW = '2026-03-01T00:30:00Z'; // month boundary on purpose

function freshStore(nowIso = NOW) {
  return loadModules(['js/store.js'], { nowIso, idb: fakeIndexedDB() });
}
const gs = (sb) => sb.SY.store.forGame('neonvortex'); // namespaced record store

test('makeRng is deterministic per seed and differs across seeds', () => {
  const sb = freshStore();
  const a1 = sb.SY.makeRng('daily-2026-03-01');
  const a2 = sb.SY.makeRng('daily-2026-03-01');
  const b = sb.SY.makeRng('daily-2026-03-02');
  const seqA1 = [a1(), a1(), a1()];
  const seqA2 = [a2(), a2(), a2()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA1, seqA2, 'same seed must replay identically');
  assert.notDeepEqual(seqA1, seqB, 'different seeds must diverge');
  for (const v of seqA1) assert.ok(v >= 0 && v < 1);
});

test('todayUTC and loadRecentDailies dates are strict YYYY-MM-DD (injection-safe)', async () => {
  const sb = freshStore();
  assert.equal(sb.SY.todayUTC(), '2026-03-01');
  const days = await gs(sb).loadRecentDailies(7);
  assert.equal(days.length, 7);
  for (const d of days) assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('loadRecentDailies crosses month/year boundaries correctly (utcDateMinus)', async () => {
  const sb = freshStore('2026-01-02T05:00:00Z');
  const days = await gs(sb).loadRecentDailies(4);
  // Array.from copies into the host realm (vm arrays fail deepStrictEqual on prototype)
  assert.deepEqual(Array.from(days, (d) => d.date), ['2026-01-02', '2026-01-01', '2025-12-31', '2025-12-30']);
});

test('computeStreak: today + yesterday recorded -> 2', async () => {
  const sb = freshStore();
  await gs(sb).saveDaily('2026-03-01', { score: 100 });
  await gs(sb).saveDaily('2026-02-28', { score: 90 });
  await flushMicrotasks();
  assert.equal(await gs(sb).computeStreak(), 2);
});

test('computeStreak: only yesterday recorded -> streak survives until the day ends', async () => {
  const sb = freshStore();
  await gs(sb).saveDaily('2026-02-28', { score: 90 });
  await flushMicrotasks();
  assert.equal(await gs(sb).computeStreak(), 1);
});

test('computeStreak: gap two days ago cuts the chain', async () => {
  const sb = freshStore();
  await gs(sb).saveDaily('2026-03-01', { score: 1 });
  await gs(sb).saveDaily('2026-02-28', { score: 1 });
  // 2026-02-27 missing
  await gs(sb).saveDaily('2026-02-26', { score: 1 });
  await flushMicrotasks();
  assert.equal(await gs(sb).computeStreak(), 2);
});

test('computeStreak: nothing recorded -> 0', async () => {
  const sb = freshStore();
  assert.equal(await gs(sb).computeStreak(), 0);
});

test('loadRecentDailies marks exactly the recorded dates', async () => {
  const sb = freshStore();
  await gs(sb).saveDaily('2026-03-01', { score: 11 });
  await gs(sb).saveDaily('2026-02-27', { score: 22 });
  await flushMicrotasks();
  const days = await gs(sb).loadRecentDailies(7);
  const hits = Array.from(days.filter((d) => d.rec), (d) => d.date);
  assert.deepEqual(hits, ['2026-03-01', '2026-02-27']);
  assert.equal(days[0].rec.score, 11);
});

test('record stores are isolated per game id', async () => {
  const sb = freshStore();
  await sb.SY.store.forGame('neonvortex').saveDaily('2026-03-01', { score: 100 });
  await sb.SY.store.forGame('other').saveDaily('2026-03-01', { score: 7 });
  await flushMicrotasks();
  assert.equal((await sb.SY.store.forGame('neonvortex').loadAll()).dailyBest.score, 100);
  assert.equal((await sb.SY.store.forGame('other').loadAll()).dailyBest.score, 7);
});

test('shared settings round-trip preserves unknown keys (seenHowto)', async () => {
  const sb = freshStore();
  await sb.SY.store.saveSettings({ muted: true, seenHowto: true });
  await flushMicrotasks();
  const settings = await sb.SY.store.loadSettings();
  assert.equal(settings.muted, true);
  assert.equal(settings.seenHowto, true);
});

test('migrate copies legacy (pre-namespace) keys into the game namespace, idempotently', async () => {
  const sb = freshStore();
  // seed legacy keys as a pre-namespace install would have them
  sb.indexedDB._dbs.set('scoreyard', new Map([
    ['best_all', { score: 500, combo: 9, date: '2026-02-20', mode: 'daily' }],
    ['daily_2026-03-01', { score: 120, combo: 5, pace: [0, 1], bossDown: true }],
  ]));
  await sb.SY.store.migrate('neonvortex');
  await flushMicrotasks();
  const all = await gs(sb).loadAll();
  assert.equal(all.bestAll.score, 500, 'legacy best_all migrated');
  assert.equal(all.dailyBest.score, 120, 'legacy daily migrated (today)');
  // idempotent: a later migrate must not clobber newer namespaced data
  await gs(sb).saveBestAll({ score: 999, combo: 1, date: '2026-03-01', mode: 'free' });
  await flushMicrotasks();
  await sb.SY.store.migrate('neonvortex');
  await flushMicrotasks();
  assert.equal((await gs(sb).loadAll()).bestAll.score, 999, 'second migrate must not overwrite');
});

test('migrate is a no-op on a fresh install (no legacy keys)', async () => {
  const sb = freshStore();
  await sb.SY.store.migrate('neonvortex');
  await flushMicrotasks();
  assert.equal((await gs(sb).loadAll()).bestAll, null);
});

test('addMedals merges, dedups, and reports only newly unlocked ids', async () => {
  const sb = freshStore();
  let added = await gs(sb).addMedals(['boss', 'nohit']);
  await flushMicrotasks();
  assert.deepEqual(Array.from(added).sort(), ['boss', 'nohit'], 'first call unlocks both');
  added = await gs(sb).addMedals(['nohit', 'legend']); // nohit already owned
  await flushMicrotasks();
  assert.deepEqual(Array.from(added), ['legend'], 'only the new one is reported');
  const all = await gs(sb).loadMedals();
  assert.deepEqual(Array.from(all).sort(), ['boss', 'legend', 'nohit']);
});

test('medals are isolated per game id', async () => {
  const sb = freshStore();
  await sb.SY.store.forGame('neonvortex').addMedals(['boss']);
  await flushMicrotasks();
  assert.equal((await sb.SY.store.forGame('other').loadMedals()).length, 0);
});

test('per-difficulty best is namespaced and round-trips', async () => {
  const sb = loadModules(['js/store.js'], { nowIso: '2026-03-01T00:00:00Z', idb: fakeIndexedDB() });
  const g = sb.SY.store.forGame('neonvortex');
  await g.saveBestFor('hard', { score: 1234, combo: 9, date: '2026-03-01', mode: 'free' });
  await flushMicrotasks();
  const easy = await g.loadBestFor('easy');
  const hard = await g.loadBestFor('hard');
  assert.equal(easy, null, 'easy untouched');
  assert.equal(hard.score, 1234, 'hard round-trips');
});

test('migrateBest copies legacy best_all into best_normal once (idempotent)', async () => {
  const idb = fakeIndexedDB();
  const sb = loadModules(['js/store.js'], { nowIso: '2026-03-01T00:00:00Z', idb });
  idb._dbs.set('scoreyard', new Map([['neonvortex:best_all', { score: 500, combo: 5, date: '2026-02-01', mode: 'daily' }]]));
  const g = sb.SY.store.forGame('neonvortex');
  await sb.SY.store.migrateBest('neonvortex');
  await flushMicrotasks();
  assert.equal((await g.loadBestFor('normal')).score, 500, 'best_normal seeded from best_all');
  await g.saveBestFor('normal', { score: 999, combo: 1, date: '2026-03-01', mode: 'free' });
  await flushMicrotasks();
  await sb.SY.store.migrateBest('neonvortex');
  await flushMicrotasks();
  assert.equal((await g.loadBestFor('normal')).score, 999, 'migration does not overwrite existing best_normal');
});

test('migrateBest is a no-op on a fresh install (no legacy keys)', async () => {
  const sb = loadModules(['js/store.js'], { nowIso: '2026-03-01T00:00:00Z', idb: fakeIndexedDB() });
  await sb.SY.store.migrateBest('neonvortex');
  await flushMicrotasks();
  assert.equal(await sb.SY.store.forGame('neonvortex').loadBestFor('normal'), null);
});

test('loadBests returns the three tiers (null for missing)', async () => {
  const sb = loadModules(['js/store.js'], { nowIso: '2026-03-01T00:00:00Z', idb: fakeIndexedDB() });
  const g = sb.SY.store.forGame('neonvortex');
  await g.saveBestFor('easy', { score: 7 });
  await flushMicrotasks();
  const all = await g.loadBests();
  assert.equal(all.easy.score, 7);
  assert.equal(all.normal, null);
  assert.equal(all.hard, null);
});
