# BOMB Rarity — Move to a Rare Special Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the powerful screen-clear BOMB rare instead of a common (~1/10) bag power —
remove it from the seeded `POWER_TYPES` bag and spawn it via its own gated rare timer (the
1UP pattern), rebalancing the late game and un-diluting the bag back to 9 timed powers.

**Architecture:** Mirror the 1UP rare-pickup mechanism exactly. BOMB leaves `POWER_TYPES`;
a new `spawnBomb` + a seeded `s.spawnT.bomb` timer drop a `BOMB` into `s.pows` rarely
(13%, 20–32s, cap 1, excluded from the final 8s). The existing `applyPow` BOMB branch,
`bombDetonate`, `POWER_META.BOMB`, and `POWER_ICONS.BOMB` are reused unchanged.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), `node --test` `.mjs` mirrors.

---

## File Structure

- `js/games/neonvortex/game.js` — remove BOMB from `POWER_TYPES`; `spawnT.bomb` in freshState;
  `spawnBomb` helper; BOMB rare-timer block in `update`.
- `test/unit/bomb-power.test.mjs` — update the two bag-membership tests.
- `test/unit/static.test.mjs` — update the BOMB pin (not-in-bag + rare spawn).
- `README.md` — move BOMB from the power-up table to the rare-drop note.

---

### Task 1: Remove BOMB from the bag + add the rare spawn

**Files:**
- Modify: `js/games/neonvortex/game.js` — `POWER_TYPES` (line 6), freshState `spawnT`
  (~line 118), `spawnBomb` (after `spawnOneUp` ~line 298), update timer (~line 701).

- [ ] **Step 1: Remove BOMB from POWER_TYPES**

Change `game.js:6` back to 9 members (drop the trailing `, 'BOMB'`):

```javascript
  const POWER_TYPES = ['MAGNET', 'SHIELD', 'SLOW', 'X2', 'BOOST', 'SPREAD', 'TIME', 'DRONE', 'MISSILE'];
```

(Keep `POWER_META.BOMB` and `POWER_ICONS.BOMB` — they are still used by the pickup render/apply.)

- [ ] **Step 2: Add the bomb timer to freshState's spawnT**

In freshState `spawnT` (the line with `..., oneup: 16 }`), add `bomb: 18`:

```javascript
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5, crate: 6, portal: 14, oneup: 16, bomb: 18 },
```

- [ ] **Step 3: Add the spawnBomb helper**

After `spawnOneUp` (game.js:298), add (mirrors spawnOneUp; seeded position/phase):

```javascript
  // rare screen-clear pickup (NOT in the seeded bag; spawned by its own gated roll)
  function spawnBomb(s) {
    s.pows.push({
      x: 80 + s.rng() * (W - 160), y: 80 + s.rng() * (H - 160),
      type: 'BOMB', r: 13, life: 11, phase: s.rng() * Math.PI * 2, vy: -20,
    });
  }
```

- [ ] **Step 4: Add the BOMB rare-timer block in update**

Right after the 1UP timer block (game.js:701, after its closing `}`), add:

```javascript
    // ---------- rare screen-clear BOMB (rarer than 1UP — strong) ----------
    s.spawnT.bomb -= dt;
    if (s.spawnT.bomb <= 0) {
      s.spawnT.bomb = 20 + s.rng() * 12;
      // rare, capped at 1, never in the final 8s
      if (s.rng() < 0.13 && s.timeLeft > 8 && !s.pows.some(o => o.type === 'BOMB')) spawnBomb(s);
    }
```

- [ ] **Step 5: Run the game + powerup suites**

Run: `node --test test/unit/game.test.mjs test/unit/powerup.test.mjs`
Expected: PASS (powerup bag is back to 9; a seed-pinned bag assertion MAY shift — if so,
re-pin in Task 3 keeping determinism, same as prior features).

- [ ] **Step 6: Commit**

```bash
git add js/games/neonvortex/game.js
git commit -m "feat: BOMB is now a rare gated drop, not a bag power (bag back to 9)"
```

---

### Task 2: Update the BOMB unit tests

**Files:**
- Modify: `test/unit/bomb-power.test.mjs`

- [ ] **Step 1: Change the "seeded-bag member" test to "not in bag, instant"**

Replace the test at `bomb-power.test.mjs:18` (`'BOMB is a seeded-bag member with meta but no duration'`) with:

```javascript
test('BOMB has meta + icon but is NOT in the seeded bag (rare special)', () => {
  const G = boot().SY.nvGame;
  assert.ok(G.POWER_META['BOMB'], 'BOMB meta exists');
  assert.equal(G.POWER_DURATION['BOMB'], undefined, 'BOMB is instant — no duration');
  assert.ok(!G.POWER_TYPES || !G.POWER_TYPES.includes('BOMB'), 'BOMB is out of the bag');
});
```

NOTE: if `G.POWER_TYPES` is not exported, drop that last assertion and rely on the Task-3
static pin (which greps the source) for the not-in-bag guarantee. Check whether `nvGame`
exposes `POWER_TYPES`; keep the assertion only if it does.

- [ ] **Step 2: Change the "reachable from bag" test to "spawns from the rare timer"**

