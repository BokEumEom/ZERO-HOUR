# Run Modifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every run a named per-run modifier (STANDARD + 4) that visibly changes the feel (swarm / boss / loot / enemy-variety) without touching score math, with daily deterministic from the date seed and free-play random.

**Architecture:** Knob-composition. Each modifier is a partial override shaped like a `DIFF` entry; `combineDiff(DIFF[tier], MODS[modKey])` produces the effective `s.diff` the simulation already consumes. Modifier selection uses a dedicated `makeRng(seedStr + ':mod')` sub-RNG so it is deterministic and does not consume the gameplay stream. One new knob, `lootMul`, scales crate/power-up cadence.

**Tech Stack:** Vanilla JS IIFE modules on `window.SY`; Canvas 2D; zero-dependency tests (`node --test` `.mjs` via `test/unit/helpers.mjs` vm sandbox + headless Edge E2E).

**Design:** `docs/plans/2026-06-26-run-modifier-design.md`

---

## File Structure

- `js/games/neonvortex/game.js` — `MOD_KEYS` + `MODS` table, `combineDiff`, `pickModifier`, `G.previewModifier`; add `lootMul: 1.0` to the three `DIFF` tiers; `freshState` composes `s.diff` and stores `s.modifier`; result object exposes `modifier`; two loot-cadence lines divide by `s.diff.lootMul`. (Pure-logic core — unit-tested.)
- `test/unit/modifier.test.mjs` — new unit test for composition, selection determinism, freshState wiring, lootMul cadence.
- `index.html` — `#neonvortex-hud-modifier` chip, `#neonvortex-chal-modifier` briefing row, `#neonvortex-over-modifier` game-over row.
- `js/games/neonvortex/main.js` — populate HUD chip, daily-briefing preview, game-over display, share text.
- `css/neonvortex.css` — modifier chip styling (reuse existing tokens).
- `README` (Korean) — short "런 모디파이어" section (score table unchanged).
- `standalone.html` — regenerated after merge (never hand-edited).

---

### Task 1: Composition core — `MODS` table + `combineDiff` + `lootMul` knob

**Files:**
- Modify: `js/games/neonvortex/game.js` (DIFF table ~42-46; add new block after DIFF)
- Test: `test/unit/modifier.test.mjs` (create)

- [ ] **Step 1: Write the failing test**

Create `test/unit/modifier.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' }
);

test('MODS exposes STANDARD + 4 modifiers with display names', () => {
  const G = boot().SY.nvGame;
  assert.deepEqual(G.MOD_KEYS, ['standard', 'mineRush', 'ironWarden', 'treasure', 'vanguard']);
  for (const k of G.MOD_KEYS) {
    assert.equal(typeof G.MODS[k].nameKo, 'string', k + ' has KO name');
    assert.equal(typeof G.MODS[k].nameEn, 'string', k + ' has EN name');
  }
});

test('combineDiff multiplies *Mul knobs, adds caps, replaces foes, is immutable', () => {
  const G = boot().SY.nvGame;
  const base = G.DIFF.normal;
  const out = G.combineDiff(base, G.MODS.mineRush);
  assert.equal(out.surgeMul, base.surgeMul * 1.5);
  assert.equal(out.mineCap, base.mineCap + 6);
  assert.equal(out.mineSpeedMul, base.mineSpeedMul * 1.1);
  // untouched knobs pass through
  assert.equal(out.spawnMul, base.spawnMul);
  assert.equal(out.foes, base.foes, 'mineRush keeps tier foes');
  // returns a new object; base not mutated
  assert.notEqual(out, base);
  assert.equal(G.DIFF.normal.mineCap, 12, 'base unchanged');
  assert.ok(Object.isFrozen(out), 'result frozen');
});

test('combineDiff: vanguard replaces foes and bumps turretCap', () => {
  const G = boot().SY.nvGame;
  const out = G.combineDiff(G.DIFF.normal, G.MODS.vanguard);
  assert.deepEqual(out.foes, { hunter: 2, charger: 2, shield: 1, laser: 1 });
  assert.equal(out.turretCap, G.DIFF.normal.turretCap + 1);
});

test('combineDiff: treasure/ironWarden scale lootMul; STANDARD is a true no-op', () => {
  const G = boot().SY.nvGame;
  assert.equal(G.DIFF.normal.lootMul, 1.0, 'tiers carry a neutral lootMul');
  assert.equal(G.combineDiff(G.DIFF.normal, G.MODS.treasure).lootMul, 1.8);
  assert.equal(G.combineDiff(G.DIFF.normal, G.MODS.treasure).spawnMul, G.DIFF.normal.spawnMul * 0.8);
  assert.equal(G.combineDiff(G.DIFF.normal, G.MODS.ironWarden).bossHpMul, G.DIFF.normal.bossHpMul * 1.4);
  assert.equal(G.combineDiff(G.DIFF.normal, G.MODS.ironWarden).bossFireMul, G.DIFF.normal.bossFireMul * 0.85);
  // STANDARD composes byte-identically to the base tier
  assert.deepEqual(G.combineDiff(G.DIFF.normal, G.MODS.standard), G.DIFF.normal);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/modifier.test.mjs`
