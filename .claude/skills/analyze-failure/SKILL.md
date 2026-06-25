---
name: analyze-failure
description: Post-mortem an LLM agent / harness execution failure from its logs and propose a minimal, regression-guarded fix. User-invoked; refuses to run without a real failure log.
disable-model-invocation: true
---

# Analyze Failure

Turns a concrete execution-failure log into a **minimal, regression-guarded**
harness improvement. The goal is a small correct fix — NOT a rewrite, and NOT a
patch that overfits to one incident.

## Inputs (all that are available)

- The current harness/agent prompt (the thing that may be edited)
- The task goal
- The execution log (tool calls, outputs, decisions)
- Error messages
- The final result
- The reported failure reason

## Guard 0 — refuse on empty input (do this first)

If there is **no real execution log / error / failing artifact** to analyze, STOP.
Do not invent a hypothetical failure to fill the template. Ask the user to paste
the log, error, and final result, then wait. A post-mortem with no evidence is
worse than none.

## Process

1. **Verify the root cause independently (don't trust the stated reason).**
   Treat the supplied "failure reason" as a claim, not a fact. From the log,
   separate the **proximate cause** (what tripped) from the **root cause** (why it
   was possible). If the evidence contradicts the stated reason, say so.

2. **Find the repeatable pattern — and gate on recurrence.**
   With **only one incident**, you cannot prove repeatability: mark every proposal
   as a **hypothesis**, and gate adoption behind recurrence (≥2 independent
   incidents or a reproduction). Only with ≥2 incidents may a fix be proposed as
   "adopt now." State which case you're in explicitly.

3. **Locate the fix in the RIGHT layer (don't default to prompt wording).**
   Most harness failures are better fixed outside the prompt. For each candidate
   fix, decide whether it belongs in: prompt text · tool/validation logic ·
   permissions/scope · scaffolding/inputs · or the task framing itself. Only edit
   the prompt when the prompt is genuinely the cause.

4. **Design the minimal edit + a regression check.**
   Propose the smallest change that addresses the root cause. Before proposing it,
   evaluate its blast radius: name at least one **past-passing / unrelated case the
   harness must still handle**, and confirm the edit doesn't break it. Reject any
   edit that fixes the failing case but plausibly regresses others.

5. **Define the success criterion for the fix.**
   State the observable check that would confirm the fix worked: the failing case
   now passes AND the named regression case still passes.

## Output (use these sections, in order)

```
## 실패 패턴
<root cause (verified) vs proximate cause; single-incident → label "가설", ≥2 → "확정">

## 개선할 하네스 위치
<which layer: 프롬프트 / 도구·검증 / 권한·범위 / 스캐폴딩·입력 / 작업정의 — and why>

## 추가/수정할 프롬프트 문구
<only if the fix is genuinely a prompt change; otherwise state the non-prompt fix here>

## 기대 효과
<failing case now passes; success criterion>

## 리스크
<overfitting risk, side-effects, and the named regression/holdout case you checked>

## 제안 패치 (diff)
<a minimal unified diff / before→after snippet — NEVER a full rewrite of the harness>
```

## Hard rules

- **diff only.** Emit a minimal patch (before→after or unified diff), never a full
  re-emission of the harness — a full rewrite invites silent scope creep.
- **One incident = hypothesis**, never an immediate adopt-now change.
- **No regression check, no proposal.** If you cannot name a holdout case the edit
  preserves, you are not done.
- **Don't trust the stated failure reason** until the log confirms it.
- Prefer the smallest layer that fixes the root cause; prompts are the last resort,
  not the default.
