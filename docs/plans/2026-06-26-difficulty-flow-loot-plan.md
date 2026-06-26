# Difficulty-in-Main-Flow + Loot Generosity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make difficulty actually reachable for a daily-first player by driving the headline button off the selected difficulty (NORMAL→daily, EASY/HARD→free-play at that difficulty), and make power-up/crate loot noticeably more generous.

**Architecture:** Menu restructure — difficulty chips become the mode selector; `btn-start` is dynamic (label/sub/action keyed on `difficultyValue()`); the redundant FREE PLAY button is removed. Loot is tuned by raising two on-screen caps and shortening two spawn cadences in `game.js`'s `update()`. Loot change shifts the daily seed stream (deliberate versioned change → re-pin seed tests).

**Tech Stack:** Vanilla JS IIFE on `window.SY`; Canvas 2D; zero-dependency tests (`node --test` `.mjs` via `test/unit/helpers.mjs` vm sandbox + headless-Chrome E2E `test/e2e/harness.html`).

**Design:** `docs/plans/2026-06-26-difficulty-flow-loot-design.md`

---

## File Structure

- `js/games/neonvortex/game.js` — loot caps + cadence (Part ②).
- `index.html` — menu restructure: chip row above headline; dynamic-headline sub spans; remove FREE PLAY button (Part A).
- `js/games/neonvortex/main.js` — dynamic headline in `syncDifficultyChips`; `btn-start` routing; remove `btn-free` listener (Part A).
- `css/neonvortex.css` — chip-row spacing above the headline (Part A).
- `test/unit/modifier.test.mjs` — update the two crate-cadence tests to the new window; add loot-cap + pow-cadence tests (Part ②).
- `test/e2e/harness.html` — replace `btn-free` usage; add a difficulty-headline scenario (Part A).
- `README` (Korean) — game-mode section.

---

### Task 1: Loot generosity (game.js) + loot tests + re-pin

**Files:**
- Modify: `js/games/neonvortex/game.js` (`update()` ~line 735 pow, ~743 crate)
- Test: `test/unit/modifier.test.mjs` (update 2 tests, add 4)

- [ ] **Step 1: Update the two existing crate-cadence tests + add cap/pow-cadence tests**

In `test/unit/modifier.test.mjs`, the two existing tests assert the OLD crate window `[7,12]`. REPLACE their assertion bounds with the new `[5,8]` window. Find:

```javascript
  s.diff = G.combineDiff(G.DIFF.normal, G.MODS.standard);
  s.spawnT.crate = 0.0001;
  s.crates.length = 0;
  G.update(1 / 60);
  assert.ok(s.spawnT.crate >= 7 && s.spawnT.crate <= 12, 'base window with lootMul=1: ' + s.spawnT.crate);
```

change the assertion line to:

```javascript
  assert.ok(s.spawnT.crate >= 5 && s.spawnT.crate <= 8, 'base crate window [5,8] with lootMul=1: ' + s.spawnT.crate);
```

And in the treasure test, find:

```javascript
  s.diff = G.combineDiff(G.DIFF.normal, G.MODS.treasure); // lootMul 1.8
  s.spawnT.crate = 0.0001;
  s.crates.length = 0;
  G.update(1 / 60);
  assert.ok(s.spawnT.crate >= 7 / 1.8 && s.spawnT.crate <= 12 / 1.8, 'treasure window: ' + s.spawnT.crate);
```

change the assertion line to:

```javascript
  assert.ok(s.spawnT.crate >= 5 / 1.8 && s.spawnT.crate <= 8 / 1.8, 'treasure crate window: ' + s.spawnT.crate);
```

Then APPEND these new tests at the end of the file:

