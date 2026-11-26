# CXRG-LOG-UPSTREAM-VERSION-2026-11-21

Project/repo: Cx-Routing Gateway / AiaiJei/Cx-Routing-Gateway. Base: master at 6446c470b6e71122d6f1dd3c5427f591ef8f2436. Branch/worktree: codex/request-log-upstream-1.1.1.1 / .worktree/request-log-upstream-1.1.1.1. Dedicated PR remains uncreated until full verification and review pass.

Design: docs/superpowers/specs/2026-11-21-request-log-upstream-version-design.md. Plan: docs/superpowers/plans/2026-11-21-request-log-upstream-version.md.

## Authorization and boundaries

User selected complete four-part product version support and authorized reuse of the existing matching worktree. npm package/lock version stays 1.1.1; product/build/release version is 1.1.1.1. Request table uses 来源 and configured upstream service name; entry credentials remain masked and detail-only. No merge, release publication, tag rewrite, branch/worktree deletion or probe-file deletion is authorized. Existing .tmp-version-probe/ and the archived prior contract are preserved.

## TDD evidence

- Task 1 RED: request log tests failed on missing upstreamName in two assertions. GREEN: gateway snapshots upstreamName beside upstreamId on HTTP failure, stream success, JSON success and exception paths; focused Runtime run passed 111/111.
- Task 2 RED: adapter expected snapshot/ID fallback/unknown source and UI expected 来源/detail-only credential; focused Desktop initially failed 2 tests. GREEN: adapter maps persisted name first, current upstream by ID second, and — otherwise; LogsPage replaced the credential column and retained detail credential; focused Desktop passed 20/20.
- Task 3 RED: release-manifest fixture requested four-part asset names while verifier still required package version 1.1.1. GREEN: cxrgProductVersion metadata, electron-builder buildVersion/artifact patterns and verifier use 1.1.1.1 while package version remains 1.1.1; release-manifest passed 2/2 and production build passed.
- Task 4 RED: Settings still displayed 1.1.1. GREEN: updater accepts three or four numeric components, normalizes missing trailing component, Settings and Electron --version use 1.1.1.1, IPC passes product version; updater/IPC node tests 21/21 and Settings focused suite 13/13.

## Verification ledger

- [x] Full Runtime suite: PASS, 113/113.
- [x] Full Desktop suite: PASS, 138/138.
- [x] Desktop production build: PASS, TypeScript and Vite.
- [x] Release-manifest/updater focused suites: PASS, 23/23; focused Desktop Settings 13/13; focused source mapping 20/20.
- [x] git diff --check: PASS.
- [x] Independent whole-branch review: no Critical findings; two Important findings fixed test-first; one Minor numeric-precision recommendation deferred.
- [x] Dedicated PR: #12 open and unmerged at https://github.com/AiaiJei/Cx-Routing-Gateway/pull/12; head 2e44aec. CI Runtime/Desktop SUCCESS; package SKIPPED by workflow condition.

## Rollback

Revert this branch commits only. Keep the branch/worktree, .tmp-version-probe/, archived contract, existing v1.1.1 release/tag and unrelated untracked files.

## Review and fix ledger

- Independent reviewer found no Critical issues.
- Important fix: electron-builder.yml buildVersion drift was made a verifier/test failure; RED with buildVersion 1.1.1, GREEN after restoring 1.1.1.1.
- Important fix: failover route now names both targets and asserts the selected fallback usage row has upstreamId up-1 and upstreamName Upstream 1; route-batch 4/4 passed.
- Minor deferred: updater numeric components use Number; requested versions are small bounded values, and no current behavior is affected.

## Final verification

- Runtime: 113/113.
- Desktop: 138/138.
- Build: TypeScript and Vite PASS.
- Focused release/update/failover: 27/27.
- git diff --check: PASS.

- Final PR state: OPEN, base master, head 2e44aec1ccf924abc3fa8449cefc0bf90ac5548e. No merge or release publication performed.

- CI final head c24df15: Runtime SUCCESS; Desktop SUCCESS; package SKIPPED by workflow condition. PR #12 remains OPEN and unmerged.

## Reasoning-level revision verification

- RED: Runtime reasoning-field tests failed before implementation; Desktop adapter/UI tests failed because reasoning mapping and the 推理 column were absent.
- GREEN: Runtime request logs 5/5; Gateway core 27/27; full Runtime 115/115; full Desktop 140/140; production build PASS; git diff --check PASS.
- The initial post-implementation Runtime failures were traced to `reasoningEffort` being scoped inside `try` while referenced by `catch`; moving it to request scope restored the existing DNS/timeout/disconnect error paths.
- PR #12 remains the delivery vehicle and must stay open/unmerged.

## 2026-11-21 revision: reasoning level

User approved adding a `推理` column immediately after `来源`. The transmitted reasoning level is read from `reasoning_effort`, `reasoning.effort`, or `thinking.effort`; values are bounded to a trimmed 1–32 character string, otherwise usage omits the field and Desktop renders `-`. PR #12 remains the delivery vehicle and stays unmerged.

- Final reasoning revision PR head 5cf3f64: Runtime 115/115; Desktop 140/140; build PASS; CI Runtime/Desktop SUCCESS; package SKIPPED. PR #12 remains OPEN and unmerged.

## 2026-11-21 revision: status and error disclosure

User requested renaming `结果` to `状态`, a full-status Tooltip including HTTP `200`, upstream and gateway-defined error information, and error information in details. The approved scope keeps bodies and raw provider errors out of logs.

- RED: Runtime status snapshot, Desktop status/error mapping, header rename, Tooltip, and detail error tests failed before implementation.
- GREEN: request-log focused 6/6; Desktop mapping/UI 24/24; full Runtime 116/116; full Desktop 142/142; production build PASS; git diff --check PASS.
- Runtime stores HTTP/upstream/gateway status codes and Desktop maps only sanitized gateway error definitions; raw provider bodies remain excluded.

- Final status/error revision PR head 6ebbd74: Runtime 116/116; Desktop 142/142; build PASS; CI Runtime/Desktop SUCCESS; package SKIPPED. PR #12 remains OPEN and unmerged.

- Final balanced-layout revision PR head 4a55eed: Desktop 142/142; build PASS; CI Runtime/Desktop SUCCESS; package SKIPPED. PR #12 remains OPEN and unmerged.

## 2026-11-21 revision: balanced layout verification

- Selected approach: balanced explicit column widths.
- Layout regression: 10-column `colgroup`, fixed table layout, internal scroll region preserved.
- Desktop: 142/142; production build PASS; `git diff --check` PASS.
- Live Desktop screenshot at the current 1440px viewport confirms left-side whitespace is reduced and Token/status/duration/action columns have readable spacing.
