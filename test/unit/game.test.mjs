// Rubric #1 (pause state machine), #2 (quit discards run), #3 (breakdown
// integrity incl. x2), #4 (stuck-input edge cases) — engine-level tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, runToGameOver } from './helpers.mjs';

function freshGame() {
  // store.js provides SY.makeRng / SY.todayUTC that game.js needs
  return loadModules(['js/store.js', 'js/game.js'], { nowIso: '2026-03-01T00:30:00Z' });
}

function toPlaying(sb, mode = 'free') {
  const G = sb.SY.game;
  G.start(mode);
  for (let i = 0; i < 30 && G.phase === 'ready'; i++) G.update(0.1);
  assert.equal(G.phase, 'playing');
  return G;
}

// ---------- Rubric #1: pause state machine ----------

test('pause is a no-op outside playing/ready', () => {
  const sb = freshGame();
  const G = sb.SY.game;
  assert.equal(G.phase, 'menu');
  G.pause();
  assert.equal(G.phase, 'menu');
  G.resume(); // resume without pause is also a no-op
  assert.equal(G.phase, 'menu');
});

test('pause during playing freezes sim time, score, timer and cosmetics', () => {
  const sb = freshGame();
  const G = toPlaying(sb);
  for (let i = 0; i < 120; i++) G.update(1 / 60); // build up some state
  G.pause();
  assert.equal(G.phase, 'paused');
  const snap = JSON.stringify({
    t: G.state.t, timeLeft: G.state.timeLeft, score: G.state.score,
    parts: G.state.parts.length, crystals: G.state.crystals.length,
    px: G.state.player.x, py: G.state.player.y,
  });
  for (let i = 0; i < 240; i++) G.update(1 / 60); // 4 simulated seconds while paused
  const after = JSON.stringify({
    t: G.state.t, timeLeft: G.state.timeLeft, score: G.state.score,
    parts: G.state.parts.length, crystals: G.state.crystals.length,
    px: G.state.player.x, py: G.state.player.y,
  });
  assert.equal(after, snap, 'no state may advance while paused');
});

test('resume restores the exact phase it was paused from (playing and ready)', () => {
  const sb = freshGame();
  const G = sb.SY.game;
  G.start('free');
  assert.equal(G.phase, 'ready');
  G.pause();
  assert.equal(G.phase, 'paused');
  G.resume();
  assert.equal(G.phase, 'ready', 'ready must resume to ready');
  toPlaying(sb); // re-start to playing
  G.pause();
  G.resume();
  assert.equal(G.phase, 'playing');
});

test('readyT continues (not resets) across pause', () => {
  const sb = freshGame();
  const G = sb.SY.game;
  G.start('free');
  G.update(0.5); // readyT 1.4 -> 0.9
  const before = G.state.readyT;
  G.pause();
  for (let i = 0; i < 60; i++) G.update(1 / 60);
  G.resume();
  assert.equal(G.state.readyT, before);
});

test('hitstop freeze is preserved as-is across pause', () => {
  const sb = freshGame();
  const G = toPlaying(sb);
  G.state.freeze = 0.15;
  G.pause();
  for (let i = 0; i < 60; i++) G.update(1 / 60);
  assert.equal(G.state.freeze, 0.15);
  G.resume();
});

// ---------- Rubric #4: stuck-input edge cases ----------

test('held movement key does not leak through pause/resume (resetKeys)', () => {
  const sb = freshGame();
  const G = toPlaying(sb);
  sb.dispatch('keydown', { code: 'KeyW', preventDefault() {} });
  for (let i = 0; i < 30; i++) G.update(1 / 60);
  assert.ok(Math.abs(G.state.player.vy) > 10, 'sanity: KeyW must move the player');
  G.pause(); // keyup never arrives (e.g. window blurred)
  G.resume();
  // damp out residual velocity with no input held
  for (let i = 0; i < 90; i++) G.update(1 / 60);
  assert.ok(Math.abs(G.state.player.vy) < 5, 'velocity must decay: key was reset');
  assert.ok(G.state.player.thrust < 0.1, 'no thrust without held keys');
});

test('keys pressed while paused are discarded on resume', () => {
  const sb = freshGame();
  const G = toPlaying(sb);
  G.pause();
  sb.dispatch('keydown', { code: 'KeyD', preventDefault() {} }); // pressed on the overlay
  G.resume();
  for (let i = 0; i < 90; i++) G.update(1 / 60);
  assert.ok(Math.abs(G.state.player.vx) < 5, 'KeyD pressed during pause must not move the player');
});

