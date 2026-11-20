# Request Log Source and Product Version Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Create a dedicated PR that shows upstream service names as request-log sources, keeps entry credentials in details only, and defines product build/release version 1.1.1.1 while retaining valid npm SemVer 1.1.1.

**Architecture:** The Gateway snapshots the selected upstream name beside the existing upstream ID in usage records. The runtime adapter prefers the snapshot and falls back to the current upstream map for legacy records; the Logs page presents that name in a 来源 column and keeps the masked credential in the detail modal. Product metadata keeps npm version at 1.1.1 and adds cxrgProductVersion: 1.1.1.1; electron-builder, Settings, update IPC, updater comparison, release asset naming and verification consume the four-part value.

**Tech Stack:** Node.js ESM runtime, Electron main process, React/TypeScript/Vitest desktop UI, electron-builder YAML, Node test runner, PowerShell/GitHub CLI.

**Spec:** docs/superpowers/specs/2026-11-21-request-log-upstream-version-design.md

## Global Constraints

- Product/build/release version is exactly 1.1.1.1; npm package and lockfile version remain exactly 1.1.1.
- Request logs never store raw credentials or request/response bodies.
- New usage records retain upstreamId and add optional upstreamName; legacy rows remain readable through ID fallback.
- Existing published v1.1.1, branches, tags and .tmp-version-probe/ remain untouched.
- Work stays on codex/request-log-upstream-1.1.1.1; create one open PR against master, with no merge or release publication.

## Review Focus

- A selected failover target must snapshot the actually selected upstream name, not the first configured target.
- Legacy usage with a renamed or missing upstream must resolve through the fallback map or render — without throwing.
- A credential must not reappear in the table or raw value in the detail view.
- Three-part legacy update tags and four-part current tags must compare numerically and validate installer names consistently.
- electron-builder must receive a four-part Windows build version while npm install/build continues to accept the three-part package version.

### Task 1: Snapshot upstream names in runtime usage records

**Files:** services/gateway/src/server.mjs; tests/runtime/gateway-server.test.mjs; tests/runtime/request-logs.test.mjs; this plan ledger.

**Interfaces:** Consume the selected upstream object and existing appendUsage path. Produce optional upstreamName string on completed/failed usage records; keep upstreamId unchanged.

- [ ] Write failing runtime regressions for a successful request and a failover request, asserting the stored record contains the selected upstream name and ID; add a legacy-compatible request-log assertion that the field is optional.
- [ ] Run focused Runtime tests: npm test -- --test-name-pattern="usage|upstream|request log" from the repository root. Expected: new name assertions fail while existing tests pass.
- [ ] Implement the minimal snapshot by adding upstreamName: upstream.name at every usage append path after route target selection; do not add credential/body fields or alter retention.
- [ ] Rerun focused tests and then npm test -- tests/runtime/gateway-server.test.mjs tests/runtime/request-logs.test.mjs. Expected: all focused tests pass.
- [ ] Commit: feat: snapshot upstream names in request logs.

### Task 2: Map source names and move credential visibility to details

**Files:** apps/desktop/src/domain/types.ts; apps/desktop/src/data/workspace-client.ts; apps/desktop/src/pages/LogsPage.tsx; apps/desktop/src/data/workspace-client.test.ts; apps/desktop/src/pages/LogsPage.test.tsx.

**Interfaces:** Consume Task 1 usage records, configured state.upstreams, existing CallLog and detail modal. Produce CallLog.upstream as source service name; CallLog.credential remains available only to detail UI.

- [ ] Write failing adapter/UI tests for snapshot-first mapping, ID fallback, unknown-source —, a 来源 table heading/value, no 入口凭证 table heading, and a detail modal that still shows only the masked credential.
- [ ] Run focused Desktop tests: npm test -- src/data/workspace-client.test.ts src/pages/LogsPage.test.tsx. Expected: new assertions fail.
- [ ] Implement an ID-to-name map, prefer item.upstreamName, fall back to the map, render — when absent, replace the table credential header/cell with 来源, and leave the detail credential row intact.
- [ ] Rerun focused Desktop tests and confirm no raw credential is introduced in rendered output.
- [ ] Commit: feat: show upstream service as request log source.

### Task 3: Add four-part product version metadata and packaging expectations

**Files:** apps/desktop/package.json; apps/desktop/package-lock.json; apps/desktop/electron-builder.yml; scripts/verify-release.mjs; tests/runtime/release-manifest.test.mjs.

**Interfaces:** Consume package metadata and electron-builder buildVersion macro. Produce manifest.version 1.1.1.1, four-part installer/portable names, and npm package version 1.1.1.

