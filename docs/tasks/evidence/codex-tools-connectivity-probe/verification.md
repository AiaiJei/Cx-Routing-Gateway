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
- The final PR head `9da930586a8575a97ca8809e2dec79fede3b18dd` was merged as `5455e0bd4c8b6397f1381ff2e31995d29e9e925e`. GitHub Runtime and Desktop checks passed; the package job was skipped by workflow condition. The primary `master` worktree fast-forwarded to the merge commit and retained its pre-existing untracked directories.
- The local 1.1.6 Desktop Portable is retained at `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.6.exe`, SHA-256 `4AD3574F3240D5CB8A25FAC4C4F62569A7BC34E4B0EBDBE5ACDEE44E88A4A8F6`. The 1.1.7 release output directory and Desktop destination were absent during preflight.
- The x64 release directory `apps/desktop/release/1.1.7-final-reviewed/` passed `scripts/verify-release.mjs`; the manifest lists 11 artifacts. `smoke-packaged.mjs` reported version 1.1.7, and `smoke-portable.mjs` passed Local Control and Gateway health checks.

## Published Release and Desktop Delivery

GitHub Release `v1.1.7` was published on 2026-11-23 at 10:35:22 UTC. Its tag points to merge commit `5455e0bd4c8b6397f1381ff2e31995d29e9e925e`. GitHub's canonical dotted asset names and uploaded SHA-256 values match the local files:

| GitHub asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Cx-Routing.Gateway.Setup.1.1.7.exe` | 126507930 | `e44e3bc616b4c7b999287925f4c5bf7890f98674e0801caefc5f9d466b968723` |
| `Cx-Routing.Gateway.Setup.1.1.7.exe.blockmap` | 133177 | `2dedfa29a3f13bdc01dfe99cbfb25b0699c1be037227adb6fcdb60f1d06dbdb8` |
| `Cx-Routing.Gateway.Portable.1.1.7.exe` | 115026279 | `73cab66224659675791271533bd1ba788861a7466f0fa3c3be994fa5a8128386` |
| `manifest.json` | 2275 | `968fb548fc4cc3cd599f85c943255491568343686d9346204de9c8703702eeeb` |

The Desktop copy is `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.7.exe`, 115026279 bytes, SHA-256 `73cab66224659675791271533bd1ba788861a7466f0fa3c3be994fa5a8128386`. It matches both the verified local Portable and GitHub asset; the copied executable passed isolated Local Control and Gateway health checks. The existing Desktop 1.1.6 file remains unchanged at SHA-256 `4AD3574F3240D5CB8A25FAC4C4F62569A7BC34E4B0EBDBE5ACDEE44E88A4A8F6`.

The manifest records `signed: false`; no signing certificate is configured. No real third-party provider request was made.

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
- No real third-party provider request was made. Packaged Desktop quit/relaunch UI acceptance and provider-level repair acceptance remain `NOT_RUN`; PR merge, release, and Desktop Portable delivery are complete.
- The task contract revision records the user's explicit authorization to merge and release 1.1.7; it does not authorize real provider calls or deletion of the task branch/worktree.
## Pull Request

- PR #21 was merged into `master`; its final head `9da930586a8575a97ca8809e2dec79fede3b18dd` has Runtime and Desktop `SUCCESS`, while package jobs were `SKIPPED` by workflow condition. Merge commit: `5455e0bd4c8b6397f1381ff2e31995d29e9e925e`.
