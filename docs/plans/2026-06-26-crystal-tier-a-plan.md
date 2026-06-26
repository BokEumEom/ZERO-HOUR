# Crystal Value Tiers (a) — Rare Large Gem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the flat crystal economy with a rare, seeded high-value large gem that
absorbs an unused section-7 gem sprite — a risk/reward "go grab it" target worth 40 pts.

**Architecture:** Extend the existing crystal entity with a `big` flag instead of adding a
new array/system. `spawnCrystalCluster` rolls one seeded large gem per cluster (~22%);
the collect loop awards `40 + combo` (vs `10 + combo`) into the existing `crystals`
breakdown bucket; `drawCrystal` renders a distinct large gem sprite. Daily-fair (all rolls
seeded via `s.rng()`), no new `Math.random` (baseline 14 unchanged), allocation-free.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors.

---

## File Structure

- `js/games/neonvortex/sprites.js` — add `crystalLarge` atlas rect (section-7 unused gem).
- `js/games/neonvortex/game.js` — `spawnCrystalCluster` seeded big-gem roll; collect scoring branch.
- `js/games/neonvortex/render.js` — `drawCrystal` `big` branch (atlas key + vector fallback).
- `test/unit/crystal-tier.test.mjs` — new unit tests (occurrence, value, determinism).
- `test/unit/static.test.mjs` — pins (rect present, spawn roll, render branch).
- `README.md` — score table row for the large gem (CLAUDE.md score-sync rule).

---

### Task 1: Add the `crystalLarge` atlas rect

**Files:**
- Modify: `js/games/neonvortex/sprites.js:89` (end of the `A` rect table, after `drone2`)
- Verify: `assets/sprite-atlas.png` section-7 (CURRENCY/REWARD), gem row ~y690–790

- [ ] **Step 1: Locate the unused large gem rect (crop + verify on white)**

The used section-7 gems are `crystalTeal (216,734,40×64)`, `crystalAmber (400,730,46×64)`,
`crystalBoss (758,701,46×89)`. A larger cyan/teal gem variant sits unused in the same row.
Crop candidate regions and eyeball on a white background (LEARNINGS §7 method):

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
# Try the gap between amber(x446) and boss(x758), and left of teal(x<216).
python3 - <<'PY'
from PIL import Image
img = Image.open("assets/sprite-atlas.png").convert("RGBA")
for name,(x,y,w,h) in {
  "gapA":(470,694,120,96), "gapB":(600,694,150,96), "left":(40,700,160,90),
}.items():
    crop = img.crop((x,y,x+w,y+h))
    bg = Image.new("RGBA", crop.size, (255,255,255,255)); bg.alpha_composite(crop)
    bg.convert("RGB").save(f"/tmp/gemcrop-{name}.png")
    print(name, x,y,w,h)
PY
```

Read each `/tmp/gemcrop-*.png`, pick the single clean unused large gem, and tighten the
bbox to the visible gem (flood-fill / pixel-scan the alpha to find tight extents). Record
the final `{x,y,w,h}`. Expected: one distinct large gem, larger than the 40×64 teal.

- [ ] **Step 2: Add the rect to the `A` table**

Insert after the `drone2` line (`js/games/neonvortex/sprites.js:89`), using the verified
coordinates (the values below are a placeholder to be REPLACED with Step 1's result):

```javascript
    crystalLarge:{ x: 0, y: 0, w: 0, h: 0 }, // rare large value gem (section 7) — REPLACE with verified rect
```

- [ ] **Step 3: Commit**

```bash
git add js/games/neonvortex/sprites.js
git commit -m "feat: add crystalLarge atlas rect (section-7 large gem)"
```

---

### Task 2: Seeded large-gem spawn + collect scoring (`game.js`)

**Files:**
- Modify: `js/games/neonvortex/game.js:145-157` (`spawnCrystalCluster`)
- Modify: `js/games/neonvortex/game.js:710` (crystal collect — `addScore`)
- Test: `test/unit/crystal-tier.test.mjs` (created in Task 4)

- [ ] **Step 1: Add the seeded big-gem roll to `spawnCrystalCluster`**

Replace the body of `spawnCrystalCluster` (game.js:145-157) with:

```javascript
  function spawnCrystalCluster(s) {
    const cx = 70 + s.rng() * (W - 140);
    const cy = 70 + s.rng() * (H - 140);
    const n = 4 + Math.floor(s.rng() * 3);
    // rare seeded large gem: ~22% of clusters contain one oversized high-value gem.
    const bigIdx = s.rng() < 0.22 ? Math.floor(s.rng() * n) : -1;
    for (let i = 0; i < n; i++) {
      const a = s.rng() * Math.PI * 2, d = s.rng() * 52;
      const big = i === bigIdx;
      s.crystals.push({
        x: Math.min(W - 20, Math.max(20, cx + Math.cos(a) * d)),
        y: Math.min(H - 20, Math.max(20, cy + Math.sin(a) * d)),
        vx: 0, vy: 0, r: big ? 12 : 7, phase: s.rng() * Math.PI * 2, big,
      });
    }
  }
