# G1 — Effects Full Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the 6 unused `sprite-atlas.png` section-4 effect sprites (warp ring, 3 orange bursts, swoosh, debris) into game events.

**Architecture:** Pure cosmetic. Generalize the existing `s.blasts` sprite-flash path to carry a sprite key (orange bursts), and add three short-lived one-shot lists `s.warps` / `s.slashes` / `s.debris` with matching render passes. No `s.rng`, no new `Math.random` (variety from position math), alloc-bounded (life-pruned like `s.blasts`).

**Tech Stack:** Vanilla JS IIFE modules on `window.SY`; Canvas 2D; `node --test` (vm sandbox) + headless E2E.

**Spec:** `docs/plans/2026-06-29-fx-effects-g1-design.md`. Verified rects there.

**Conventions the implementer MUST follow:**
- Do NOT add any `Math.random` or `s.rng()` call. The static suite pins the `Math.random` baseline at 14 — adding one fails the build. Derive any per-effect variety from position (precedent: `blast()` uses `rot:(x*0.7+y*0.3)%(2π)`).
- `SP.draw(ctx,key,x,y,size,rot)` returns `false` when the sheet is undecoded; these ambient effects need NO vector fallback (precedent: `drawDecor`) — just let the draw no-op.
- Run the FULL unit suite (`node --test test/unit/*.test.mjs`) at each "run tests" step, not just the new file — earlier features broke seed/static pins in OTHER files.
- Never hand-edit `standalone.html` (a hook blocks it); it is regenerated in Task 7.

---

### Task 1: Add the 6 effect rects to the atlas table

**Files:**
- Modify: `js/games/neonvortex/sprites.js` (the `A` rect table — add after `tokenCore`, the last entry, ~line 116)
- Test: `test/unit/fx-effects.test.mjs` (Create)

- [ ] **Step 1: Write the failing test**

Create `test/unit/fx-effects.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('G1 effect rects exist on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = {
    fxWarpRing: { x: 745, y: 398, w: 151, h: 98 },
    fxBurstLg:  { x: 1241, y: 396, w: 136, h: 101 },
    fxBurstMd:  { x: 1088, y: 414, w: 102, h: 79 },
    fxBurstSm:  { x: 1236, y: 288, w: 81, h: 73 },
    fxSwoosh:   { x: 1335, y: 295, w: 75, h: 78 },
    fxDebris:   { x: 954, y: 422, w: 84, h: 62 },
  };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas (no sheet tag)`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/fx-effects.test.mjs`
Expected: FAIL — `fxWarpRing rect exists` (A.fxWarpRing is undefined).

- [ ] **Step 3: Add the rects**

In `js/games/neonvortex/sprites.js`, immediately after the `tokenCore:` line (the last entry of `A`, ~line 116), add:

```javascript
    // G1 effects (section-4 WEAPONS/EFFECTS) — cosmetic one-shot flashes (render.js)
    fxWarpRing:  { x: 745,  y: 398, w: 151, h: 98 },  // boss/elite warp-in ring
    fxBurstLg:   { x: 1241, y: 396, w: 136, h: 101 }, // large orange explosion
    fxBurstMd:   { x: 1088, y: 414, w: 102, h: 79 },  // medium orange explosion
    fxBurstSm:   { x: 1236, y: 288, w: 81,  h: 73 },  // small orange burst
    fxSwoosh:    { x: 1335, y: 295, w: 75,  h: 78 },  // directional slash (charger dash)
    fxDebris:    { x: 954,  y: 422, w: 84,  h: 62 },  // destruction debris
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/fx-effects.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/sprites.js test/unit/fx-effects.test.mjs
git commit -m "feat: add G1 effect sprite rects (warp ring, orange bursts, swoosh, debris)"
```

---

### Task 2: Generalize `blast()` to a sprite key + wire orange bursts

**Files:**
- Modify: `js/games/neonvortex/game.js` (`blast()` ~397; call sites 507, 927, 955, 977, 1008/1015/1024/1030; `bombDetonate` ~1110)
- Modify: `js/games/neonvortex/render.js` (blast loop ~589-601)
- Test: `test/unit/fx-effects.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/fx-effects.test.mjs`:

```javascript
const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}

