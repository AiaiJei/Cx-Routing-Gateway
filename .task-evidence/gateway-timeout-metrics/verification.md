# Gateway Timeout and Request Timing Verification

- Task: `CXRG-UPSTREAM-TIMEOUT-METRICS-2026-11-21`
- Repository: `AiaiJei/Cx-Routing-Gateway`
- Base: `master` at `be4de0924091c351864013e4ca53520f9d8ef226`
- Branch/worktree: `codex/gateway-timeout-metrics` / `.worktree/gateway-timeout-metrics`
- Verification date: 2026-11-21

## Final Verification

- `npm ci` in `apps/desktop`: PASS, 439 packages installed; lockfile unchanged. npm reported 6 moderate audit findings and install-script warnings; no audit fixes were applied.
- `npm run build` in `apps/desktop`: PASS, TypeScript and Vite.
- `npm test` at repository root: PASS, Runtime 125/125.
- `npm test` in `apps/desktop`: PASS, Desktop 143/143.
- Pre-PR rerun after independent review: build PASS; Runtime 125/125; Desktop 143/143; `git diff --check` PASS.
- Focused Task 2 Runtime tests: PASS, request metrics/logs 16/16.
- Focused Task 2 Desktop test: PASS, timing tooltip 1/1.
- Task 1 focused Gateway/request-log tests: PASS, 40/40.
- `git diff --check`: PASS after Task 1, Task 2, and final documentation changes.

## Changed Paths

- `.codex/awg-task.json`
- `apps/desktop/src/components/RequestLogCells.tsx`
- `apps/desktop/src/components/RequestLogCells.test.tsx`
- `docs/superpowers/plans/2026-11-21-gateway-timeout-metrics.md`
- `docs/superpowers/specs/2026-11-21-gateway-timeout-metrics-design.md`
- `docs/tasks/2026-11-21-gateway-timeout-metrics.md`
- `docs/tasks/2026-11-21-release-1.1.2-contract.json` (exact previous-contract archive)
- `services/gateway/src/request-metrics.mjs`
- `services/gateway/src/server.mjs`
- `tests/runtime/gateway-server.test.mjs`
- `tests/runtime/request-logs.test.mjs`
- `tests/runtime/request-metrics.test.mjs`

## TDD Evidence

- Header/body timeout RED: slow JSON returned 504 rather than 200 after the old timer remained active; an injected route-test timeout did not abort the route call.
- Full request deadline RED: configured 100 ms but the old response timer recorded 421 ms.
- Timing RED: wall-clock rollback produced `firstTokenMs = 0` instead of 50 ms; default metrics also returned zero after a clock rollback.
- UI RED: the request-duration cell had no keyboard-focusable timing definition.
- GREEN: one 5-minute response-header bound and one 10-minute absolute request deadline now apply to JSON, native SSE, and converted SSE; elapsed metrics use a monotonic clock, and the existing Tooltip explains the timing boundaries.

## Scope and Limitations

- The branch diff is reviewed against `origin/master` and limited to the task contract, design/plan/evidence, Gateway timeout and metrics code, their Runtime tests, and the Desktop request-duration component/test.
- The previous completed release contract is preserved verbatim at `docs/tasks/2026-11-21-release-1.1.2-contract.json`.
- Final whole-branch independent review on `be4de092..bac1770`: PASS, no Critical, Important, or Minor findings.
- PR #15 is open against `master` at head `04528e6da7fae2811554ab338b6881ca23814c00`; GitHub Runtime and Desktop checks PASS, package job SKIPPED by workflow condition.
- Merge and release publication remain `NOT_RUN`.
- Downstream SDK/client timeouts remain outside Gateway control.

## Rollback

Revert only this task's PR commits. No persisted data migration is required. Keep this task branch and worktree; do not merge or delete them in this task.

## Review Boundaries

- If an SSE deadline expires after response headers are sent, the Gateway records `upstream_timeout` and closes the partial stream; it cannot replace the already-sent HTTP status with 504.
- A downstream SDK/client may impose its own shorter timeout and abort before the Gateway's 10-minute deadline.
