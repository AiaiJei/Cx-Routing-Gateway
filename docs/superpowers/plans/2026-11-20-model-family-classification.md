# Model family classification implementation plan

> Execute with awg-governance:executing-plans in this session; fresh read-only review after implementation.

**Goal:** Classify routes and loaded model options into seven families.
**Architecture:** Pure classifier, controlled family filter and model selector; generic CustomSelect retains keyboard/selection responsibilities.
**Tech stack:** Existing React 18, TypeScript, Vitest, Testing Library and Vite.
**Spec:** ../specs/2026-11-20-model-family-classification-design.md

## Constraints and review focus

No new dependencies or data/schema changes; preserve original IDs, primary worktree, protocol/failover and version 1.0.3. Unknown models stay selectable. Filtering cannot drop hidden selections. Keyboard skips group headings. Empty categories and stale edit values stay usable. Long names and seven filters fit narrow screens.

## Task 1 — Classification and selection

- [x] Add failing domain tests for seven families, namespace/case variants and misleading substrings.
- [x] Add failing CustomSelect tests for grouped options, filtered hidden selections and keyboard navigation; add RoutesPage classification/saving regressions.
- [x] Run focused tests; retain expected failures.
- [x] Implement domain/model-family.ts: MODEL_FAMILIES, ModelFamily, getModelFamily(name), getRouteModelFamily(route).
- [x] Implement ModelFamilyFilter with family/counts; ModelSelect owns per-upstream family state. Extend CustomSelect options with optional group/hidden metadata: summary uses all options, navigation uses visible options.
- [x] Connect route filter/counts and ModelSelect, preserving save/priority logic; add matching local styles.
- [x] Run focused tests until green (52/52).

## Task 2 — Verification and PR

- [x] Run full Desktop tests (126/126) and production build, then Runtime tests (75/75); production dependency audit reports 0 vulnerabilities.
- [x] Check production browser with controlled data: filtering/counts, grouping, independent upstream filters, hidden selections, stale model edit, keyboard, save/update and empty model category at 1440/768/390 widths. Browser screenshots are in docs/tasks/evidence/model-family-classification/.
- [x] Attempt independent read-only review. Reviewer and fallback service calls both returned provider HTTP 429 with no review. Complete and record a separate read-only self-review; this is not an independent review.
- [x] Record evidence, whitespace, CAPABILITY and the review limitation; commit/push the task branch; create dedicated PR #9 against master; preserve its worktree.