test('a destroyed crate emits a warm fxBurstSm flash', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'crate', x: 480, y: 300, r: 20, hp: 1, maxHp: 3, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.blasts = [];
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.crates.length, 0, 'crate destroyed');
  assert.ok(s.blasts.some((b) => b.key === 'fxBurstSm'), 'crate break uses the small warm burst');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/fx-effects.test.mjs`
Expected: FAIL — `crate break uses the small warm burst` (blasts carry no `key`).

- [ ] **Step 3: Generalize `blast()` and wire keys**

In `js/games/neonvortex/game.js`, replace the `blast` function (~397-401):

```javascript
  // explosion-sprite flash on a destruction event (cosmetic). `key` selects the
  // atlas sprite (default the teal `burst`); rot is position-derived (no Math.random).
  function blast(s, x, y, size, key) {
    s.blasts.push({ x, y, size, life: 1, rot: (x * 0.7 + y * 0.3) % (Math.PI * 2), key: key || 'burst' });
  }
```

Update these call sites (add the 4th arg):
- Line ~507 (boss death): `blast(s, b.x, b.y, 200, 'fxBurstLg'); blast(s, b.x + 40, b.y - 30, 130, 'fxBurstLg');`
- Line ~927 (boss core death): `blast(s, c.x, c.y, 90, 'fxBurstMd'); SY.audio.explode();`
- Line ~955 (rock death): `blast(s, r.x, r.y, 64, 'fxBurstSm');`
- Line ~977 (turret death): `blast(s, t.x, t.y, 60, 'fxBurstSm');`
- Line ~1008 (console crate): `blast(s, cr.x, cr.y, 64, 'fxBurstSm');`
- Line ~1015 (pod crate): `blast(s, cr.x, cr.y, 70, 'fxBurstSm');`
- Line ~1024 (mimic crate): `blast(s, cr.x, cr.y, 80, 'fxBurstSm');`
- Line ~1030 (chest/default crate): `blast(s, cr.x, cr.y, cr.kind === 'chest' ? 120 : 58, 'fxBurstSm');`

In `bombDetonate` (~1110), add a big warm flash right before `wave(s, x, y, 240, '#ff8a4a');`:

```javascript
    blast(s, x, y, 240, 'fxBurstLg');
