# Gateway Timeout and Request Timing Task

- Task: `CXRG-UPSTREAM-TIMEOUT-METRICS-2026-11-21`.
- Project/repository: Cx-Routing Gateway / `AiaiJei/Cx-Routing-Gateway`.
- Base: `master` at `be4de0924091c351864013e4ca53520f9d8ef226`.
- Branch/worktree: `codex/gateway-timeout-metrics` / `.worktree/gateway-timeout-metrics`.
- Design: `docs/superpowers/specs/2026-11-21-gateway-timeout-metrics-design.md`.
- Plan: `docs/superpowers/plans/2026-11-21-gateway-timeout-metrics.md`.
- Previous completed contract preserved at `docs/tasks/2026-11-21-release-1.1.2-contract.json`.
- Status: PR #15 release revision is implemented; local build, full tests, and x64 unpacked/Setup/Portable verification pass. Final independent review, PR CI, merge, publication, and Desktop copy remain pending.

## User authorization

The user requested a dedicated PR to evaluate the Gateway wait duration and whether first-content/total-duration metrics are accurate. They clarified that full generation can last one or two minutes or longer, and both the timeout and stream ceiling need to increase. The proposed defaults are a 5-minute upstream response-header wait and a 10-minute end-to-end Gateway request deadline.

Authorized: isolated branch/worktree, implement and test the approved timeout/metric scope, commit and push the task branch, and open one dedicated PR against `master`.

At original task intake, merge/release/version changes were not authorized. The later explicit revision below supersedes those limits for PR #15 merge, version bump, release publication, primary-worktree sync, and Desktop Portable delivery.
Branch/worktree deletion, code signing, existing-release rewriting, and unrelated file changes remain unauthorized.

## Scope and acceptance

- Separate the upstream-header deadline from response-body processing.
- Apply one 10-minute absolute request deadline to JSON, native SSE and converted SSE.
- Keep inbound body receipt at 30 seconds; align the Desktop route-test client timeout with the Gateway request limit.
- Use monotonic elapsed-time measurements and expose timing semantics in the log UI.
- Add focused regressions proving the old 30-second cutoff is gone while header wait and the complete-request deadline remain bounded.
- Run focused/full Runtime and Desktop tests, production build, `git diff --check`, and inspect GitHub CI.
- Open a PR that remains unmerged. No release/version bump or real provider call.

## Capability and baseline

- Applied: `using-superpowers`, `systematic-debugging`, `using-git-worktrees`, `writing-plans`, `executing-plans`, `awg-workspace-governance`, `test-driven-development`, and `verification-before-completion`.
- Repo MCP: `NOT_RUN`; no registered workspace identity is available, and direct bounded source inspection is sufficient.
- Focused Runtime baseline: PASS 44/44.
- Desktop dependency installation: PASS; 439 packages added, 6 moderate npm audit findings and install-script warnings reported.
- Production build baseline: PASS (TypeScript/Vite).
- Full Runtime baseline: PASS 119/119.
- Full Desktop baseline: PASS 142/142.
- Task 1 focused timeout/request-log suite: PASS 40/40.
- Task 1 full Runtime suite: PASS 123/123.
- Task 1 full Desktop suite: PASS 142/142.
- Task 1 `git diff --check`: PASS.
- Task 1 commit: `6037cae9f7935ca0ba79c910fdd8902629cf9df8` (`fix: separate gateway header and request deadlines`).
- Task 2 focused Runtime metrics/logs: PASS 16/16; Desktop timing tooltip: PASS 1/1.
- Task 2 production build: PASS; full Runtime: PASS 125/125; full Desktop: PASS 143/143; `git diff --check`: PASS.
- Task 2 commit: `5f138d923b9f58cb3e351c7748f6360112fedaf5` (`fix: measure request timing monotonically`).
- Final verification: PASS; TypeScript/Vite build, Runtime 125/125, Desktop 143/143, and `git diff --check`.
- Final whole-branch independent review: PASS on `be4de092..bac1770`, no Critical, Important, or Minor findings.
- Dedicated PR: #15, base `master`, branch `codex/gateway-timeout-metrics`, state OPEN and unmerged.
- GitHub CI on PR #15: Runtime PASS, Desktop PASS, package job SKIPPED by workflow condition. Real provider, installer, release, and merge remain `NOT_RUN`.
- Release revision tests: updater 16/16, release manifest 2/2, Settings 13/13; full Runtime 126/126, Desktop 143/143; TypeScript/Vite build PASS.
- Release artifact directory: `apps/desktop/release/1.1.3-final-reviewed`; manifest verifier and unpacked/Portable smoke PASS. GitHub workflow YAML parses successfully; tag/dispatch package job validation is pending.
- Fresh local release-revision verification on 2026-11-21: Runtime 126/126, Desktop 143/143, TypeScript/Vite build PASS; the verifier recomputed all 11 artifact hashes matching the task manifest; unpacked version and isolated Portable control/gateway health checks PASS.
- PR #15 still needs release-revision CI, a fresh independent review, merge, primary-worktree fast-forward, v1.1.3 publication, and Desktop Portable copy/smoke.

## 2026-11-21 Revision: Merge and Release

The user subsequently authorized PR #15 merge, incrementing product/package/build from 1.1.2 to 1.1.3, publishing the matching GitHub release, updating the Desktop Portable program, and integrating the task work into the primary `master` checkout. Preserve the 1.1.2 Desktop Portable, existing running processes until verified delivery, unrelated worktrees/branches, and the current task worktree. Do not code-sign or delete any worktree.

The latest stable version at the time of the request was verified as `v1.1.2`; the next patch version is `1.1.3`.

The repository evidence shows GitHub canonicalizes space-form release assets to dotted names, while the updater previously accepted only the spaced Setup filename. This release revision includes accepting the validated dotted GitHub filename while preserving version path and SHA-256 checks.

## Rollback

Revert only this PR's commits. Timing records need no migration. Preserve the branch, worktree, previous task contract history, and unrelated pre-existing untracked paths.

## Review Notes

- After SSE response headers are sent, a body timeout is recorded as failed `upstream_timeout` and closes the stream; the already-sent HTTP status cannot be changed to 504.
- A downstream SDK/client may impose a shorter timeout and abort before the Gateway's 10-minute deadline.
