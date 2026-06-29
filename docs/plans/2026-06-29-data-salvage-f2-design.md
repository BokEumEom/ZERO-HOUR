# F2 — DATA SALVAGE Premium Loot — Design

**Status:** Design (approved 2026-06-29). Part of the "reflect ALL sprite-atlas assets"
roadmap. F1 (ship banking) was skipped — the player already rotates to movement direction,
so banking would double-tilt; the BANK frames stay reflected via `foeCharger`/`hullUpg4`,
and `miniIcon` defers to F7.

## Goal

Reflect the two genuinely-unused **section 7 (CURRENCY / REWARD)** atlas sprites — a circuit
"data card" and a pentagon "data disc" — as two rare, high-value **DATA SALVAGE** reward
tokens. They read as tech (not gems), reinforcing the "crack a premium container → rare
salvage" payoff. Pure additive content; daily fairness preserved (all new randomness seeded).

## Why this is natural (not forced)

Section 7 is literally "CURRENCY / REWARD ITEMS"; these two cards sit beside the coin/gems/
chest as intended rewards. They are **shape-distinct** from the gem tokens, so they avoid
E1's "size-variant gems don't read" failure. Dropping them only from the premium sources
(rare chest jackpot + console objective) keeps the common loot balance untouched.

## Assets (verified, crop-tightened; final tighten + eyeball during impl)

| key | atlas rect (1448×1086) | reads as |
|---|---|---|
| `tokenData` | 1004, 692, 89, 102 | circuit/data card (teal chip) |
| `tokenCore` | 1145, 708, 73, 84  | pentagon data disc / keycard |

Both live on `sprite-atlas.png` (NOT the elements sheet) — untagged `A` entries.

## Mechanic & data

- **Token tiers** (`game.js` `TOKEN_VALUE`): add `data: 150`, `core: 250` — premium above
  `purple: 100`. (coin 15 / teal 25 / amber 50 / purple 100 unchanged.)
- **Drop gating — premium sources only** (common balance untouched):
  - **Chest jackpot** (`spawnLoot`, `jackpot` branch): extend the single-`roll` tier table
    so each chest token has ~5% `core`, ~12% `data`, remainder the existing gem spread:
    ```
    tier = roll < 0.05 ? 'core'
         : roll < 0.17 ? 'data'
         : roll < 0.37 ? 'coin'
         : roll < 0.58 ? 'teal'
         : roll < 0.83 ? 'amber'
         : 'purple';
    ```
    The crate/canister branch is **unchanged** (never drops data/core).
  - **Console objective** (crate-break `cr.kind === 'console'` branch): in addition to its
    existing `spawnPow` + 30 pts + blast, push **one guaranteed `data` token** (seeded
    scatter velocity, same shape as `spawnLoot`'s push).
- **Token size:** data/core tokens spawn with `r: 10` (vs gems `r: 8`) for legibility +
  premium feel; the draw size formula `(t.r+2)*2.4` then renders them slightly larger.
- **Collection** (`game.js` token loop): unchanged path — `addScore(TOKEN_VALUE[tier] || 15,
  …, 'loot')`. `data`/`core` are not `coin`, so `creditsCollected` (cosmetic coin counter)
  is untouched. No new lifetime meta counter in F2 (keep lean; a meta pass can add one later).
- **Render** (`render.js` `drawToken`): extend the tier→key map: `data` → `tokenData`,
  `core` → `tokenCore`; keep the vector fallback (a tech-cyan circle is fine).

## Invariants & fairness

- **Daily fairness:** all new drops use `s.rng()` (chest table roll already seeded; the
  console token's scatter uses `s.rng()`). No new `Math.random()` — the `static.test.mjs`
  baseline (14) is unaffected.
- **Versioned stream shift:** the extended jackpot table + the console's added `s.rng()`
  draws shift the daily seed stream — a deliberate, versioned change (same class as the
  crystal-tier and bomb additions). Seed-pinned tests that assert a probabilistic event for
  one fixed seed may break; re-pin by forcing the relevant roll (the established precedent).
- **Balance:** data/core appear only from rare premium sources, so the added score is a
  modest, occasional bump — the 60 s headline score scale stays ~unchanged. Low balance risk.
- **Hot-path:** `drawToken` gains two map entries (no new allocation); spawn paths add a few
  `s.rng()` calls on container break (not per-frame). Negligible.

## Verification

- **Unit** (`test/unit/data-salvage.test.mjs`, new): `TOKEN_VALUE.data === 150` &&
  `.core === 250`; a chest can drop `data`/`core` (force the roll / sample many);
  crates+canisters NEVER yield `data`/`core`; a console break pushes exactly one `data`
  token; collecting a `data` token adds 150 to the `loot` bucket.
- **Static pin** (`test/unit/static.test.mjs` or the new file): `tokenData`/`tokenCore`
  rects exist, are atlas (no `sheet:'el'`), and are within sheet bounds.
- **Score-sync:** add `data`/`core` rows to the README score table (점수 시스템); the
  score-sync checker must stay green.
- **Full gate:** `node --test test/unit/*.test.mjs`, headless E2E (`bash test/e2e/run.sh`),
  and `/build-standalone` regen + bundle-hash-sync — all green.
- **Gallery:** eyeball a chest-burst scene to confirm the data/core tokens render as the
  tech card/disc at a readable size.

## Risks

- **Rect tighten:** `tokenCore` (data disc) sits next to the chest sprite on the sheet —
  verify the final crop excludes chest pixels (current tighten 1145,708,73,84 is chest-excluded).
- **Re-pin churn:** the stream shift may break a few seed-pinned tests; budget a re-pin step.
- **Token legibility:** the data card is detailed; confirm at `r:10` draw size it still
  reads (gallery check). If noisy, bump to `r:11` or simplify via the premium glow.

## Out of scope (later roadmap steps)

- F3 companion/enemy drones, F4 world objects, F5 hazards, F6 enemy archetypes,
  F7 telegraph/UI + the section-1 intel-card badge + `miniIcon` branding.
- A lifetime "data salvaged" cosmetic meta counter (could join a future meta pass).