```

- [ ] **Step 4: Update the render blast loop to honor the key**

In `js/games/neonvortex/render.js`, in the blast loop (~594) change:

```javascript
      if (!SP.draw(ctx, bl.key || 'burst', bl.x, bl.y, grow, bl.rot)) {
```

(The rest of the loop — alpha, `lighter`, vector fallback — is unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/unit/*.test.mjs`
Expected: PASS (the new crate test passes; no other test regresses).

- [ ] **Step 6: Commit**

```bash
git add js/games/neonvortex/game.js js/games/neonvortex/render.js test/unit/fx-effects.test.mjs
git commit -m "feat: route destruction blasts to warm orange burst sprites (G1)"
```

---

### Task 3: Warp-in ring (`s.warps`) — boss & elite entrance

**Files:**
- Modify: `js/games/neonvortex/game.js` (freshState ~152; helper after `blast` ~401; `eliteApi` ~447; update loop ~1169; `spawnBoss` ~376)
- Modify: `js/games/neonvortex/elite.js` (at elite creation — `grep -n "s.elite = {"`)
- Modify: `js/games/neonvortex/render.js` (after the blast loop ~601)
- Test: `test/unit/fx-effects.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/fx-effects.test.mjs`:

```javascript
test('the boss entrance spawns a warp-in ring', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.warps = []; s.boss = null; s.bossDown = false;
  s.timeLeft = 19; // boss spawns at duration>=40 && timeLeft<=20
  G.update(1 / 60);
  assert.ok(s.boss, 'boss spawned');
  assert.ok(s.warps.length >= 1, 'a warp ring was emitted on entrance');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/fx-effects.test.mjs`
Expected: FAIL — `a warp ring was emitted on entrance` (`s.warps` is undefined → `.length` throws or is empty).

- [ ] **Step 3: Add the list, helper, update loop, and wiring**

In `js/games/neonvortex/game.js`:

1. freshState (~152) — add the three new lists to the existing `parts/waves/floats/blasts` line:

```javascript
      parts: [], waves: [], floats: [], blasts: [], warps: [], slashes: [], debris: [],
```

2. After the `blast` function (~401), add the warp helper:

```javascript
  // warp-in ring on a boss/elite entrance (cosmetic; position-derived rot, no rng)
  function spawnWarp(s, x, y, maxSize) {
    s.warps.push({ x, y, maxSize, life: 1, rot: (x * 0.5 + y * 0.5) % (Math.PI * 2) });
  }
```

3. `eliteApi` (~447) — add `spawnWarp`:

```javascript
  const eliteApi = { hurtPlayer, addScore, spawnPow, spawnLoot, burst, wave, blast, floatText, spawnWarp };
```

4. `spawnBoss` (~376) — after `s.bossWarnT = 1.6;` add:

```javascript
    spawnWarp(s, W / 2, 128, 240); // warp-in ring at the boss's settle point
```

5. Update loop — after the blasts splice loop (~1173), add:

```javascript
    for (let i = s.warps.length - 1; i >= 0; i--) { const w = s.warps[i]; w.life -= dt * 1.4; if (w.life <= 0) s.warps.splice(i, 1); }
```

In `js/games/neonvortex/elite.js`, find the elite creation (`grep -n "s.elite = {"`). Immediately after the object is assigned, add (using the just-created position):

```javascript
    if (api && api.spawnWarp) api.spawnWarp(s, s.elite.x, s.elite.y, 150);
```

(If the creating function does not receive the `eliteApi` as `api`, pass it through — the elite spawn is triggered from `game.js`; check how `SY.nvElite` is called and thread `eliteApi`. If threading is non-trivial, instead add the call in `game.js` right after the elite is spawned.)

In `js/games/neonvortex/render.js`, after the blast loop closes (~601), add:

```javascript
    // warp-in rings (atlas, additive, expanding outward)
    for (const w of s.warps) {
      const grow = w.maxSize * (0.3 + (1 - w.life) * 0.7);
      ctx.save();
      ctx.globalAlpha = Math.max(0, w.life) * 0.9;
      ctx.globalCompositeOperation = 'lighter';
      SP.draw(ctx, 'fxWarpRing', w.x, w.y, grow, w.rot);
      ctx.restore();
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/*.test.mjs`
Expected: PASS (boss warp test passes; no regressions).

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/game.js js/games/neonvortex/elite.js js/games/neonvortex/render.js test/unit/fx-effects.test.mjs
git commit -m "feat: warp-in ring on boss/elite entrance (G1)"
```

---

### Task 4: Destruction debris (`s.debris`) — crate & rock break

**Files:**
- Modify: `js/games/neonvortex/game.js` (helper after `spawnWarp`; update loop; rock break ~952; crate break ~1005)
- Modify: `js/games/neonvortex/render.js` (after the warp loop)
- Test: `test/unit/fx-effects.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/fx-effects.test.mjs`:

```javascript
test('a destroyed crate scatters debris', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'crate', x: 480, y: 300, r: 20, hp: 1, maxHp: 3, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.debris = [];
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.ok(s.debris.length >= 1, 'crate break scattered debris');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/fx-effects.test.mjs`
Expected: FAIL — `crate break scattered debris` (no `spawnDebris` yet).

- [ ] **Step 3: Add the helper, update loop, and wiring**

In `js/games/neonvortex/game.js`:

1. After the `spawnWarp` function, add:

```javascript
  // one-shot debris flash on a crate/rock break (cosmetic; position-derived rot)
  function spawnDebris(s, x, y) {
    s.debris.push({ x, y, life: 1, rot: (x * 0.3 + y * 0.7) % (Math.PI * 2) });
  }
```

2. Rock break (~952) — after `s.rocks.splice(j, 1);` add:

```javascript
            spawnDebris(s, r.x, r.y);
```

3. Crate break (~1005) — after `s.crates.splice(j, 1);` (which runs for ALL crate kinds, before the kind branch) add:

```javascript
            spawnDebris(s, cr.x, cr.y);
```

4. Update loop — after the warps splice loop, add:

```javascript
    for (let i = s.debris.length - 1; i >= 0; i--) { const d = s.debris[i]; d.life -= dt * 1.6; if (d.life <= 0) s.debris.splice(i, 1); }
```

In `js/games/neonvortex/render.js`, after the warp loop, add:

```javascript
    // destruction debris (atlas, normal alpha, expanding + fading)
    for (const d of s.debris) {
      const grow = 70 * (0.7 + (1 - d.life) * 0.5);
      ctx.save();
      ctx.globalAlpha = Math.max(0, d.life);
      SP.draw(ctx, 'fxDebris', d.x, d.y, grow, d.rot);
      ctx.restore();
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/game.js js/games/neonvortex/render.js test/unit/fx-effects.test.mjs
git commit -m "feat: destruction debris on crate/rock break (G1)"
```

---

### Task 5: Directional slash (`s.slashes`) — charger dash

**Files:**
- Modify: `js/games/neonvortex/game.js` (helper after `spawnDebris`; `foeApi` ~446; update loop)
- Modify: `js/games/neonvortex/foes.js` (charger dash entry ~115)
- Modify: `js/games/neonvortex/render.js` (after the debris loop)
- Test: `test/unit/fx-effects.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/fx-effects.test.mjs`:

```javascript
test('a charger entering its dash emits a directional slash', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.boss = null; s.bullets = []; s.slashes = [];
  // a charger one frame from committing to its dash
  s.foes = [{ kind: 'charger', x: 480, y: 200, vx: 0, vy: 0, r: 18, hp: 2, maxHp: 2, flash: 0, phase: 0, state: 'lock', stateT: 0.001, dirX: 0, dirY: 1 }];
  G.update(1 / 60);
  assert.equal(s.foes[0].state, 'dash', 'charger entered dash');
  assert.ok(s.slashes.length >= 1, 'a slash was emitted on dash entry');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/fx-effects.test.mjs`
Expected: FAIL — `a slash was emitted on dash entry` (no `spawnSlash`).

- [ ] **Step 3: Add the helper, update loop, foeApi, and dash-entry wiring**

In `js/games/neonvortex/game.js`:

1. After the `spawnDebris` function, add:

```javascript
  // directional slash on a charger dash (cosmetic; angle from the dash vector)
  function spawnSlash(s, x, y, angle) {
    s.slashes.push({ x, y, angle, life: 1 });
  }
```

2. `foeApi` (~446) — add `spawnSlash`:

```javascript
  const foeApi = { hurtPlayer, addScore, burst, wave, floatText, dropCrystals, blast, spawnSlash };
```

3. Update loop — after the debris splice loop, add:

```javascript
    for (let i = s.slashes.length - 1; i >= 0; i--) { const sl = s.slashes[i]; sl.life -= dt * 3.0; if (sl.life <= 0) s.slashes.splice(i, 1); }
```

In `js/games/neonvortex/foes.js`, at the charger dash entry (~115), change:

```javascript
          if (f.stateT <= 0) { f.state = 'dash'; f.stateT = 1.0; if (api.spawnSlash) api.spawnSlash(s, f.x, f.y, Math.atan2(f.dirY, f.dirX)); }
```

In `js/games/neonvortex/render.js`, after the debris loop, add:

```javascript
    // directional slashes (charger dash, atlas, additive)
    for (const sl of s.slashes) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, sl.life);
      ctx.globalCompositeOperation = 'lighter';
      SP.draw(ctx, 'fxSwoosh', sl.x, sl.y, 70, sl.angle);
      ctx.restore();
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/*.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/game.js js/games/neonvortex/foes.js js/games/neonvortex/render.js test/unit/fx-effects.test.mjs
git commit -m "feat: directional slash on charger dash (G1)"
```

---

### Task 6: Static pins (wiring + rng-free guard)

**Files:**
- Modify: `test/unit/static.test.mjs`
- Test: itself

- [ ] **Step 1: Add wiring pins**

Open `test/unit/static.test.mjs`, read how it loads module source (it reads files as text and greps). Add a test mirroring the existing pin style:

```javascript
test('G1 effects are wired (game spawns + render passes), rng-free', () => {
  const game = readModule('js/games/neonvortex/game.js');
  const render = readModule('js/games/neonvortex/render.js');
  for (const sym of ['spawnWarp', 'spawnSlash', 'spawnDebris', 'fxBurstLg', 'fxBurstMd']) {
    assert.ok(game.includes(sym), `game.js wires ${sym}`);
  }
  for (const key of ['fxWarpRing', 'fxSwoosh', 'fxDebris']) {
    assert.ok(render.includes(key), `render.js draws ${key}`);
  }
});
```

NOTE: use whatever helper `static.test.mjs` already uses to read a module's source (e.g., `readModule`/`readFileSync`); match the existing file's idiom rather than introducing a new reader.

- [ ] **Step 2: Run the static suite to verify the new pin passes AND the Math.random baseline is unchanged**

Run: `node --test test/unit/static.test.mjs`
Expected: PASS — including the pre-existing `Math.random` baseline (14) assertion. If the baseline assertion fails, an accidental `Math.random` was introduced in Tasks 2-5 — find and replace it with position-derived math.

- [ ] **Step 3: Commit**

```bash
git add test/unit/static.test.mjs
git commit -m "test: pin G1 effect wiring + rng-free guard"
```

---

### Task 7: Full verification + standalone regen

**Files:**
- Modify: `standalone.html` (regenerated, not hand-edited)

- [ ] **Step 1: Run the full unit suite**

Run: `node --test test/unit/*.test.mjs`
Expected: ALL PASS (baseline ~216 + the 5 new fx tests + the static pin).

- [ ] **Step 2: Run the E2E suite**

Run: `bash test/e2e/run.sh`
Expected: ALL PASS (55 assertions). If headless Edge is unavailable in the environment, report that it could not run rather than claiming a pass.

- [ ] **Step 3: Regenerate the standalone bundle + verify hash-sync**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html`
Then verify the bundle is in sync per the project's check (the test harness compares with `cmp`; run `bash test/run-all.ps1`-equivalent or the documented hash-sync step).
Expected: standalone.html regenerated; hash-sync OK. (Images are referenced relatively, so the bundle only changes for the JS edits.)

- [ ] **Step 4: Commit the regenerated bundle**

```bash
git add standalone.html
git commit -m "build: regenerate standalone bundle for G1 effects"
```

- [ ] **Step 5: Cosmetic + fairness/perf audit (subagent-driven controller dispatches these)**

- Dispatch `rng-fairness-auditor` — expect PASS (no `s.rng`/`Math.random` added; daily stream unshifted).
- Dispatch `performance-analyzer` — expect PASS (life-pruned lists, additive `SP.draw`, no per-frame allocation).
- Optional: run the gallery (`bash test/e2e/gallery.sh` or equivalent) and eyeball boss warp ring / orange bursts / charger slash / debris.

---

## Self-Review

**Spec coverage:**
- 6 rects → Task 1. ✅
- Orange bursts (Lg/Md/Sm) via generalized blast → Task 2 (boss/cores/rock/turret/crate/bomb). ✅
- Warp ring (boss + elite) → Task 3. ✅
- Debris (crate/rock) → Task 4. ✅
- Swoosh (charger dash only — per user decision) → Task 5. ✅
- No new Math.random / fairness preserved → enforced in conventions + Task 6 baseline pin + Task 7 audit. ✅
- Tests + static pins + run-all + bundle → Tasks 1-7. ✅

**Placeholder scan:** The only soft spot is the elite-warp threading in Task 3 (elite.js may or may not receive `eliteApi`); the task gives a concrete primary edit AND a concrete fallback (wire in game.js after elite spawn). No TBDs.

**Type consistency:** `blast(s,x,y,size,key)`, `spawnWarp(s,x,y,maxSize)`, `spawnDebris(s,x,y)`, `spawnSlash(s,x,y,angle)` are used identically across game.js wiring, render reads (`bl.key`, `w.maxSize`/`w.rot`, `d.rot`, `sl.angle`), and tests. Lists `warps`/`slashes`/`debris` are named identically in freshState, helpers, update loops, render, and tests. ✅