Expected: FAIL — `G.MOD_KEYS` / `G.MODS` / `G.combineDiff` undefined.

- [ ] **Step 3: Add `lootMul` to the three DIFF tiers**

In `js/games/neonvortex/game.js`, add `lootMul: 1.0,` to each frozen tier (place it right after `surgeMul`):

```javascript
    easy:   Object.freeze({ turretCap: 0, turretFire: 2.6, spawnMul: 0.75, mineSpeedMul: 0.85, mineCap: 9,  surgeMul: 0.7, lootMul: 1.0, bossHpMul: 0.75, bossFireMul: 1.25, foes: Object.freeze({}) }),
    normal: Object.freeze({ turretCap: 2, turretFire: 2.6, spawnMul: 1.0,  mineSpeedMul: 1.0,  mineCap: 12, surgeMul: 1.0, lootMul: 1.0, bossHpMul: 1.0,  bossFireMul: 1.0,  foes: Object.freeze({ hunter: 2, charger: 1 }) }),
    hard:   Object.freeze({ turretCap: 3, turretFire: 1.9, spawnMul: 1.3,  mineSpeedMul: 1.2,  mineCap: 16, surgeMul: 1.4, lootMul: 1.0, bossHpMul: 1.33, bossFireMul: 0.8,  foes: Object.freeze({ hunter: 2, charger: 2, shield: 1, laser: 1 }) }),
```

- [ ] **Step 4: Add the `MODS` table and `combineDiff`**

In `js/games/neonvortex/game.js`, immediately after the `DIFF` declaration block, add:

```javascript
  // ---- per-run modifiers (layer on top of DIFF; score-neutral) ----
  // *Mul fields multiply the base knob; *Add fields add to a cap; foes replaces.
  const MOD_KEYS = ['standard', 'mineRush', 'ironWarden', 'treasure', 'vanguard'];
  const MODS = Object.freeze({
    standard:   Object.freeze({ nameKo: '기본', nameEn: 'STANDARD' }),
    mineRush:   Object.freeze({ nameKo: '기뢰 폭주', nameEn: 'MINE RUSH', surgeMul: 1.5, mineCapAdd: 6, mineSpeedMul: 1.1 }),
    ironWarden: Object.freeze({ nameKo: '강철 워든', nameEn: 'IRON WARDEN', bossHpMul: 1.4, bossFireMul: 0.85, lootMul: 1.4 }),
    treasure:   Object.freeze({ nameKo: '보물 항로', nameEn: 'TREASURE', lootMul: 1.8, spawnMul: 0.8 }),
    vanguard:   Object.freeze({ nameKo: '정예 전선', nameEn: 'VANGUARD', foes: Object.freeze({ hunter: 2, charger: 2, shield: 1, laser: 1 }), turretCapAdd: 1 }),
  });

  // Compose a base DIFF tier with a modifier → a new frozen DIFF-shaped object.
  function combineDiff(base, mod) {
    return Object.freeze({
      turretCap:    base.turretCap + (mod.turretCapAdd || 0),
      turretFire:   base.turretFire * (mod.turretFireMul || 1),
      spawnMul:     base.spawnMul * (mod.spawnMul || 1),
      mineSpeedMul: base.mineSpeedMul * (mod.mineSpeedMul || 1),
      mineCap:      base.mineCap + (mod.mineCapAdd || 0),
      surgeMul:     base.surgeMul * (mod.surgeMul || 1),
      lootMul:      base.lootMul * (mod.lootMul || 1),
      bossHpMul:    base.bossHpMul * (mod.bossHpMul || 1),
      bossFireMul:  base.bossFireMul * (mod.bossFireMul || 1),
      foes:         mod.foes || base.foes,
    });
  }
```