```

- [ ] **Step 2: Branch the collect score on `big`**

Replace game.js:710 (`addScore(s, 10 + s.combo, ...)`) and its burst (game.js:711) with:

```javascript
        addScore(s, (c.big ? 40 : 10) + s.combo, c.x, c.y, undefined, 'crystal');
        burst(s, c.x, c.y, c.big ? '#7df9ff' : '#2de2c6', c.big ? 12 : 7, c.big ? 210 : 150, 2.2);
```

(`crystalsCollected++` and combo/heat lines are unchanged — a large gem is still one pickup.)

- [ ] **Step 3: Run the existing suite to confirm no regression**

Run: `node --test test/unit/game.test.mjs test/unit/loot.test.mjs`
Expected: PASS (breakdown-sum property still holds; `crystals` bucket absorbs the +40).

- [ ] **Step 4: Commit**

```bash
git add js/games/neonvortex/game.js
git commit -m "feat: seeded rare large gem (40pts) in crystal clusters"
```

---

### Task 3: Render the large gem distinctly (`render.js`)

**Files:**
- Modify: `js/games/neonvortex/render.js:63-81` (`drawCrystal`)

- [ ] **Step 1: Add the `big` branch to both the atlas key and the vector fallback**

Replace the `key`/`glow`/`core` lines in `drawCrystal` (render.js:65, 67-68) so `big` wins
over surge/boss:

```javascript
    const key = c.big ? 'crystalLarge' : (c.tier === 'boss' ? 'crystalBoss' : (inSurge ? 'crystalAmber' : 'crystalTeal'));
```

```javascript
    const glow = c.big ? '#39d8ff' : (c.tier === 'boss' ? '#9c43e1' : (inSurge ? '#ffb028' : '#2de2c6'));
    const core = c.big ? '#cdfaff' : (c.tier === 'boss' ? '#e3b6ff' : (inSurge ? '#ffe6a8' : '#9ff5e8'));
```

The size already scales with `c.r` (`(c.r + 2) * 2.9`), so the `r:12` large gem renders
~1.7× bigger automatically — no extra size code. No new per-frame allocation.

- [ ] **Step 2: Visual sanity via the gallery (optional dev check)**

Run: `bash test/e2e/gallery.sh` then read `/tmp/sy-gallery/playfield.png`
Expected: clusters occasionally show one larger, brighter cyan gem distinct from the teal ones.

- [ ] **Step 3: Commit**

```bash
git add js/games/neonvortex/render.js
git commit -m "feat: render large gem with distinct sprite + glow"
```

---

### Task 4: Unit tests (`crystal-tier.test.mjs`)

**Files:**
- Create: `test/unit/crystal-tier.test.mjs`
- Reference: `test/unit/helpers.mjs` (shared boot), `test/unit/loot.test.mjs` (pattern)

- [ ] **Step 1: Write the failing tests**

Mirror the existing boot pattern (see `loot.test.mjs` for how the game core is loaded and
stepped). Create `test/unit/crystal-tier.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from './helpers.mjs';

// Drive many seeded clusters and assert a large gem (big:true) eventually appears.
test('crystal clusters occasionally spawn a seeded large gem', () => {
  const G = bootGame();
  const s = G.freshState('normal', 60, 'seed-crystal-tier');
  let sawBig = false;
  for (let k = 0; k < 200 && !sawBig; k++) {
    G._spawnCrystalCluster(s);
    if (s.crystals.some((c) => c.big === true)) sawBig = true;
  }
  assert.equal(sawBig, true, 'a large gem should appear across many seeded clusters');
});

// A large gem is worth 40 + combo into the crystals bucket; normal is 10 + combo.
test('large gem awards 40 + combo into the crystals bucket', () => {
  const G = bootGame();
  const s = G.freshState('normal', 60, 'seed-big-score');
  s.crystals = [{ x: s.player.x, y: s.player.y, vx: 0, vy: 0, r: 12, phase: 0, big: true }];
  const before = s.breakdown.crystals;
  G.update(s, 1 / 60); // collision picks it up (gem on the player)
  assert.equal(s.crystals.length, 0, 'gem collected');
  assert.equal(s.breakdown.crystals - before, 40 + s.combo - 1 /* combo incremented on pickup */, 'big gem = 40 + prior combo');
});