```javascript
test('power-up cadence is 7s (÷lootMul) — generous baseline', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'normal');
  const s = G.state;
  for (let i = 0; i < 30 && G.phase === 'ready'; i++) G.update(0.1); // skip countdown
  s.diff = G.combineDiff(G.DIFF.normal, G.MODS.standard);
  s.spawnT.pow = 0.0001;
  s.pows.length = 0;
  G.update(1 / 60);
  assert.ok(Math.abs(s.spawnT.pow - 7) < 1e-6, 'pow cadence 7s with lootMul=1: ' + s.spawnT.pow);
});

test('power-up cadence shortens under lootMul (treasure 7/1.8)', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'normal');
  const s = G.state;
  for (let i = 0; i < 30 && G.phase === 'ready'; i++) G.update(0.1);
  s.diff = G.combineDiff(G.DIFF.normal, G.MODS.treasure); // lootMul 1.8
  s.spawnT.pow = 0.0001;
  s.pows.length = 0;
  G.update(1 / 60);
  assert.ok(Math.abs(s.spawnT.pow - 7 / 1.8) < 1e-6, 'pow cadence 7/1.8: ' + s.spawnT.pow);
});

test('power-up on-screen cap raised to 4', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'normal');
  const s = G.state;
  for (let i = 0; i < 30 && G.phase === 'ready'; i++) G.update(0.1);
  s.diff = G.combineDiff(G.DIFF.normal, G.MODS.standard);
  s.player.x = G.W - 20; s.player.y = 20; // park the pilot in a corner so it doesn't collect pickups
  s.pows.length = 0;
  let maxPows = 0;
  for (let i = 0; i < 30; i++) { s.spawnT.pow = 0; G.update(1 / 60); maxPows = Math.max(maxPows, s.pows.length); }
  assert.equal(maxPows, 4, 'pow cap is 4 (was 3): ' + maxPows);
});

test('crate on-screen cap raised to 3', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'normal');
  const s = G.state;
  for (let i = 0; i < 30 && G.phase === 'ready'; i++) G.update(0.1);
  s.diff = G.combineDiff(G.DIFF.normal, G.MODS.standard);
  s.crates.length = 0;
  let maxCrates = 0;
  for (let i = 0; i < 30; i++) { s.spawnT.crate = 0; G.update(1 / 60); maxCrates = Math.max(maxCrates, s.crates.length); }
  assert.equal(maxCrates, 3, 'crate cap is 3 (was 2): ' + maxCrates);
});
```

- [ ] **Step 2: Run the loot tests to verify they FAIL**

Run: `node --test test/unit/modifier.test.mjs`
Expected: FAIL — current code: pow cadence 9.5 (not 7), pow cap 3 (not 4), crate window [7,12] (not [5,8]), crate cap 2 (not 3).

- [ ] **Step 3: Apply the loot changes in `game.js`**

In `js/games/neonvortex/game.js` `update()`, the power-up line currently reads:

```javascript
    if (s.spawnT.pow <= 0) { s.spawnT.pow = 9.5 / s.diff.lootMul; if (s.pows.length < 3) spawnPow(s); }
```

change to:

```javascript
    if (s.spawnT.pow <= 0) { s.spawnT.pow = 7 / s.diff.lootMul; if (s.pows.length < 4) spawnPow(s); }
```

The crate block currently reads:

```javascript
      s.spawnT.crate = (7 + s.rng() * 5) / s.diff.lootMul;
      if (s.crates.length < 2) spawnCrate(s);
```

change to:

```javascript
      s.spawnT.crate = (5 + s.rng() * 3) / s.diff.lootMul;
      if (s.crates.length < 3) spawnCrate(s);
```

- [ ] **Step 4: Run the loot tests to verify they PASS**

Run: `node --test test/unit/modifier.test.mjs`
Expected: PASS (all tests, including the 4 new loot tests).

- [ ] **Step 5: Run the FULL unit suite and re-pin seed-pinned breakage**

Run: `node --test test/unit/*.test.mjs`
Expected: Some seed-pinned daily/spawn-count tests may now fail because the new crate/pow stream shifts the seeded `s.rng()` draws and on-screen densities. This is the EXPECTED, intentional versioned change. For each failure: (a) confirm it is caused by the loot change (more crates/pows, shifted stream) and NOT a logic bug — if a failure is not explainable that way, STOP and report it; (b) re-pin the expected value, preferring knob/behavioral assertions over incidental counts (follow the `difficulty.test.mjs` pattern). Note each re-pin in the commit body.

