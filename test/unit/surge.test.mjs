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
  G.state.inSurge = true; G.state.surgeActiveT = 10; G.state.heat = 26; // starts at tier ×2
  const before = G.state.score;
  collectOneOnPlayer(G);
  // collect runs s.heat += 1 (26 → 27) BEFORE heatTier samples it; heatTier(27) → ×2 (at ≥ 26)
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

test('collecting during a surge raises heat; collecting in calm does not', () => {
  const G = toPlaying(freshGame(), 'free');
  G.state.inSurge = true; G.state.surgeActiveT = 10; G.state.heat = 0;
  collectOneOnPlayer(G);
  assert.equal(G.state.heat, 1, 'one crystal in surge → heat +1');
  G.state.inSurge = false;
  collectOneOnPlayer(G);
  assert.equal(G.state.heat, 1, 'crystal in calm → heat unchanged');
});

test('taking a hit resets heat to 0', () => {
  const G = toPlaying(freshGame(), 'free');
  G.state.inSurge = true; G.state.surgeActiveT = 10; G.state.heat = 20;
  G.state.shield = false; G.state.player.inv = 0;
  const p = G.state.player;
  G.state.mines.push({ x: p.x, y: p.y, r: 11, hp: 1, speed: 60, phase: 0, flash: 0 });
  G.update(1 / 60); // mine on the player → hurtPlayer → heat reset
  assert.equal(G.state.heat, 0, 'hit clears HEAT');
  assert.equal(G.state.tookDamage, true);
});

test('spawnFormation (via a forced surge) adds `size` scripted-entry mines, deterministically', () => {
  const G = toPlaying(freshGame(), 'daily');
  // jump the clock to just before the first surge and let the director fire it
  const first = G.state.surges[0];
  G.state.t = first.at - 0.001;
  const before = G.state.mines.length;
  G.update(0.01); // crosses first.at → surge starts → formation spawns
  const added = G.state.mines.length - before;
  assert.equal(added, first.size, 'formation adds exactly `size` mines');
  const formMines = G.state.mines.slice(before);
  for (const m of formMines) {
    assert.ok(m.entryT > 0, 'formation mines enter on a scripted path');
    assert.ok(typeof m.vx === 'number' && typeof m.vy === 'number');
  }
  assert.equal(G.state.inSurge, true);
});

test('a full free run passes through at least one surge and back to calm', () => {
  const sb = freshGame();
  const G = sb.SY.game;
  let sawSurge = false, sawCalmAfter = false;
  G.events.onGameOver = () => {};
  G.start('free');
  for (let i = 0; i < 30 && G.phase === 'ready'; i++) G.update(0.1);
  for (let i = 0; i < 60 * 60 && G.phase === 'playing'; i++) {
    G.update(1 / 60);
    if (G.state.inSurge) sawSurge = true;
    if (sawSurge && !G.state.inSurge && G.state.surgeIdx >= 1) sawCalmAfter = true;
  }
  assert.ok(sawSurge, 'run entered a surge');
  assert.ok(sawCalmAfter, 'run returned to calm after a surge');
});

test('formation mines move along their scripted vector during entry', () => {
  const G = toPlaying(freshGame(), 'daily');
  const first = G.state.surges[0];
  G.state.t = first.at - 0.001;
  G.update(0.01);
  const m = G.state.mines.find((x) => x.entryT > 0);
  assert.ok(m, 'a scripted-entry mine exists');
  const x0 = m.x, y0 = m.y, vx = m.vx, vy = m.vy;
  G.update(1 / 60);
  assert.ok(Math.sign(m.x - x0) === Math.sign(vx) || vx === 0, 'x follows scripted vx');
  assert.ok(Math.sign(m.y - y0) === Math.sign(vy) || vy === 0, 'y follows scripted vy');
});

test('HEAT_X2_CAP caps combined X2 × HEAT at 4', () => {
  const G = toPlaying(freshGame(), 'free');
  G.state.inSurge = true; G.state.surgeActiveT = 10; G.state.heat = 26; // tier ×2
  G.state.fx.X2 = 5; // X2 active
  const before = G.state.score;
  collectOneOnPlayer(G);
  // base=11, x2=2, tier=2 → 2*2=4 (== HEAT_X2_CAP, not 5+)
  // v = round(11*4) = 44; vBase = round(11*2) = 22; heatBonus = 22
  assert.equal(G.state.score - before, 44);
  assert.equal(G.state.breakdown.heat, 22);
});
