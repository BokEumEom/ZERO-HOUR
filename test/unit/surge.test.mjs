// Surge Director + HEAT multiplier — engine-level tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

function freshGame(nowIso = '2026-03-01T00:30:00Z') {
  return loadModules(['js/store.js', 'js/games/zerohour/game.js'], { nowIso });
}
function toPlaying(sb, mode = 'free') {
  const G = sb.SY.game;
  G.start(mode);
  for (let i = 0; i < 30 && G.phase === 'ready'; i++) G.update(0.1);
  assert.equal(G.phase, 'playing');
  return G;
}

test('buildSurges: 60s run schedules 2 surges inside the field window, increasing size', () => {
  const G = toPlaying(freshGame(), 'free');
  const sg = G.state.surges;
  assert.equal(sg.length, 2, 'duration 60 → floor((40-8)/16) = 2 surges');
  assert.ok(sg[0].at > 8 && sg[0].at < sg[1].at && sg[1].at < 40, 'surges ordered, inside (8,40)');
  assert.deepEqual([...sg.map((x) => x.size)], [9, 12], 'size = 6 + 3k');
  for (const x of sg) assert.ok(['LINE', 'RING', 'PINCER'].includes(x.pattern));
});

test('buildSurges is deterministic for the same daily seed', () => {
  const a = toPlaying(freshGame(), 'daily').state.surges;
  const b = toPlaying(freshGame(), 'daily').state.surges;
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same seed → identical schedule');
});

test('freshState seeds HEAT fields and a heat breakdown bucket', () => {
  const G = toPlaying(freshGame(), 'free');
  assert.equal(G.state.heat, 0);
  assert.equal(G.state.inSurge, false);
  assert.equal(G.state.heatMul, 1);
  assert.equal(G.state.breakdown.heat, 0);
});
