import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankTier, accumulateLifetime } from '../../js/games/neonvortex/meta.mjs';

test('rankTier maps cumulative lifetime score to tiers', () => {
  assert.equal(rankTier(0).key, 'ROOKIE');
  assert.equal(rankTier(4999).key, 'ROOKIE');
  assert.equal(rankTier(5000).key, 'ELITE');
  assert.equal(rankTier(60000).key, 'ACE');
  assert.equal(rankTier(150000).key, 'LEGEND');
});

test('accumulateLifetime adds a run immutably', () => {
  const a = { score: 100, crystals: 10, runs: 1 };
  const b = accumulateLifetime(a, { score: 50, crystals: 5 });
  assert.deepEqual(b, { score: 150, crystals: 15, credits: 0, runs: 2 });
  assert.deepEqual(a, { score: 100, crystals: 10, runs: 1 });
});

test('accumulateLifetime banks credits (cosmetic coin total)', () => {
  const b = accumulateLifetime({ score: 0, crystals: 0, credits: 7, runs: 1 }, { score: 10, crystals: 2, credits: 5 });
  assert.equal(b.credits, 12, 'credits accumulate');
  assert.equal(b.crystals, 2);
});
