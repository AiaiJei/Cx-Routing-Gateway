# Verification Evidence

Date: 2026-11-23
Task: `CXRG-CODEX-TOOLS-CONNECTIVITY-PROBE-2026-11-23`
Branch: `codex/tool-definition-probe`
Base: `f58341f5224224bea9ae7abf03818d9cadb4df47`

## Commands

| Command | Result |
| --- | --- |
| `node --test tests/runtime/protocol-adapters.test.mjs` | PASS: 20/20 |
| `node --test --test-name-pattern="(preferred TCP probe|HTTP health request|in-flight transport check|stalled post-cooldown)" tests/runtime/gateway-server.test.mjs` | PASS: 4/4 |
| `node --test tests/runtime/gateway-server.test.mjs` | PASS: 46/46 (independent review) |
| `npm test -- --test-reporter=dot` from repository root | PASS: Runtime 178/178 |
| `npm test -- --reporter=dot` from `apps/desktop` | PASS: Desktop 158/158 across 23 files |
| `npm run build` from `apps/desktop` | PASS: TypeScript and Vite production build |
| `node --check services/gateway/src/server.mjs` | PASS |
| `node --check services/gateway/src/protocol-adapters.mjs` | PASS |
| `node -e` JSON parse of the task contract and `.codex/awg-task.json` | PASS |
| `git diff --cached --check` | PASS: full staged task diff has no whitespace errors |

## Release 1.1.7 Authorization and Local Checks

- On 2026-11-23 the user explicitly authorized incrementing 1.1.6 to 1.1.7, merging PR #21, synchronizing the task result to primary `master`, publishing GitHub v1.1.7, and copying the verified Portable to Desktop. This is revision 1 of the task contract; real provider requests and branch/worktree deletion remain unauthorized.
- The 1.1.7 SettingsPage assertions were first changed and failed against the 1.1.6 package metadata as expected (2 failed). After updating package/product, lockfile, builder, and release-verifier metadata, the focused release tests passed 2/2 and SettingsPage tests passed 13/13.
- Fresh full checks after the version update: Runtime 178/178; Desktop 158/158 across 23 files; Desktop TypeScript/Vite production build passed; package/lockfile/contract JSON and 1.1.7 consistency checks passed; `node --check scripts/verify-release.mjs` passed; CRLF-aware `git diff --check` passed.
- The version commit `2cf218b414572019f7e060856627ef13582ea492` was pushed to PR #21. Fresh GitHub checks for that head passed Runtime and Desktop; the package job was skipped by the workflow condition. A final check run will gate merge after the evidence update.
- The local 1.1.6 Desktop Portable is retained at `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.6.exe`, SHA-256 `4AD3574F3240D5CB8A25FAC4C4F62569A7BC34E4B0EBDBE5ACDEE44E88A4A8F6`. The 1.1.7 release output directory and Desktop destination were absent during preflight.
- Current 1.1.7 GitHub release, artifact, Desktop-copy, and isolated smoke checks are pending. No real third-party provider call was made.

## Review Findings

- Initial independent review found two Important issues. Responses explicit function choices bypassed declaration lookup when the tool list was empty. Explicit `format: null` defaulted to text, and incomplete or malformed grammar formats were accepted.
- Regression tests reproduced both findings before code changes. The adapter now resolves all Responses function choices against declared tools and validates custom format objects and grammar fields. The existing valid-choice fixture now declares its tool.
- Follow-up independent review found no Critical or Important issues. It verified that absent and empty tool lists reject explicit choices with the expected field and direction; omitted formats default to text; valid Lark grammar remains accepted.
- The reviewer also ran the full Gateway test file (46/46), adapter tests (20/20), syntax checks, and a diff check.

## Behavioral Evidence

- Local adapter and Gateway fixtures cover namespaced function tools, custom tools, colliding target names, explicit choices, history, streaming, unsupported built-ins, and invalid custom formats.
- Failback fixtures cover refused TCP, recovery without an HTTP health request, shared concurrent checks, and timeout staying on backup.
- The fresh full Runtime suite includes the tool conversion cases and the persisted-upstream-credential restart test.
- Custom grammar instructions can be preserved in the target tool description, but arbitrary grammar enforcement is not supported by Chat or Messages.

## Capability and Limits

- AWG governance, verification-before-completion, requesting-code-review, receiving-code-review, and finishing-a-development-branch workflows are active. Implementation-stage skill invocations are recorded in the task contract and execution ledger.
- The AWG Repo MCP is available, but this checkout has no `.codex/repo-map.json` and no registered `workspace_id`; Repo MCP calls were not made. Local source inspection and tests were used.
- No real third-party provider request was made. Packaged Desktop quit/relaunch UI acceptance and provider-level repair acceptance remain `NOT_RUN`; merge, release, and Desktop binary delivery are pending the current authorized release sequence.
- The task contract revision records the user's explicit authorization to merge and release 1.1.7; it does not authorize real provider calls or deletion of the task branch/worktree.
## Pull Request

- PR #21 targets `master`. Its original head `70249baab79e0f31af8d7ceb644fb53f2b64a7ae` had successful Runtime and Desktop CI checks; package jobs were skipped by the workflow. The version/release update is being added to the PR branch and needs fresh checks on its new head before merge.