- [ ] **Step 6: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/
git commit -m "feat: more generous loot (pow cap 4/7s, crate cap 3/5-8s); re-pin seed tests"
```

---

### Task 2: Menu DOM restructure (index.html)

**Files:**
- Modify: `index.html` (menu list ~lines 81–101)

- [ ] **Step 1: Reorder + restructure the menu list**

In `index.html`, the menu list currently is (lines ~81–101): `btn-start`, then `btn-free` (with `free-sub`), then the `menu-difficulty` chip row, then `btn-daily`. Replace that block so the chip row comes FIRST, the FREE PLAY button is removed, and `btn-start` carries both a daily sub and a (hidden) free sub. Replace:

```html
          <div class="nv-menu-list">
            <button id="neonvortex-btn-start" class="nv-menu-item nv-mi-primary" type="button">
              <span class="nv-mi-label">START DAILY</span>
              <svg class="nv-mi-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
              <span class="nv-mi-sub"><span id="neonvortex-menu-date">—</span> · BEST <span id="neonvortex-menu-daily-best">—</span><span id="neonvortex-menu-streak"></span></span>
            </button>
            <button id="neonvortex-btn-free" class="nv-menu-item" type="button">
              <span class="nv-mi-label">FREE PLAY</span>
              <svg class="nv-mi-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="9" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 12.5h3M8.5 11v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="15.5" cy="11.5" r="1.1" fill="currentColor"/><circle cx="17.6" cy="13.6" r="1.1" fill="currentColor"/></svg>
              <span id="neonvortex-free-sub" class="nv-mi-sub">무작위 시드 아레나</span>
            </button>
            <div id="neonvortex-menu-difficulty" class="nv-diff-row" role="group" aria-label="Free-play difficulty">
              <button id="neonvortex-diff-easy" class="nv-diff-chip" type="button" aria-pressed="false">EASY</button>
              <button id="neonvortex-diff-normal" class="nv-diff-chip" type="button" aria-pressed="false">NORMAL</button>
              <button id="neonvortex-diff-hard" class="nv-diff-chip" type="button" aria-pressed="false">HARD</button>
            </div>
            <button id="neonvortex-btn-daily" class="nv-mi-brief" type="button">
```

with:

```html
          <div class="nv-menu-list">
            <div id="neonvortex-menu-difficulty" class="nv-diff-row" role="group" aria-label="Difficulty">
              <button id="neonvortex-diff-easy" class="nv-diff-chip" type="button" aria-pressed="false">EASY</button>
              <button id="neonvortex-diff-normal" class="nv-diff-chip" type="button" aria-pressed="false">NORMAL</button>
              <button id="neonvortex-diff-hard" class="nv-diff-chip" type="button" aria-pressed="false">HARD</button>
            </div>
            <button id="neonvortex-btn-start" class="nv-menu-item nv-mi-primary" type="button">
              <span id="neonvortex-menu-start-label" class="nv-mi-label">START DAILY</span>
              <svg class="nv-mi-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
              <span id="neonvortex-menu-daily-sub" class="nv-mi-sub"><span id="neonvortex-menu-date">—</span> · BEST <span id="neonvortex-menu-daily-best">—</span><span id="neonvortex-menu-streak"></span></span>
              <span id="neonvortex-free-sub" class="nv-mi-sub" style="display:none">무작위 아레나 · NORMAL</span>
            </button>
            <button id="neonvortex-btn-daily" class="nv-mi-brief" type="button">
```

(The `btn-daily` briefing button and everything after it are unchanged.)

- [ ] **Step 2: Verify the static test still passes**

Run: `node --test test/unit/static.test.mjs`
Expected: PASS — `#neonvortex-free-sub` still exists (now inside `btn-start`), so the existing free-sub assertions hold. If `static.test.mjs` asserts anything about `btn-free` existing, update that assertion to reflect its removal (it does not, per current grep — but confirm).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: menu — difficulty chips above a dynamic headline; remove FREE PLAY button"
```

---

### Task 3: Dynamic headline wiring (main.js)

**Files:**
- Modify: `js/games/neonvortex/main.js` (`syncDifficultyChips` ~1284; `btn-start`/`btn-free` listeners ~1369–1371)

- [ ] **Step 1: Update `syncDifficultyChips` to drive the headline**

In `js/games/neonvortex/main.js`, `syncDifficultyChips` currently ends by setting the old free-sub text:

```javascript
    const sub = $('free-sub');
    if (sub) sub.textContent = '무작위 시드 아레나 · ' + sel.toUpperCase();
  }
```

Replace that tail (from `const sub = $('free-sub');` to the closing `}`) with:

```javascript
    // headline follows the selected difficulty: NORMAL -> daily, EASY/HARD -> free-play
    const label = $('menu-start-label');
    const dailySub = $('menu-daily-sub');
    const freeSub = $('free-sub');
    if (sel === 'normal') {
      if (label) label.textContent = 'START DAILY';
      if (dailySub) dailySub.style.display = '';
      if (freeSub) freeSub.style.display = 'none';
    } else {
      if (label) label.textContent = 'PLAY · ' + sel.toUpperCase();
      if (dailySub) dailySub.style.display = 'none';
      if (freeSub) { freeSub.style.display = ''; freeSub.textContent = '무작위 아레나 · ' + sel.toUpperCase(); }
    }
  }
