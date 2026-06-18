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

// Helper: force a crystal onto the player and step one frame so the real
// collect → addScore path runs with whatever inSurge/heat we set.
function collectOneOnPlayer(G) {
  const p = G.state.player;
  G.state.crystals.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 7, phase: 0 });
  G.update(1 / 60);
}

test('HEAT bonus is isolated into breakdown.heat during a surge', () => {
  const G = toPlaying(freshGame(), 'free');
  G.state.inSurge = true; G.state.surgeActiveT = 10; G.state.heat = 26; // tier ×2
  const before = G.state.score;
  collectOneOnPlayer(G);
  // base = 10 + combo(→1) = 11; x2 off → x2=1; tier=2 → mul=2
  // v = round(11*2)=22; vBase = round(11*1)=11; heatBonus = 11
  assert.equal(G.state.breakdown.heat, 11, 'heat bonus = v - vBase');
  assert.equal(G.state.score - before, 22, 'full multiplied value added to score');
});

test('HEAT does not apply outside a surge (tier = 1)', () => {
  const G = toPlaying(freshGame(), 'free');
  G.state.inSurge = false; G.state.heat = 26; // high heat, but not in surge
  collectOneOnPlayer(G);
  assert.equal(G.state.breakdown.heat, 0, 'no heat bonus outside surge');
});
