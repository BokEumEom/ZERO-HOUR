# Difficulty Feel — Surge Scaling + FREE PLAY Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make difficulty tiers feel distinct — scale the mid-game surge formations by
difficulty (the dominant threat that currently ignores it), and make the FREE PLAY button
show the selected difficulty so players actually experience their choice.

**Architecture:** Part A adds one `surgeMul` knob to the `DIFF` table and multiplies the
surge formation size by it in `buildSurges` — Normal stays 1.0 so the daily/leaderboard
balance is untouched, while easy (0.7) and hard (1.4) widen the gradient. Part B updates the
FREE PLAY sub-label in `syncDifficultyChips` to append the selected difficulty (DOM/text
only). All deterministic; daily remains engine-forced Normal.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors.

---

## File Structure

- `js/games/neonvortex/game.js` — `surgeMul` in `DIFF`; apply in `buildSurges`.
- `index.html` — id on the FREE PLAY sub-label span.
- `js/games/neonvortex/main.js` — update the FREE PLAY sub-label in `syncDifficultyChips`.
- `test/unit/difficulty.test.mjs` — surgeMul knob + surge-size scaling assertions.
- `test/unit/static.test.mjs` — pins.
- `README.md` — difficulty note.

---

### Task 1: Add the `surgeMul` knob + scale surge formations

**Files:**
- Modify: `js/games/neonvortex/game.js:43-45` (`DIFF` tiers) and `:64` (`buildSurges` size)

- [ ] **Step 1: Add `surgeMul` to each DIFF tier**

Add `surgeMul` to the three frozen tier objects (game.js:43-45) — Normal stays 1.0:

```javascript
    easy:   Object.freeze({ turretCap: 0, turretFire: 2.6, spawnMul: 0.75, mineSpeedMul: 0.85, mineCap: 9,  surgeMul: 0.7, bossHpMul: 0.75, bossFireMul: 1.25, foes: Object.freeze({}) }),
    normal: Object.freeze({ turretCap: 2, turretFire: 2.6, spawnMul: 1.0,  mineSpeedMul: 1.0,  mineCap: 12, surgeMul: 1.0, bossHpMul: 1.0,  bossFireMul: 1.0,  foes: Object.freeze({ hunter: 2, charger: 1 }) }),
    hard:   Object.freeze({ turretCap: 3, turretFire: 1.9, spawnMul: 1.3,  mineSpeedMul: 1.2,  mineCap: 16, surgeMul: 1.4, bossHpMul: 1.33, bossFireMul: 0.8,  foes: Object.freeze({ hunter: 2, charger: 2, shield: 1, laser: 1 }) }),
```

- [ ] **Step 2: Apply surgeMul to the formation size in buildSurges**

Change the `size` line in `buildSurges` (game.js:64) from `size: 6 + 3 * k,` to:

```javascript
        size: Math.max(1, Math.round((6 + 3 * k) * s.diff.surgeMul)),
```

- [ ] **Step 3: Verify the scaling empirically**

Run:
```bash
node -e "const {loadModules}=await import('./test/unit/helpers.mjs'); for(const d of ['easy','normal','hard']){const G=loadModules(['js/store.js','js/games/neonvortex/foes.js','js/games/neonvortex/elite.js','js/games/neonvortex/game.js'],{nowIso:'2026-03-01T00:30:00Z'}).SY.nvGame; G.start('free',d); console.log(d, G.state.surges.map(x=>x.size));}" --input-type=module
```
Expected: easy sizes < normal < hard (e.g. easy [6,8], normal [9,12], hard [13,17]).

- [ ] **Step 4: Commit**

```bash
git add js/games/neonvortex/game.js
git commit -m "feat: scale surge formations by difficulty (surgeMul) — easy 0.7 / hard 1.4"
```

---

### Task 2: FREE PLAY button shows the selected difficulty

**Files:**
- Modify: `index.html:89` (add an id to the sub-label span)
- Modify: `js/games/neonvortex/main.js` (`syncDifficultyChips`)

- [ ] **Step 1: Add an id to the FREE PLAY sub-label**

Change `index.html:89` from:

```html
              <span class="nv-mi-sub">무작위 시드 아레나</span>
```
to:
```html
              <span id="neonvortex-free-sub" class="nv-mi-sub">무작위 시드 아레나</span>
```

- [ ] **Step 2: Update the sub-label in syncDifficultyChips**

In `main.js`, `syncDifficultyChips` (after the chip-highlight loop), append the selected
difficulty to the FREE PLAY sub-label:

```javascript
  function syncDifficultyChips() {
    const sel = difficultyValue();
    for (const d of NV_DIFFICULTIES) {
      const el = $('diff-' + d);
      if (el) {
        el.classList.toggle('is-active', d === sel);
        el.setAttribute('aria-pressed', d === sel ? 'true' : 'false');
      }
    }
    const sub = $('free-sub');
    if (sub) sub.textContent = '무작위 시드 아레나 · ' + sel.toUpperCase();
  }
```

- [ ] **Step 3: Manual sanity (optional)**