Replace the test at `bomb-power.test.mjs:58` (`'BOMB is reachable from the seeded bag...'`) with
(force the timer each frame so the 13% roll is reachable for any seed — the chest/1UP
robustness pattern):

```javascript
test('BOMB spawns from its own rare gated timer', () => {
  const G = boot().SY.nvGame; const s = play(G);
  let saw = false;
  for (let i = 0; i < 60 * 40 && !saw; i++) {
    s.spawnT.bomb = 0; // force the seeded roll every frame -> reachable for any seed
    G.update(1 / 60);
    if (s.pows.some((o) => o.type === 'BOMB')) saw = true;
  }
  assert.equal(saw, true, 'a BOMB appears from the rare timer');
});
```

(The other BOMB tests — clear/no-loot/boss-chip — push a `BOMB` pow directly and are unchanged.)

- [ ] **Step 3: Run the bomb tests**

Run: `node --test test/unit/bomb-power.test.mjs`
Expected: PASS (5/5).

- [ ] **Step 4: Commit**

```bash
git add test/unit/bomb-power.test.mjs
git commit -m "test: BOMB is a rare gated drop (not bag-reachable)"
```

---

### Task 3: Static pin + re-pin shifted tests + README

**Files:**
- Modify: `test/unit/static.test.mjs`, `README.md`, and any seed-pinned test broken by the
  bag change.

- [ ] **Step 1: Update the BOMB static pin**

In `static.test.mjs` (the `'BOMB screen-clear power is wired'` test, ~line 236-246) change
the bag-membership assertion to a NOT-in-bag + rare-spawn assertion:

```javascript
test('BOMB screen-clear power is wired (rare gated drop)', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(!/POWER_TYPES = \[[^\]]*'BOMB'/.test(game), 'BOMB is NOT in the seeded bag');
  assert.match(game, /function spawnBomb/, 'spawnBomb helper present');
  assert.match(game, /s\.spawnT\.bomb/, 'BOMB rare timer present');
  assert.match(game, /BOMB:\s*\{[^}]*label: 'BOMB'/, 'BOMB meta present');
  assert.match(game, /o\.type === 'BOMB'/, 'applyPow BOMB branch present');
  const durLine = game.match(/POWER_DURATION = \{[^}]*\}/)[0];
  assert.ok(!/BOMB/.test(durLine), 'BOMB absent from POWER_DURATION (instant)');
  const spr = read(`${NV}/sprites.js`);
  assert.match(spr, /BOMB:\s*\{ x: 437/, 'BOMB badge icon rect present');
});
```

- [ ] **Step 2: Run the full unit suite; re-pin any seed-shifted breakage**

Run: `for f in test/unit/*.test.mjs; do node --test "$f" || echo "FAIL $f"; done`
The bag shrinking 10→9 shifts `nextPowType`'s shuffle stream. Fix any test that asserts a
frozen seed→power sequence the same way as prior features: preserve the determinism check,
adjust the frozen expected value (or assert a property). Do NOT mask a real regression.
Expected after fixes: 0 FAIL.

- [ ] **Step 3: Move the README BOMB entry to the rare-drop note**

Remove the BOMB row from the power-up table (the `| ✸ | BOMB | … | 즉시 |` row) and add it
to the rare-drop note beside 1UP, e.g.: append to the 1UP note line — "또한 `✸` **BOMB**
(화면의 모든 적 파괴 + 탄막 제거, 보스·엘리트는 칩 데미지)도 드물게 등장합니다." Keep prose
consistent.

- [ ] **Step 4: Commit**

```bash
git add test/unit/static.test.mjs README.md
git commit -m "test: pin BOMB rare-drop wiring + re-pin bag-shift; docs: README BOMB note"
```

---

### Task 4: Full suite + audit + finish

**Files:** none (verification + merge workflow)

- [ ] **Step 1: Full suite (×3)**

Run (×3): `bash test/run-all.sh`
Expected: unit+static PASS, E2E PASS (re-run on the known boot/settings startup flake),
standalone OUT OF SYNC until Step 3.

- [ ] **Step 2: rng-fairness audit**

Dispatch `rng-fairness-auditor` over the change. Expected: the BOMB rare roll
(timer reset, 13% probability, spawn position/phase) all use the seeded `s.rng()`; daily
still forced Normal; `Math.random` baseline 14 unchanged; the bag→9 + new timer is a
deterministic versioned change (same seed → same drops on the new build).

- [ ] **Step 3: Finish the branch**

Use superpowers:finishing-a-development-branch — merge `feat/bomb-rare` to `main` `--no-ff`,
delete the branch, regenerate `standalone.html`, confirm the hash gate GREEN, commit it.

---

## Self-Review

- **Spec coverage:** remove-from-bag + rare spawn (Task 1) · test updates (Task 2) · static
  pin + re-pin + README (Task 3) · audit/merge (Task 4).
- **Placeholder scan:** none — all values concrete (13% / 20–32s / cap 1 / >8s).
- **Type consistency:** `'BOMB'` type string + `spawnBomb` + `s.spawnT.bomb` consistent;
  `spawnBomb` shape mirrors `spawnOneUp`; META/ICON/applyPow/bombDetonate untouched and still
  keyed on `'BOMB'`.
