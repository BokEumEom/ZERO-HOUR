# Hub + per-game UI/UX polish

Design review of the arcade hub (메인화면) and per-game screens.
Source: `/plan-design-review` 2026-06-16. Classification: **HYBRID** (hub =
brand-forward front door, per-game screens = app/game UI).

Initial design completeness **5/10** (hub 3/10, Zero Hour screens 7/10) →
target **8/10** after this plan.

## Decisions made (this review)

1. **Cross-game continuity** — keep Shepherd's Dog as a separate page, but inject
   shared tokens + matching back-to-hub chrome + a launch fade so the platform
   identity survives the jump. (Full in-shell integration deferred — see TODOs.)
2. **Game-card scent** — each card shows personal `BEST` plus a play-status badge
   (`NEW · 처음이에요` when no record, `· N일 전` once played). Uses stored data only.
3. **Accessibility** — `prefers-reduced-motion` + low-contrast text fixes land this
   round (WCAG 2.3.1 flashing is a safety issue, not polish). ARIA/focus deferred.
4. **Design system** — extract `css/tokens.css` as the single source of truth and
   write `docs/design-system.md` documenting palette/type/components/a11y + a
   new-game checklist. (Note: `DESIGN.md` collides with the existing `design.md`
   architecture doc on case-insensitive filesystems — hence `docs/design-system.md`.)
5. **Hub identity** — add a `SCOREYARD` wordmark, tagline, and footer; add empty +
   loading/fail-safe states (the hub currently renders a blank screen if `games` is
   empty or scripts fail to load).

## What already exists (reuse, don't reinvent)

- Strong CRT palette + `Press Start 2P` / `IBM Plex Mono` pairing — `css/style.css:5-21`.
- `.game-card` accent mechanism via `--c` — `js/shell.js:64`. Keep the **full neon
  border** treatment (NOT a left-bar — that's an AI-slop tell).
- Per-game records via `SY.store.forGame(id)` (`best_all = {score,combo,date,mode}`) —
  the card scent needs no new persistence beyond an optional `lastPlayedAt`.
- Retro vector SVG style already in the `__bundler_thumbnail` template (`index.html:20-31`).
- Mobile-first scaled stage + portrait rotation + `:focus-visible` styles + safe-area
  insets (ADR-0006) — already solid; extend, don't replace.

## Per-pass findings

| Pass | Before | After (target) | Key finding |
|---|---|---|---|
| 1 Info architecture | hub 3 / ZH 8 | 8 | Hub has no first-thing-you-see; trunk-test fails. Add identity → cards → footer. |
| 2 State coverage | 5 | 9 | Hub has no empty/loading/error state — blank void on failure. |
| 3 User journey | hub 4 / ZH 8 | 8 | First 5s on hub fails; Shepherd launch is a hard brand cut. |
| 4 AI-slop risk | 6 | 8 | Keep full-border cards (drop left-bar idea). Centered attract-screen OK for genre. |
| 5 Design system | 5 | 8 | No DESIGN.md; tokens un-contracted → cross-game drift. |
| 6 Responsive & a11y | 6 | 8 | No reduced-motion; low-contrast hint/footer text; ARIA gaps (deferred). |

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code or Codex; checkbox as you ship.

- [x] **T1 (P1, human: ~2h / CC: ~20min)** — hub — add SCOREYARD identity header + footer
  - Surfaced by: Pass 1 — `#screen-arcade` is bare `<div id="arcade-grid">` (`index.html:67-69`)
  - Files: `index.html`, `css/style.css`, `js/shell.js` (renderHub/showHub)
  - Verify: hub shows wordmark + tagline + footer; trunk-test passes (cover cards, still know the app)
- [x] **T2 (P1, human: ~2h / CC: ~20min)** — hub — empty + loading/fail-safe states
  - Surfaced by: Pass 2 — `games=[]` or CDN/script failure renders a blank black screen
  - Files: `js/shell.js` (renderHub), `css/style.css`
  - Verify: force `games=[]` → "NO MACHINES YET" panel + Reload; core works with CDN blocked
- [x] **T3 (P1, human: ~3h / CC: ~30min)** — hub — rich game cards (best + play status)
  - Surfaced by: Pass 1/3 — cards carry no information scent (`js/shell.js:63-68`)
  - Files: `js/shell.js`, `css/style.css`, `js/store.js` (optional `lastPlayedAt`; `best_all.date` is a usable proxy)
  - Verify: card shows `BEST n,nnn`; unplayed game shows `NEW · 처음이에요`; played shows `· N일 전`
- [x] **T4 (P1, human: ~30min / CC: ~10min)** — css — reduced-motion + contrast fixes
  - Surfaced by: Pass 6 — no `prefers-reduced-motion`; WCAG 2.3.1 flashing; hint 0.35 / footer 0.28 contrast
  - Files: `css/style.css`
  - Verify: with OS reduce-motion on, blink/pulse/glow stop and hit-flash → static tint; hint/footer text ≥ 4.5:1
- [x] **T5 (P2, human: ~half day / CC: ~45min)** — platform — shared tokens + cross-game continuity
  - Surfaced by: Decision 1 / Pass 3 — Shepherd launch is a hard visual cut
  - **Reinterpreted (Decision, 2026-06-16):** Shepherd's pastoral art direction is intentional and finished — NOT re-skinned to CRT. Continuity = platform chrome + transition, not visual homogenization.
  - Done: extracted `css/tokens.css` (platform token source), linked before `style.css`; added `#viewport.leaving` launch fade (220ms, suppressed under reduced-motion) in `js/shell.js` `enterGame`. Shepherd's files left untouched (keeps its own theme + existing `.arcade-back`).
  - Files: `css/tokens.css` (new), `css/style.css`, `index.html`, `js/shell.js`
- [x] **T6 (P2, human: ~2h / CC: ~30min)** — docs — design-system token contract + new-game checklist
  - Surfaced by: Pass 5 — no design-system doc; tokens un-contracted
  - Files: `docs/design-system.md` (new), `css/tokens.css`
  - Verify: doc covers palette/type/button/card/focus + a11y rules; new-game checklist references tokens.css
  - Done: also documents the "shared platform, distinct games" principle (Shepherd keeps its pastoral identity)

## NOT in scope (deferred, with rationale)

- **ARIA live regions / focus management** — deeper screen-reader work; logged as TODO (P3).
- **Emoji → SVG corner icons** — cosmetic consistency; logged as TODO (P3).
- **Shepherd full in-shell integration** — bigger refactor (own loop/canvas); logged as TODO (P3).
- **New game thumbnails as bespoke art** — the mockup uses simple vector glyphs; richer per-game art is a later visual pass.
- **Tablet-specific layout** — current `clamp()` + scaled stage handles it adequately; revisit only if testing shows issues.

## Mockup reference

`~/.gstack/projects/RetroArcadeShooter/designs/hub-redesign-20260616/hub-mockup.html`
— populated hub (left) + empty/fail-safe state (right), built from real CSS tokens.
Note: the mockup's left-bar accent was rejected in Pass 4; ship full-border cards instead.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | not run |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | score: 5/10 → 8/10, 5 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **UNRESOLVED:** 0 design decisions left open (all 5 answered; 3 items logged as P3 TODOs).
- **VERDICT:** Design review complete (5/10 → 8/10). Eng review required before shipping —
  T3 touches `js/store.js` and T5 restructures cross-game module loading, both worth an
  architecture pass.

