# Task worktree archive record

This directory preserves selected task artifacts from the removed `.worktree/upstream-payload-413`.

- `awg-task.json` is the original task-worktree contract captured before final release-stage status was written to the primary `master` contract. It records the initial scope, authorization and PR state.
- The current completed contract is `.codex/awg-task.json` in the repository root.
- `upstream-payload-413-design.md`, `upstream-payload-413-plan.md`, `upstream-payload-413-task.md`, and `red-green-evidence/` preserve the investigation, approved design, implementation plan and verification evidence.
- Release artifacts and final verification are recorded in the parent `release-1.1.2/manifest.json`, `publish.json`, `release-record.md`, and `release-notes.md`.
- Worktree removal was limited to `.worktree/upstream-payload-413`; other worktrees and branches remain.