Then expose on the `G` object (in the `const G = { ... }` literal at ~line 86, add to the existing exposed knobs):

```javascript
    W, H, POWER_META, POWER_DURATION, DIFF, MODS, MOD_KEYS,
```

And after `SY.nvGame = G;`, add the test/UI seam:

```javascript
  G.combineDiff = combineDiff;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/modifier.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/modifier.test.mjs
git commit -m "feat: modifier composition core (MODS table + combineDiff + lootMul knob)"
```

---

### Task 2: Deterministic selection — `pickModifier` + `G.previewModifier`

**Files:**
- Modify: `js/games/neonvortex/game.js` (after `combineDiff`; and a `G.previewModifier` assignment)
- Test: `test/unit/modifier.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/modifier.test.mjs`:

```javascript
test('previewModifier is deterministic per seed and uses a dedicated :mod sub-RNG', () => {
  const G = boot().SY.nvGame;
  const a = G.previewModifier('daily-2026-06-26');
  const b = G.previewModifier('daily-2026-06-26');
  assert.equal(a.key, b.key, 'same seed -> same modifier');
  assert.ok(G.MOD_KEYS.includes(a.key));
  assert.equal(a.nameEn, G.MODS[a.key].nameEn);
  // different seeds can differ; the function never throws and always returns a valid key
  assert.ok(G.MOD_KEYS.includes(G.previewModifier('free-abc123').key));
});

test('a daily date is identical worldwide (two independent boots agree)', () => {
  const k1 = boot().SY.nvGame.previewModifier('daily-2026-07-04').key;
  const k2 = boot().SY.nvGame.previewModifier('daily-2026-07-04').key;
  assert.equal(k1, k2);
});

test('modifier distribution covers all 5 keys across many seeds (uniform-ish)', () => {
  const G = boot().SY.nvGame;
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(G.previewModifier('free-seed-' + i).key);
  assert.equal(seen.size, 5, 'all five modifiers are reachable');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/modifier.test.mjs`
Expected: FAIL — `G.previewModifier` is not a function.

- [ ] **Step 3: Implement `pickModifier` + `previewModifier`**

In `js/games/neonvortex/game.js`, right after `combineDiff`, add:

```javascript
  // Pick a modifier key from a seeded RNG (uniform over MOD_KEYS).
  function pickModifier(rng) { return MOD_KEYS[Math.floor(rng() * MOD_KEYS.length)]; }

  // Resolve the modifier for a seed without starting a run (daily briefing preview).
  // Dedicated ':mod' sub-RNG: does NOT consume the gameplay stream → deterministic
  // worldwide and independent of spawn/drop randomness.
  function modifierFor(seedStr) {
    const key = pickModifier(SY.makeRng(seedStr + ':mod'));
    return { key, nameKo: MODS[key].nameKo, nameEn: MODS[key].nameEn };
  }
```

Then, near the other `G.*` assignments (after `G.combineDiff = combineDiff;`), add:

```javascript
  G.previewModifier = modifierFor;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/modifier.test.mjs`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/modifier.test.mjs
git commit -m "feat: deterministic modifier selection (pickModifier + previewModifier)"
```

---

### Task 3: Wire into `freshState` + result object

**Files:**
- Modify: `js/games/neonvortex/game.js` (`freshState` ~94-131; result object ~523-533)
- Test: `test/unit/modifier.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/modifier.test.mjs`:

```javascript
test("freshState composes s.diff and stores s.modifier matching the seed's preview", () => {
  const G = boot().SY.nvGame;
  G.start('free', 'normal');
  const s = G.state;
  assert.ok(s.modifier && G.MOD_KEYS.includes(s.modifier.key), 's.modifier set');
  // the run's modifier equals the pure preview of its own seed (deterministic wiring)
  assert.equal(s.modifier.key, G.previewModifier(s.seedStr).key);
  // s.diff is the composition of the tier and the chosen modifier
  assert.deepEqual(s.diff, G.combineDiff(G.DIFF.normal, G.MODS[s.modifier.key]));
});

test('daily modifier is deterministic for the frozen date and survives into the result', () => {
  const sb = boot();
  const G = sb.SY.nvGame;
  const expected = G.previewModifier('daily-' + sb.SY.todayUTC()).key;
  G.start('daily');
  assert.equal(G.state.modifier.key, expected);
  // game-over result carries the modifier
  let res = null;
  G.events.onGameOver = (r) => { res = r; };
  for (let i = 0; i < 60 * 80 && !res; i++) { G.state.player.hp = 0; G.update(1 / 60); }
  assert.ok(res, 'run ended');
  assert.equal(res.modifier.key, expected);
});