- [ ] Write failing release metadata tests for the custom product version, artifact names containing 1.1.1.1, and package SemVer remaining 1.1.1.
- [ ] Run npm test -- tests/runtime/release-manifest.test.mjs. Expected: four-part expectations fail against the current three-part verifier.
- [ ] Implement metadata/config/verifier changes using the custom package field and buildVersion patterns; keep existing runtime resource requirements.
- [ ] Rerun release-manifest tests and npm run build --prefix apps/desktop. Expected: tests and production build pass.
- [ ] Commit: build: define product build version 1.1.1.1.

### Task 4: Make Settings and updater compare four-part product versions

**Files:** apps/desktop/src/pages/SettingsPage.tsx; apps/desktop/src/pages/SettingsPage.test.tsx; apps/desktop/electron/main.cjs; apps/desktop/electron/github-update-ipc.cjs; scripts/check-update.mjs; tests/runtime/check-update.test.mjs.

**Interfaces:** Consume cxrgProductVersion, trusted IPC and updater functions. Produce Settings display 1.1.1.1; updater accepts v1.1.1 and v1.1.1.1, normalizes missing components to zero, and compares current/remote versions correctly.

- [ ] Write failing tests for Settings text, compareVersions four-part ordering, four-part release tag/asset validation, and current-version IPC using product metadata.
- [ ] Run npm test -- tests/runtime/check-update.test.mjs src/pages/SettingsPage.test.tsx. Expected: four-part parsing/display assertions fail.
- [ ] Implement a shared numeric four-component parser/comparator in scripts/check-update.mjs, update release/tag/installer validation and IPC current-version injection, and import product display metadata in Settings without changing token handling.
- [ ] Rerun focused tests, then the existing update and Settings suites. Expected: all pass, including legacy three-part fixtures.
- [ ] Commit: feat: support four-part product version updates.

### Task 5: Integrate evidence, review, and open the dedicated PR

**Files:** .codex/awg-task.json; docs/tasks/2026-11-21-request-log-upstream-version.md; preserve docs/tasks/archives/2026-11-20-tray-close-readme-awg-task.json and .tmp-version-probe/.

**Interfaces:** Consume completed Tasks 1–4 and commits. Produce a reviewable branch and one open PR against master.

- [ ] Run full verification: root Runtime npm test, Desktop npm test --prefix apps/desktop, Desktop production build, release-manifest/check-update focused tests, and git diff --check; record exact counts and failures.
- [ ] Run independent whole-branch review against the branch base, act on Critical/Important findings with test-first fixes, and record deferred minors/rulings.
- [ ] Re-run complete verification after review fixes and inspect git status to confirm the probe directory remains untracked and no unrelated files changed.
- [ ] Commit contract/evidence updates, push codex/request-log-upstream-1.1.1.1, and create one dedicated PR against master with version/log behavior and verification evidence.
- [ ] Leave PR open and unmerged; record URL, head SHA, CI state and remaining Owner acceptance limits.

## Dependency Ledger

| Producer | Consumer | Interface | Ruling |
| --- | --- | --- | --- |
| Task 1 | Task 2 | usage[].upstreamName optional snapshot plus upstreamId | Snapshot is preferred; ID map is fallback for legacy rows. |
| Task 3 | Task 4 | package.json.cxrgProductVersion and buildVersion | npm version remains 1.1.1; product comparisons use four numeric components. |
| Tasks 1–4 | Task 5 | Tests, build and release metadata | Only fresh command output supports completion/PR claims. |

## Rollback

Revert only this branch commits. Do not delete the existing branch/worktree, probe files, published release/tag, or unrelated untracked directories.

### Task 6: Add transmitted reasoning level to request logs

**Files:** `services/gateway/src/server.mjs`; `tests/runtime/request-logs.test.mjs`; `apps/desktop/src/domain/types.ts`; `apps/desktop/src/data/workspace-client.ts`; `apps/desktop/src/data/workspace-client.test.ts`; `apps/desktop/src/pages/LogsPage.tsx`; `apps/desktop/src/pages/LogsPage.test.tsx`.

- [ ] Write failing tests for `reasoning_effort`, nested fallback fields, invalid/oversized values, adapter mapping, the `推理` column after `来源`, and `-` for missing values.
- [ ] Run focused Runtime/Desktop tests and observe the expected failures.
- [ ] Implement bounded input extraction, optional usage persistence, adapter mapping, and table/detail rendering.
- [ ] Run focused tests, full Runtime/Desktop suites, production build, `git diff --check`, and update PR #12 with the new head and CI.
