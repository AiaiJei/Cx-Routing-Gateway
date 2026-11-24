# HTTP Status and Res/Mes Reasoning Effort

- Task: `CXRG-STATUS-REASONING-2026-11-24`
- Project/repository: Cx-Routing Gateway / `AiaiJei/Cx-Routing-Gateway`
- Contract: `2026-11-24-request-status-reasoning-contract.json`
- Base: `master` at `49c9a389d58b2e5bdb02554d559989ed7fb07596`
- Branch/worktree: `codex/request-status-reasoning` / `.worktree/codex-request-status-reasoning`
- Scope: direct HTTP status display in request logs; preserve reasoning effort in Res↔Mes request conversion and existing sanitized usage metadata.
- Dependencies: no new runtime or development dependencies.
- Roles: one implementation owner in this task; perform focused self-review and report any unavailable independent review separately.
- Evidence: regression fixtures for status selection, both protocol directions, and Messages effort logging; Runtime/Desktop tests; Desktop build; syntax and diff checks; request ID lookup outcome recorded without exposing bodies or credentials.
- Acceptance: HTTP codes are visible with readable fallback and preserved stream-failure semantics; reasoning level appears in the target wire request both ways; required checks pass; one open PR targets `master`.
- Rollback: close the PR and revert this task branch's commit; do not delete or alter unrelated state.

## Implementation checklist

- [x] Add failing regression coverage for downstream-status selection, missing-code fallback, both reasoning-effort directions, and Messages effort logging.
- [x] Verify the tests fail for the reported behavior.
- [x] Implement the smallest changes in the existing request-log component and normalized protocol adapter.
- [x] Run focused tests, complete Runtime/Desktop suites, Desktop build, syntax checks, and `git diff --check`.
- [x] Complete an independent review, correct the successful-request upstream/downstream status ambiguity, and record the follow-up review.
- [x] Record final test and review evidence.
- [x] Commit the review correction and evidence, push the task branch, and open dedicated PR #23 against `master`; leave it open and unmerged.

## Current evidence

- The supplied request ID was not present in the expected `%APPDATA%/Cx-Routing Gateway/runtime/config.json` or `%APPDATA%/@cx-routing-gateway/runtime/config.json` locations. The current source persists only sanitized usage metadata; local fixtures will be used for regression verification.
- Independent review found and verified a successful JSON logging gap: upstream `httpStatus` was recorded, but downstream `gatewayStatus: 200` was absent. A regression test reproduced the missing status, the log now records both values, and the follow-up independent review confirmed the fix.
- Dedicated PR: https://github.com/AiaiJei/Cx-Routing-Gateway/pull/23 (OPEN, targets `master`, not merged). Runtime and Desktop GitHub Actions checks were in progress and Package checks were skipped at first inspection.
- No new provider calls or configuration writes are in scope.