test('HARD + modifier stack: tier knobs and modifier knobs both apply', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'hard');
  const s = G.state;
  assert.deepEqual(s.diff, G.combineDiff(G.DIFF.hard, G.MODS[s.modifier.key]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/modifier.test.mjs`
Expected: FAIL — `s.modifier` is undefined; `s.diff` equals `DIFF.normal` not the composition.

- [ ] **Step 3: Compose `s.diff` and store `s.modifier` in `freshState`**

In `js/games/neonvortex/game.js` `freshState`, replace the diff-key line and the `diff:` property. Current:

```javascript
    const diffKey = DIFF[difficulty] ? difficulty : 'normal';
    const st = {
      rng, seedStr, mode, duration,
      difficulty: diffKey, diff: DIFF[diffKey],
```

becomes:

```javascript
    const diffKey = DIFF[difficulty] ? difficulty : 'normal';
    const modifier = modifierFor(seedStr); // { key, nameKo, nameEn } — score-neutral
    const st = {
      rng, seedStr, mode, duration,
      difficulty: diffKey, diff: combineDiff(DIFF[diffKey], MODS[modifier.key]),
      modifier,
```

- [ ] **Step 4: Add `modifier` to the game-over result object**

In `js/games/neonvortex/game.js`, in the `res` object (~523), add after the `difficulty:` line:

```javascript
      difficulty: s.difficulty,
      modifier: s.modifier,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/modifier.test.mjs`
Expected: PASS (10 tests total).

- [ ] **Step 6: Run the FULL unit suite and re-pin any seed-pinned breakage**

Run: `node --test test/unit/`
Expected: Some seed-pinned daily/count tests may now fail because non-STANDARD daily dates change spawn formations (intended versioned change — STANDARD dates stay byte-identical). For each failure, confirm the new value is a legitimate consequence of the composed knobs (not a logic bug), then update the pinned expectation. Prefer asserting knobs over runtime counts where a count is incidental (follow the existing `difficulty.test.mjs` mine-cap pattern). Document each re-pin in the commit body.

- [ ] **Step 7: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/
git commit -m "feat: apply per-run modifier in freshState + result; re-pin seed tests"
```

---

### Task 4: `lootMul` scales crate / power-up cadence

**Files:**
- Modify: `js/games/neonvortex/game.js` (update loop ~692, ~700)
- Test: `test/unit/modifier.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/modifier.test.mjs`:

```javascript
test('crate cadence divides by lootMul (STANDARD keeps base 7..12s window)', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'normal');
  const s = G.state;
  // force a no-loot-mod run for a stable assertion window
  s.diff = G.combineDiff(G.DIFF.normal, G.MODS.standard);
  s.spawnT.crate = 0.0001;
  s.crates.length = 0;
  G.update(1 / 60); // triggers the crate cadence reset
  assert.ok(s.spawnT.crate >= 7 && s.spawnT.crate <= 12, 'base window with lootMul=1: ' + s.spawnT.crate);
});

test('higher lootMul shortens crate cadence (treasure < standard reset)', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'normal');
  const s = G.state;
  s.diff = G.combineDiff(G.DIFF.normal, G.MODS.treasure); // lootMul 1.8
  s.spawnT.crate = 0.0001;
  s.crates.length = 0;
  G.update(1 / 60);
  assert.ok(s.spawnT.crate >= 7 / 1.8 && s.spawnT.crate <= 12 / 1.8, 'treasure window: ' + s.spawnT.crate);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/modifier.test.mjs`
Expected: FAIL — treasure-window test fails because cadence is still `7 + rng*5` (≥7), ignoring `lootMul`.

- [ ] **Step 3: Divide the two loot-cadence lines by `lootMul`**

In `js/games/neonvortex/game.js` `update()`:

Power-up cadence (~692). Current:

```javascript
    if (s.spawnT.pow <= 0) { s.spawnT.pow = 9.5; if (s.pows.length < 3) spawnPow(s); }
```

becomes:

```javascript
    if (s.spawnT.pow <= 0) { s.spawnT.pow = 9.5 / s.diff.lootMul; if (s.pows.length < 3) spawnPow(s); }
```

Crate cadence (~700). Current:

```javascript
      s.spawnT.crate = 7 + s.rng() * 5;
```

becomes:

```javascript
      s.spawnT.crate = (7 + s.rng() * 5) / s.diff.lootMul;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/modifier.test.mjs`
Expected: PASS (12 tests total).

- [ ] **Step 5: Run full unit suite**

Run: `node --test test/unit/`
Expected: PASS (lootMul=1.0 on all tiers ⇒ non-modifier runs are byte-identical; division by 1 is a no-op).

- [ ] **Step 6: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/modifier.test.mjs
git commit -m "feat: lootMul scales crate/power-up cadence (TREASURE/IRON WARDEN loot)"
```

---

### Task 5: UI surfacing — HUD chip, daily-briefing preview, game-over, share text

DOM-bound code (uses `document`/`$`), so it is verified via headless E2E + gallery visual rather than the vm unit harness (consistent with the rest of `main.js`).

**Files:**
- Modify: `index.html` (HUD ~51; briefing card ~344; game-over ~137)
- Modify: `js/games/neonvortex/main.js` (`hudEls` ~68; `updateHud` ~119; `renderChallenge` ~406; game-over ~1120; `buildShare` ~1209)
- Modify: `css/neonvortex.css` (new chip class)

- [ ] **Step 1: Add DOM hooks in `index.html`**

After the `#neonvortex-hud-mode` span (~51), add:

```html
        <span id="neonvortex-hud-modifier" class="nv-hud-mod"></span>
```

In the briefing card, after the `DATE / SEED` row block (after the `#neonvortex-chal-seed-note` `<p>`, ~345), add:

```html
            <div class="nv-chal-row">
              <span class="nv-chal-row-label">MODIFIER</span>
              <span class="nv-chal-row-val nv-chal-row-val-cyan" id="neonvortex-chal-modifier">—</span>
            </div>
```

In the game-over screen, after the `#neonvortex-over-mode` kicker (~137), add:

```html
          <span id="neonvortex-over-modifier" class="kicker"></span>
```

- [ ] **Step 2: Register and populate the HUD chip in `main.js`**

Add `modifier: $('hud-modifier'),` to the `hudEls` object (~70). In `updateHud`, after the `hudEls.mode.textContent = ...` line (~119), add:

```javascript
    hudEls.modifier.textContent = s.modifier && s.modifier.key !== 'standard' ? s.modifier.nameEn : '';
```

- [ ] **Step 3: Preview today's modifier in the daily briefing**

In `renderChallenge` (~406), after the `chal-seed` line, add:

```javascript
    const todayMod = G.previewModifier('daily-' + recs.today);
    $('chal-modifier').textContent = todayMod.nameKo + ' (' + todayMod.nameEn + ')';
```

- [ ] **Step 4: Show the modifier on the game-over screen**

In the game-over handler, after the `$('over-mode').textContent = ...` line (~1120), add:

```javascript
    $('over-modifier').textContent = res.modifier && res.modifier.key !== 'standard'
      ? res.modifier.nameKo + ' · ' + res.modifier.nameEn : '';
```

- [ ] **Step 5: Include the modifier in the daily share text**

In `buildShare` (~1209), change the title line to append a non-standard modifier:

```javascript
    return [
      'NEON VORTEX · Daily ' + recs.today + (res.modifier && res.modifier.key !== 'standard' ? ' · ' + res.modifier.nameEn : ''),
      'SCORE ' + fmt(res.score) + ' · MAX COMBO ×' + res.maxCombo,
      (res.bossDown ? '💎 CORE WARDEN CLEARED' : '⬡ core survived…'),
      bar,
    ].join('\n');
```

- [ ] **Step 6: Style the HUD chip in `css/neonvortex.css`**

Add (reuse existing palette tokens; mirror the `#neonvortex-hud-mode` look with an accent border):

```css
.nv-hud-mod {
  margin-left: 8px;
  padding: 1px 6px;
  border: 1px solid var(--nv-accent, #36e0ff);
  border-radius: 4px;
  color: var(--nv-accent, #36e0ff);
  font-size: 0.72em;
  letter-spacing: 0.08em;
}
.nv-hud-mod:empty { display: none; }
```

(Confirm the actual token names in `css/tokens.css`; if `--nv-accent` differs, use the existing accent token rather than a hardcoded hex.)

- [ ] **Step 7: Verify visually**

Run the headless E2E suite (`test/run-all.ps1` or `test/run-all.sh`) and confirm no regressions. Open `index.html`, start a free-play run repeatedly until a non-STANDARD modifier appears, and confirm: HUD chip shows the EN name; daily briefing shows "오늘의 모디파이어"; game-over shows the modifier; `COPY RESULT` includes it. Capture a gallery screenshot of the HUD chip + briefing badge for the visual record.

- [ ] **Step 8: Commit**

```bash
git add index.html js/games/neonvortex/main.js css/neonvortex.css
git commit -m "feat: surface run modifier in HUD, daily briefing, game-over, share"
```

---

### Task 6: README — "런 모디파이어" section

**Files:**
- Modify: `README` (Korean; the game-overview / sections area — score table stays unchanged)

- [ ] **Step 1: Add a short section**

Add a "런 모디파이어 (Run Modifier)" subsection describing: each run gets one of STANDARD + 4 modifiers; daily is deterministic (everyone gets the same modifier that day, shown in the briefing); free-play is random per run; modifiers change enemies/structure/loot/boss only and **never** change scoring (so leaderboards stay comparable). List the four: 기뢰 폭주 / 강철 워든 / 보물 항로 / 정예 전선 with one-line feels. Do NOT modify the score table.

- [ ] **Step 2: Verify score-table sync is untouched**

Run: `node --test test/unit/` (and the score-sync check in `test/run-all`).
Expected: PASS — modifiers are score-neutral, so no score constants changed.

- [ ] **Step 3: Commit**

```bash
git add README*
git commit -m "docs: README run-modifier section (score-neutral)"
```

---

### Task 7: Audits, standalone regen, hash gate

**Files:** none new — verification + generated `standalone.html`.

- [ ] **Step 1: RNG fairness audit**

Use the `rng-fairness-auditor` agent on the spawning/selection changes. Confirm: all gameplay randomness still flows through `s.rng()`; modifier selection uses the dedicated `:mod` sub-RNG; no new `Math.random()` in gameplay paths.

- [ ] **Step 2: Performance audit**

Use the `performance-analyzer` agent. Confirm: `combineDiff`/`modifierFor` run once per run (in `freshState`), not per frame; the two `lootMul` divisions add no per-frame allocation; the 60fps hot path is unchanged in allocation profile.

- [ ] **Step 3: Full test suite**

Run: `test/run-all.ps1` (or `test/run-all.sh`).
Expected: node --test + headless Edge E2E + bundle hash sync all GREEN (hash will be stale until Step 4 — run after regen, or expect the hash gate to flag it now).

- [ ] **Step 4: Regenerate the standalone bundle (user-run)**

The user runs `/build-standalone` to regenerate `standalone.html` (a PreToolUse hook blocks hand-edits). Then re-run `test/run-all` so the bundle hash-sync gate is GREEN.

- [ ] **Step 5: Commit the regenerated bundle**

```bash
git add standalone.html
git commit -m "chore: regenerate standalone.html (run modifier)"
```

---

## Merge

After all tasks pass and audits are clean:

```bash
git checkout main
git merge --no-ff feat/run-modifier -m "Merge feat/run-modifier: per-run modifier (STANDARD + 4, score-neutral)"
```

Then confirm `test/run-all` is GREEN on `main` (hash gate included).

---

## Self-Review (completed by plan author)

- **Spec coverage:** scope (daily deterministic / free random) → Task 2-3; score-neutral → all tasks (no score constant touched) + Task 6 verify; STANDARD + 4 set → Task 1; mechanism/combineDiff + lootMul → Task 1, 4; selection → Task 2; UI (briefing/HUD/game-over/share) → Task 5; fairness/versioning + re-pin → Task 3 Step 6, Task 7; testing → Tasks 1-4 unit + Task 5 E2E/visual + Task 7 audits; README → Task 6; standalone + hash gate → Task 7. No gaps.
- **Placeholder scan:** all code steps show concrete code; the one judgement step (re-pin, Task 3 Step 6) is inherently data-dependent and gives the decision rule + an example pattern to follow.
- **Type/name consistency:** `MOD_KEYS`, `MODS`, `combineDiff`, `modifierFor`/`G.previewModifier`, `s.modifier` (`{key,nameKo,nameEn}`), `lootMul`, `*Mul`/`*Add`/`*CapAdd` mod fields, DOM ids `hud-modifier`/`chal-modifier`/`over-modifier` — used consistently across tasks.
