# CXRG-STREAM-COMPLETION-DIAGNOSTICS-2026-11-22

Project/repository: Cx-Routing Gateway / AiaiJei/Cx-Routing-Gateway

Base: `master` at `0f57028f80b0707a2d32a83af5bba4f31bf9bb73`

Branch/worktree: `codex/protocol-completion-state` / `.worktree/protocol-completion-state`

Design: `docs/superpowers/specs/2026-11-22-stream-completion-diagnostics-design.md`

Plan: `docs/superpowers/plans/2026-11-22-stream-completion-diagnostics.md`

## Authorization and boundary

The user authorized execution and a dedicated PR. This task may edit only paths listed in `.codex/awg-task.json`, commit and push its branch, and open one PR against `master`. Merge, release, real provider calls, and deleting branches/worktrees are not authorized.

## Baseline evidence

- Main `master` and `origin/master` are both `0f57028f80b0707a2d32a83af5bba4f31bf9bb73` and the main worktree had no tracked modifications.
- Existing untracked `.agent-workspace-governance/`, `.agents/`, `.tmp-awg-source/`, and `plugins/` are preserved.
- Existing worktrees and branches were enumerated. The new path `.worktree/protocol-completion-state` and branch `codex/protocol-completion-state` did not exist before creation.
- The previous active task contract was copied verbatim to `docs/tasks/archives/2026-11-21-gateway-timeout-metrics-awg-task.json` before establishing this task's contract.
- Source path: `request-metrics.mjs` observes SSE content/usage; `server.mjs`'s stream pipe functions currently treat body EOF as success; the catch path may persist raw transport `error.code`; Desktop maps only `status === completed` to success and otherwise collapses statuses to failure.
- External issue reports are compatibility evidence only; they do not identify the user's deployed New API/Sub2API versions or establish the root cause of a specific request.

## Progress

- [x] Confirm repository root, clean tracked baseline, task scope and worktree/branch uniqueness.
- [x] Create dedicated worktree and branch from current `master`.
- [x] Archive the prior active contract and add this task's design, plan, task record, and active contract.
- [ ] Implement Runtime terminal and disconnect handling test-first.
- [ ] Implement Desktop diagnostics and legacy-safe mapping test-first.
- [ ] Run full verification and independent whole-branch review.
- [ ] Push branch and open dedicated PR; leave unmerged.

## Verification ledger

Pending implementation. Real New API/Sub2API calls, deployment-version confirmation, and Owner acceptance are `NOT_RUN`.

## Rollback

Revert only this task's commits. Preserve the dedicated worktree/branch, archived contract, original primary worktree contents, other worktrees, and untracked directories.