Open `index.html`, click EASY/NORMAL/HARD chips → the FREE PLAY sub-label updates to
`무작위 시드 아레나 · EASY|NORMAL|HARD`. START DAILY is unchanged.

- [ ] **Step 4: Commit**

```bash
git add index.html js/games/neonvortex/main.js
git commit -m "feat: FREE PLAY sub-label shows the selected difficulty (UX clarity)"
```

---

### Task 3: Tests + pins + README

**Files:**
- Modify: `test/unit/difficulty.test.mjs`, `test/unit/static.test.mjs`, `README.md`

- [ ] **Step 1: Add difficulty surge-scaling tests**

Append to `difficulty.test.mjs`:

```javascript
test('surgeMul knob widens the gradient (normal stays 1.0)', () => {
  const G = boot().SY.nvGame;
  assert.equal(G.DIFF.normal.surgeMul, 1.0, 'normal unchanged (daily/leaderboard safe)');
  assert.ok(G.DIFF.easy.surgeMul < 1.0, 'easy below normal');
  assert.ok(G.DIFF.hard.surgeMul > 1.0, 'hard above normal');
});

test('surge formation size scales with difficulty', () => {
  const G = boot().SY.nvGame;
  const sizes = (d) => { G.start('free', d); return G.state.surges.map((x) => x.size); };
  const e = sizes('easy'), n = sizes('normal'), h = sizes('hard');
  assert.ok(n.length > 0, 'there are surges to compare');
  assert.equal(e.length, n.length); assert.equal(h.length, n.length);
  for (let i = 0; i < n.length; i++) {
    assert.ok(e[i] < n[i], `easy surge ${i} smaller than normal (${e[i]} < ${n[i]})`);
    assert.ok(h[i] > n[i], `hard surge ${i} larger than normal (${h[i]} > ${n[i]})`);
  }
});
```

- [ ] **Step 2: Run difficulty tests**

Run: `node --test test/unit/difficulty.test.mjs`
Expected: PASS (existing + 2 new).

- [ ] **Step 3: Add static pins**

After the boss-core pin block in `static.test.mjs`, add:

```javascript
test('difficulty surge scaling + free-play label are wired', () => {
  const game = read(`${NV}/game.js`);
  assert.match(game, /surgeMul: 0\.7/, 'easy surgeMul');
  assert.match(game, /surgeMul: 1\.4/, 'hard surgeMul');
  assert.match(game, /\(6 \+ 3 \* k\) \* s\.diff\.surgeMul/, 'buildSurges scales by surgeMul');
  const main = read(`${NV}/main.js`);
  assert.match(main, /free-sub/, 'FREE PLAY sub-label updated with difficulty');
  const html = read('index.html');
  assert.match(html, /id="neonvortex-free-sub"/, 'free-sub span id present');
});
```

- [ ] **Step 4: Run static**

Run: `node --test test/unit/static.test.mjs`
Expected: PASS.

- [ ] **Step 5: README difficulty note**

In the modes/difficulty area of the README, add/adjust a line noting that free-play
difficulty (EASY/NORMAL/HARD) scales turrets, foe roster, mine speed, boss HP/fire AND the
surge formation size; daily is always Normal. Keep it consistent with surrounding prose.

- [ ] **Step 6: Commit**

```bash
git add test/unit/difficulty.test.mjs test/unit/static.test.mjs README.md
git commit -m "test: pin surgeMul scaling + free-play label; docs: README difficulty note"
```

---

### Task 4: Full suite + audit + finish

**Files:** none (verification + merge workflow)

- [ ] **Step 1: Full suite (×3)**

Run (×3): `bash test/run-all.sh`
Expected: unit+static PASS, E2E PASS, standalone OUT OF SYNC until Step 3.

- [ ] **Step 2: rng-fairness audit**

Dispatch `rng-fairness-auditor` over the change. Expected: `surgeMul` scaling is
deterministic (size depends on difficulty, not rng); the surge pattern bag still uses
`s.rng`; daily is still forced Normal; `Math.random` baseline 14 unchanged; Normal's stream
is byte-identical (surgeMul 1.0, Math.round of an integer = no change) so the daily map is
untouched.

- [ ] **Step 3: Finish the branch**

Use superpowers:finishing-a-development-branch — merge `feat/difficulty-feel` to `main`
`--no-ff`, delete the branch, regenerate `standalone.html`, confirm the hash gate is GREEN,
commit the regenerated bundle.

---

## Self-Review

- **Spec coverage:** surgeMul knob + buildSurges scaling (Task 1) · FREE PLAY label (Task 2) ·
  tests + pins + README (Task 3) · audit/merge (Task 4). Both design parts mapped.
- **Placeholder scan:** none — all values concrete.
- **Type consistency:** `surgeMul` field name consistent across DIFF tiers, buildSurges, and
  tests; `free-sub` id consistent in index.html and main.js; Normal `surgeMul: 1.0` keeps
  `Math.round((6+3k)*1.0)` identical to the prior integer `6+3k` (daily/Normal unchanged).