```

- [ ] **Step 2: Route the headline click by difficulty; remove the FREE PLAY listener**

Find (lines ~1369–1371):

```javascript
  $('btn-start').addEventListener('click', () => startGame('daily')); // headline action → today's daily
  $('btn-free').addEventListener('click', () => startGame('free'));
```

Replace BOTH lines with:

```javascript
  // headline follows difficulty: NORMAL → today's daily; EASY/HARD → free-play at that difficulty
  $('btn-start').addEventListener('click', () => startGame(difficultyValue() === 'normal' ? 'daily' : 'free'));
```

- [ ] **Step 3: Verify the unit suite passes (no behavioral regressions in pure logic)**

Run: `node --test test/unit/*.test.mjs`
Expected: PASS (main.js DOM wiring isn't unit-tested; this confirms no syntax error breaks module load).

- [ ] **Step 4: Commit**

```bash
git add js/games/neonvortex/main.js
git commit -m "feat: headline button follows difficulty (NORMAL=daily, EASY/HARD=free-play)"
```

---

### Task 4: CSS — chip row above the headline

**Files:**
- Modify: `css/neonvortex.css` (`.nv-diff-row` rule)

- [ ] **Step 1: Give the chip row breathing room above the headline**

In `css/neonvortex.css`, find the `.nv-diff-row` rule and add a bottom margin so it sits cleanly above the headline button (it previously sat between two buttons; now it leads the list). Add to the existing `.nv-diff-row { ... }` block:

```css
  margin-bottom: clamp(6px, 1.4vh, 12px);
```

(If `.nv-diff-row` already sets `margin`, fold the bottom value into it rather than duplicating. Keep the existing chip styling otherwise.)

- [ ] **Step 2: Visual check is deferred to Task 6 (mobile screenshot)**

No automated test for spacing. Note: the mobile-portrait screenshot in Task 6 confirms the chip row leads the menu and spacing reads cleanly; tune this margin there if needed.

- [ ] **Step 3: Commit**

```bash
git add css/neonvortex.css
git commit -m "style: space the difficulty chip row above the headline"
```

---

### Task 5: E2E harness updates

**Files:**
- Modify: `test/e2e/harness.html` (btn-free usages ~83, ~105, ~214–219; add a headline scenario)

- [ ] **Step 1: Replace the generic `btn-free` "start a run" clicks**

`btn-free` no longer exists. In the two scenarios that used it only to get a run playing — the "quit" scenario (`d.getElementById('neonvortex-btn-free').click(); // seenHowto persisted ...`) and the "pause" scenario (`d.getElementById('neonvortex-btn-free').click();`) — replace each `btn-free` click with a free-play HARD start via the new flow:

```javascript
    d.getElementById('neonvortex-diff-hard').click();   // headline now starts FREE PLAY · HARD
    d.getElementById('neonvortex-btn-start').click();
```

- [ ] **Step 2: Rewrite the layout "stacking" assertion**

In the layout scenario, the lines comparing the two play buttons:

```javascript
    const startR = d.getElementById('neonvortex-btn-start').getBoundingClientRect();
    const freeR = d.getElementById('neonvortex-btn-free').getBoundingClientRect();
    check('layout', 'play actions stack vertically on narrow screens', freeR.top >= startR.bottom - 1,
      'start.bottom=' + Math.round(startR.bottom) + ' free.top=' + Math.round(freeR.top));
```

replace with an assertion that the difficulty chip row now leads the headline:

```javascript
    const diffR = d.getElementById('neonvortex-menu-difficulty').getBoundingClientRect();
    const startR = d.getElementById('neonvortex-btn-start').getBoundingClientRect();
    check('layout', 'difficulty chips lead the headline button', diffR.bottom <= startR.top + 1,
      'diff.bottom=' + Math.round(diffR.bottom) + ' start.top=' + Math.round(startR.top));
```

And a few lines later, the layout scenario clicks `btn-free` to start a drag-input run:

```javascript
    d.getElementById('neonvortex-btn-free').click();
```

replace with:

```javascript
    d.getElementById('neonvortex-diff-hard').click();
    d.getElementById('neonvortex-btn-start').click();
```

- [ ] **Step 2b: Add a new scenario verifying the dynamic headline**

After the boot/settings scenario (near the top of `run()`, after scenario 0), add:

```javascript
    // ---------- scenario 0b: headline follows difficulty ----------
    ({ w, d } = await freshPage());
    d.getElementById('neonvortex-diff-hard').click();
    check('difficulty', 'HARD relabels the headline to PLAY · HARD',
      /PLAY\s*·\s*HARD/.test(d.getElementById('neonvortex-menu-start-label').textContent),
      d.getElementById('neonvortex-menu-start-label').textContent);
    d.getElementById('neonvortex-btn-start').click();
    check('difficulty', 'headline starts a FREE-PLAY HARD run when HARD selected',
      w.SY.nvGame.mode === 'free' && w.SY.nvGame.state && w.SY.nvGame.state.difficulty === 'hard',
      'mode=' + w.SY.nvGame.mode + ' diff=' + (w.SY.nvGame.state && w.SY.nvGame.state.difficulty));
    ({ w, d } = await freshPage());
    d.getElementById('neonvortex-diff-normal').click();
    check('difficulty', 'NORMAL relabels the headline to START DAILY',
      /START DAILY/.test(d.getElementById('neonvortex-menu-start-label').textContent),
      d.getElementById('neonvortex-menu-start-label').textContent);
    d.getElementById('neonvortex-btn-start').click();
    check('difficulty', 'headline starts the DAILY run when NORMAL selected',
      w.SY.nvGame.mode === 'daily', 'mode=' + w.SY.nvGame.mode);
```

(Note: `freshPage` persists `seenHowto` from scenario 0, so `btn-start` reaches `ready`/`playing` synchronously without the how-to gate. If a fresh profile re-triggers the how-to gate, dismiss it the same way scenario 0 does before asserting.)

- [ ] **Step 3: Run the E2E suite**

Run: `bash test/e2e/run.sh`
Expected: all scenarios PASS, including the new `difficulty` checks and the rewritten `layout` check.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/harness.html
git commit -m "test(e2e): drive runs via difficulty+headline; assert dynamic headline + chip order"
```

---

### Task 6: README, audits, standalone, run-all

**Files:** `README` + verification (+ generated `standalone.html`).

- [ ] **Step 1: Update the README game-mode section**

In `README.md`, update the "### 게임 모드" area to describe the new flow: the difficulty chips (EASY/NORMAL/HARD) now sit above the headline; with NORMAL the headline is **START DAILY** (always-NORMAL daily, worldwide-fair), with EASY/HARD it becomes **PLAY · {난이도}** (random-seed free play at that difficulty); the daily is always reachable via **오늘의 챌린지 브리핑**. Note loot was made more generous (power-ups/crates spawn more often). Do NOT change the score table.

- [ ] **Step 2: RNG fairness + performance audits**

Use the `rng-fairness-auditor` agent on the loot change (confirm crate/pow spawns still draw from the seeded `s.rng()`, no new `Math.random()` in gameplay; modifier `lootMul` still composes). Use the `performance-analyzer` agent (confirm the cap/cadence edits add no per-frame allocation).

- [ ] **Step 3: Full suite**

Run: `bash test/run-all.sh`
Expected: unit + E2E + standalone hash sync — note the hash gate will fail until Step 4 regenerates the bundle.

- [ ] **Step 4: Regenerate the standalone bundle**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html`, then re-run `bash test/run-all.sh` and confirm `=== result: ALL PASS ===`.

- [ ] **Step 5: Commit**

```bash
git add README.md standalone.html
git commit -m "docs: README difficulty-headline + loot; chore: regenerate standalone.html"
```

---

## Merge

After all tasks pass + audits clean + mobile screenshot verified:

```bash
git checkout main
git merge --no-ff feat/difficulty-flow-loot -m "Merge feat/difficulty-flow-loot: difficulty drives the headline + generous loot"
```

Confirm `bash test/run-all.sh` is GREEN on `main`.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Part A (headline follows difficulty) → Tasks 2 (DOM) + 3 (wiring) + 4 (CSS) + 5 (E2E); FREE PLAY removal → Task 2/3/5; Part ② (loot caps/cadence) → Task 1; versioning/re-pin → Task 1 Step 5; fairness/perf audits → Task 6; README → Task 6; standalone + hash gate → Task 6. No gaps.
- **Placeholder scan:** all code steps show concrete code; the CSS margin (Task 4) and the re-pin (Task 1 Step 5) are the only judgement steps and each carries an explicit rule + verification path.
- **Type/name consistency:** new ids `menu-start-label`, `menu-daily-sub`, reused `free-sub`; `difficultyValue()` (existing), `syncDifficultyChips` (existing), `startGame('daily'|'free')` (existing). Loot knobs: pow cap 4 / cadence `7/lootMul`; crate cap 3 / cadence `(5+rng*3)/lootMul`. E2E ids `menu-difficulty`, `diff-hard`, `diff-normal`, `menu-start-label`, `btn-start` — all defined in Task 2. Consistent across tasks.
