# SDD ledger — plan: docs/superpowers/plans/2026-11-25-codex-route-management.md
## Preflight
| Tasks | Interface or file | Check |
|---|---|---|
| 1 / 2 | desktopControls get/preview/apply/restore | Exact names and shapes in spec; Task 2 owns TS declarations; Task 1 owns preload. |
| 1 / 3 | package lock and native tests | Maintained TOML runtime dependency is packaged by Electron; full runtime regression follows. |
| 2 / 3 | CodexPage and CSS | Existing shell preserved; real browser checks complement UI tests. |
| 1 | file/IPC tests vs implementation | Real temporary files and local HTTP fixtures cover semantics; never touch real Codex home. |
| 2 | frontend tests vs implementation | User-visible behavior and native method contracts; browser mode blocks native operations. |
| 3 | verification vs deliverable | Dedicated PR remains open; no installed/released claims. |
Ruling: Use the complete proposed management scope as the implementation target under the Owner's continuing development/PR goal; development touches only isolated fixtures, and product writes require explicit UI confirmation — avoids leaving the page a partial preview — if scope differs, PR can be revised before merge.
Ruling: Use codex/codex-route-management-20261125 because Git rejected the app default './' prefix as invalid — follows existing repository naming — no functional cost.
Ruling: Direct Gateway bearer Key storage is explicit in the UI, redacted everywhere else, and backed up locally; no second credential vault — supports local Desktop setup without changing process/user environment — stored TOML/backups must be treated as credentials.
## Progress
Task 1: pending
Task 2: pending
Task 3: pending
Task 1: complete (28f849c,2070197,6776c8f; native review and final IPC re-review clean)
Task 2: complete (6a8b3d9,e9a639e; renderer review clean)
Task 3: local validation complete; current-head GitHub CI and ready state verified by coordinator after delivery commit.
Task 3: complete — PR25 head47d2df1 verified OPEN/MERGEABLE; both push and pull_request Runtime/Desktop checks PASS; package jobs skipped by branch-event policy. This documentation-only checkpoint follows the verified source; coordinator rechecks final PR state after pushing it.
Primary checkout bootstrap task-binding edit restored byte-for-byte from its unchanged HEAD after confirming the only change was ours. Task worktree retains its own contract; primary tracked state remains unchanged, existing untracked directories preserved.
Task 1: fix round 1/5 — native review found TOML unrelated-value loss and default-port80 rejection; source-span editor and regressions in progress.
Task 2: fix round 1/5 — renderer review found mutation-result loss during late workspace refresh; lifecycle separation and refresh gating in progress.
Ruling: Preserve unrelated TOML source ranges using a maintained AST parser rather than whole-file serialization — fixes verified numeric/timestamp changes — adds a focused editor and one parser dependency; no expanded product scope.

## Delivery checkpoint
- 889f8d7: task contract, design, plan, baseline and worktree ignore committed; no implementation staged.
- Dedicated Draft PR #25 created and attached: https://github.com/AiaiJei/Cx-Routing-Gateway/pull/25 (OPEN, base master).
- Native worker restarted on inherited parent route after unavailable explicit model. Native and renderer ownership are disjoint; fixed method/result contracts permit implementation overlap. Each will receive independent review before final integration.
