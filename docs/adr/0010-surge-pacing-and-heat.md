# ADR-0010: Surge pacing rhythm and the HEAT multiplier

- **Status**: Accepted (2026-06-18)
- **Context**: Zero Hour's 60s run felt "simple / long" — a near-flat difficulty
  curve, a single threat type (homing mines) for 40s, no in-run arc, passive
  auto-fire combat, and no risk/reward tension.
- **Decision**: Add a **Surge Director** that schedules N seeded surges
  (`floor(fieldLen/16)`, fired between an 8s warmup and the boss window),
  each spawning a **choreographed mine formation** (LINE / RING / PINCER) with a
  scripted `entryT` entry that reverts to the existing homing behaviour. A
  **HEAT** multiplier rises while collecting during a surge (`×1 → ×1.25 → ×1.5 → ×2`,
  capped `×4` with X2) and resets on hit, isolated into its own score-breakdown bucket.
  No new entity types, no new JS modules, no new art.
- **Consequences**:
  - All surge/formation/HEAT randomness uses `s.rng()` → daily fairness intact
    (ADR-0002). Building the schedule consumes rng at run start, so daily layouts
    differ from the pre-surge version (acceptable — new content version).
  - Score inflation: HEAT can lift surge-window points up to ×4. Rank/medal
    thresholds (ADR-0009) reviewed; HEAT bonus is isolated in `breakdown.heat`.
  - 60fps hot path unchanged — formation mines reuse the fixed mine object shape.
- **Spec / plan**: docs/plans/2026-06-18-zerohour-surge-pacing.md,
  docs/plans/2026-06-18-zerohour-surge-pacing-impl.md.