// Determinism: identical seed → identical big-gem placement.
test('large-gem placement is deterministic for a fixed seed', () => {
  const G = bootGame();
  const run = () => {
    const s = G.freshState('normal', 60, 'seed-determ');
    const out = [];
    for (let k = 0; k < 30; k++) { G._spawnCrystalCluster(s); }
    return s.crystals.map((c) => (c.big ? 1 : 0)).join('');
  };
  assert.equal(run(), run(), 'same seed → same big-gem pattern');
});
```

NOTE: If `helpers.mjs` does not already expose `freshState`/`update`/`_spawnCrystalCluster`,
check how `loot.test.mjs` reaches internals. `spawnCrystalCluster` is currently a private
function in `game.js`; if it is NOT exported on the test API, EITHER (preferred) drive
clusters indirectly by stepping `update()` past the crystal spawn timer and inspecting
`s.crystals`, OR add `spawnCrystalCluster` to the test-only export the same way other
spawn helpers are exposed. Use whichever pattern the existing tests already use — do not
invent a new export surface.

- [ ] **Step 2: Run to verify they fail (feature not yet wired / API mismatch)**

Run: `node --test test/unit/crystal-tier.test.mjs`
Expected: FAIL before Task 2 is in place (no `big` gems), or an API-shape error guiding
the Step-1 NOTE resolution.

- [ ] **Step 3: Reconcile the test API with the real export surface**

Open `test/unit/helpers.mjs` and `test/unit/loot.test.mjs`, confirm the exact boot call
(`bootGame`, `freshState` signature, how `update` is named/called, and whether spawn
helpers are reachable). Adjust the test to match the REAL API. Re-run until the three
tests pass against the implemented feature.

Run: `node --test test/unit/crystal-tier.test.mjs`
Expected: PASS (3/3).

- [ ] **Step 4: Commit**

```bash
git add test/unit/crystal-tier.test.mjs
git commit -m "test: crystal large-gem occurrence, value, determinism"
```

---

### Task 5: Static pins + README score row

**Files:**
- Modify: `test/unit/static.test.mjs` (add pins)
- Modify: `README.md` (score table)

- [ ] **Step 1: Add static pins**

Find the section in `static.test.mjs` that pins atlas rects and render/spawn branches
(it already pins things like `Math.random` baseline 14 and CORE/load order). Add asserts
that the source text contains the new feature markers:

```javascript
test('crystal large-gem feature is wired (static pins)', () => {
  const sprites = readSrc('js/games/neonvortex/sprites.js');
  assert.match(sprites, /crystalLarge\s*:/, 'crystalLarge rect present');
  const game = readSrc('js/games/neonvortex/game.js');
  assert.match(game, /s\.rng\(\)\s*<\s*0\.22/, 'seeded big-gem roll present');
  assert.match(game, /c\.big\s*\?\s*40\s*:\s*10/, 'big-gem scoring branch present');
  const render = readSrc('js/games/neonvortex/render.js');
  assert.match(render, /c\.big\s*\?\s*'crystalLarge'/, 'large-gem render branch present');
});
```

(Use the file-read helper already present in `static.test.mjs` — match its existing
`readSrc`/`read`/`fs.readFileSync` convention; do not introduce a new one.)

- [ ] **Step 2: Run the static suite**

Run: `node --test test/unit/static.test.mjs`
Expected: PASS.

- [ ] **Step 3: Add the README score row**

In the Korean README score table (점수 시스템 section), add a row for the large gem next to
the existing crystal row, e.g. `대형 젬 (희귀) | 40 + 콤보`. Keep wording consistent with
the existing rows. This satisfies the CLAUDE.md "score constants ↔ README" invariant.

- [ ] **Step 4: Commit**

```bash
git add test/unit/static.test.mjs README.md
git commit -m "test: pin crystal large-gem wiring; docs: README score row"
```

---

### Task 6: Full suite (3× stable) + audits + finish

**Files:** none (verification + merge workflow)

- [ ] **Step 1: Run the full suite three times for stability**

Run (×3): `bash test/run-all.sh`
Expected each time: unit+static PASS, E2E PASS, standalone sync — note: standalone will
report OUT OF SYNC until Step 4 regenerates it; that is expected mid-feature.

- [ ] **Step 2: rng-fairness audit**

Dispatch the `rng-fairness-auditor` agent over the crystal-tier changes. Expected: the
big-gem roll + index pick use `s.rng()`; no new `Math.random` in gameplay paths
(burst color/particles are cosmetic). Resolve any finding before merge.

- [ ] **Step 3: performance audit**

Dispatch the `performance-analyzer` agent over `game.js`/`render.js` changes. Expected:
no new per-frame allocation (one extra branch in the collect loop and drawCrystal).

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch — merge `feat/crystal-tier` to `main`
`--no-ff`, delete the branch, then regenerate `standalone.html` via `/build-standalone`
and confirm the hash gate is GREEN. Commit the regenerated bundle.

---

## Self-Review

- **Spec coverage:** spawn (Task 2) · scoring (Task 2) · render (Task 3) · sprite (Task 1) ·
  tests (Task 4) · static pins + README (Task 5) · audits/merge (Task 6). All design
  sections mapped.
- **Placeholder scan:** the only intentional placeholder is the `crystalLarge` rect in
  Task 1 Step 2, explicitly gated behind the crop+verify in Step 1 (cannot be hardcoded
  blind — downscaled eyeballing is unreliable per LEARNINGS §7).
- **Type consistency:** `big` (boolean) used consistently in spawn, collect, render, tests;
  `crystalLarge` key consistent in sprites.js and render.js; score `40 + combo` consistent
  in game.js and README.