test('a key stuck since the menu does not steer a new run (G.start resets keys)', () => {
  const sb = freshGame();
  const G = sb.SY.game;
  // key pressed on the menu, keyup lost to a window blur
  sb.dispatch('keydown', { code: 'KeyW', preventDefault() {} });
  toPlaying(sb);
  for (let i = 0; i < 60; i++) G.update(1 / 60);
  assert.ok(Math.abs(G.state.player.vy) < 5, 'stale menu key must not move the player');
});

test('touch joystick axis is zeroed by pause', () => {
  const sb = freshGame();
  const G = toPlaying(sb);
  sb.SY.input.ax = 1; sb.SY.input.ay = -0.5;
  G.pause();
  assert.equal(sb.SY.input.ax, 0);
  assert.equal(sb.SY.input.ay, 0);
});

// ---------- Rubric #2: quit discards the run ----------

test('toMenu mid-run never fires onGameOver and clears state', () => {
  const sb = freshGame();
  const G = toPlaying(sb);
  let fired = 0;
  G.events.onGameOver = () => { fired++; };
  G.state.score = 12345;
  G.pause();
  G.toMenu(); // QUIT TO MENU path
  assert.equal(G.phase, 'menu');
  assert.equal(G.state, null);
  for (let i = 0; i < 30; i++) G.update(1 / 60); // must not crash on null state
  assert.equal(fired, 0, 'a discarded run must not produce a result');
});

// ---------- Rubric #3: breakdown integrity (property across seeds) ----------

test('breakdown buckets always sum to the final score (3 seeded full runs)', () => {
  for (const mode of ['daily', 'free']) {
    for (let run = 0; run < 3; run++) {
      const sb = freshGame();
      sb.SY.tweaks.duration = 20; // short but eventful runs
      const res = runToGameOver(sb, mode, {
        onFrame(G, i) {
          // wiggle the player so it collects crystals and meets mines
          sb.SY.input.ax = Math.sin(i / 23 + run);
          sb.SY.input.ay = Math.cos(i / 31 + run);
        },
      });
      assert.ok(res, 'run must end');
      const bd = res.breakdown;
      assert.equal(
        bd.crystals + bd.combo + bd.destruction + bd.boss, res.score,
        `bucket sum must equal score (mode=${mode} run=${run}: ${JSON.stringify(bd)} vs ${res.score})`,
      );
      assert.ok(res.score > 0, 'sanity: an active run should score');
    }
  }
});

test('x2 powerup doubles into the correct buckets', () => {
  const sb = freshGame();
  const G = toPlaying(sb);
  const s = G.state;
  // place one crystal on the player with X2 active, empty everything else
  s.crystals.length = 0; s.mines.length = 0; s.rocks.length = 0; s.pows.length = 0;
  s.combo = 0;
  s.fx.X2 = 5;
  s.crystals.push({ x: s.player.x, y: s.player.y, vx: 0, vy: 0, r: 7, phase: 0 });
  const before = { ...s.breakdown };
  G.update(1 / 60);
  // collected with combo 0 -> 1: base = 10 + 1 = 11, x2 -> 22
  assert.equal(s.breakdown.crystals - before.crystals, 20, 'crystal part 10*2');
  assert.equal(s.breakdown.combo - before.combo, 2, 'combo part (base-10)*2');
});

test('boss kill credits the boss bucket (x2 aware) and ends in score', () => {
  const sb = freshGame();
  const G = toPlaying(sb);
  const s = G.state;
  s.boss = { x: 480, y: 200, ty: 200, r: 40, hp: 1, maxHp: 1, t: 0, ringRot: 0, flash: 0, dying: 0.01, shotT: 9, volleyT: 9 };
  const before = s.score;
  G.update(0.05); // dying timer elapses -> detonation + 1500
  assert.equal(s.breakdown.boss, 1500);
  assert.equal(s.score - before, 1500);
  assert.equal(s.bossDown, true);
});

// ---------- regression: result payload shape ----------

test('game-over result carries pace[], breakdown and the seed for the UI layer', () => {
  const sb = freshGame();
  sb.SY.tweaks.duration = 5;
  const res = runToGameOver(sb, 'daily');
  assert.ok(Array.isArray(res.pace) && res.pace.length >= 2, 'pace series for sparkline');
  assert.deepEqual(Object.keys(res.breakdown).sort(), ['boss', 'combo', 'crystals', 'destruction']);
  assert.equal(typeof res.collected, 'number');
  // daily records must be filed under the seed's date, not "now" (midnight rollover)
  assert.equal(res.seedStr, 'daily-2026-03-01');
});
