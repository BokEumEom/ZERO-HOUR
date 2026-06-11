// Rubric #5 (UTC boundary / streak), #9 (injected values are fixed-format),
// plus seeded-RNG determinism (daily-challenge fairness invariant).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, fakeIndexedDB, flushMicrotasks } from './helpers.mjs';

const NOW = '2026-03-01T00:30:00Z'; // month boundary on purpose

function freshStore(nowIso = NOW) {
  return loadModules(['js/store.js'], { nowIso, idb: fakeIndexedDB() });
}

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
  const days = await sb.SY.store.loadRecentDailies(7);
  assert.equal(days.length, 7);
  for (const d of days) assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('loadRecentDailies crosses month/year boundaries correctly (utcDateMinus)', async () => {
  const sb = freshStore('2026-01-02T05:00:00Z');
  const days = await sb.SY.store.loadRecentDailies(4);
  // Array.from copies into the host realm (vm arrays fail deepStrictEqual on prototype)
  assert.deepEqual(Array.from(days, (d) => d.date), ['2026-01-02', '2026-01-01', '2025-12-31', '2025-12-30']);
});

test('computeStreak: today + yesterday recorded -> 2', async () => {
  const sb = freshStore();
  await sb.SY.store.saveDaily('2026-03-01', { score: 100 });
  await sb.SY.store.saveDaily('2026-02-28', { score: 90 });
  await flushMicrotasks();
  assert.equal(await sb.SY.store.computeStreak(), 2);
});

test('computeStreak: only yesterday recorded -> streak survives until the day ends', async () => {
  const sb = freshStore();
  await sb.SY.store.saveDaily('2026-02-28', { score: 90 });
  await flushMicrotasks();
  assert.equal(await sb.SY.store.computeStreak(), 1);
});

test('computeStreak: gap two days ago cuts the chain', async () => {
  const sb = freshStore();
  await sb.SY.store.saveDaily('2026-03-01', { score: 1 });
  await sb.SY.store.saveDaily('2026-02-28', { score: 1 });
  // 2026-02-27 missing
  await sb.SY.store.saveDaily('2026-02-26', { score: 1 });
  await flushMicrotasks();
  assert.equal(await sb.SY.store.computeStreak(), 2);
});

test('computeStreak: nothing recorded -> 0', async () => {
  const sb = freshStore();
  assert.equal(await sb.SY.store.computeStreak(), 0);
});

test('loadRecentDailies marks exactly the recorded dates', async () => {
  const sb = freshStore();
  await sb.SY.store.saveDaily('2026-03-01', { score: 11 });
  await sb.SY.store.saveDaily('2026-02-27', { score: 22 });
  await flushMicrotasks();
  const days = await sb.SY.store.loadRecentDailies(7);
  const hits = Array.from(days.filter((d) => d.rec), (d) => d.date);
  assert.deepEqual(hits, ['2026-03-01', '2026-02-27']);
  assert.equal(days[0].rec.score, 11);
});

test('settings round-trip preserves unknown keys (seenHowto compatibility)', async () => {
  const sb = freshStore();
  await sb.SY.store.saveSettings({ muted: true, seenHowto: true });
  await flushMicrotasks();
  const all = await sb.SY.store.loadAll();
  assert.equal(all.settings.muted, true);
  assert.equal(all.settings.seenHowto, true);
});
