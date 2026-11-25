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
