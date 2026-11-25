# HTTP Status and Res/Mes Reasoning Effort

- Task: `CXRG-STATUS-REASONING-2026-11-24`
- Project/repository: Cx-Routing Gateway / `AiaiJei/Cx-Routing-Gateway`
- Contract: `2026-11-24-request-status-reasoning-contract.json`
- Base: `master` at `49c9a389d58b2e5bdb02554d559989ed7fb07596`
- Branch/worktree: `codex/request-status-reasoning` / `.worktree/codex-request-status-reasoning`
- Scope: direct HTTP status display in request logs; preserve reasoning effort in Res↔Mes request conversion and existing sanitized usage metadata. Revision 3 adds a local-only 1.1.9 Windows x64 Portable test candidate from this PR worktree.
- Dependencies: no new runtime or development dependencies.
- Roles: I handle the version metadata and local package; an independent read-only reviewer checks version alignment/package evidence; the Owner performs manual app testing.
- Evidence: regression fixtures for status selection, both protocol directions, and Messages effort logging; Runtime/Desktop tests; Desktop build; syntax and diff checks; request ID lookup outcome; for revision 3, version alignment, x64 package identity, isolated smoke, Desktop copy size/hash, and Owner test outcome.
- Acceptance: HTTP codes are visible with readable fallback and preserved stream-failure semantics; reasoning level appears in the target wire request both ways; PR #23 remains open against `master`; revision 3 produces a verified local 1.1.9 Portable package for manual test, with no commit, push, merge, or main-worktree sync before the Owner's decision.
- Rollback: revert only the revision 3 uncommitted version metadata/assertion edits if the candidate is rejected; keep the generated Desktop artifact for the Owner unless asked otherwise; do not alter unrelated state.

## Implementation checklist

- [x] Add failing regression coverage for downstream-status selection, missing-code fallback, both reasoning-effort directions, and Messages effort logging.
- [x] Verify the tests fail for the reported behavior.
- [x] Implement the smallest changes in the existing request-log component and normalized protocol adapter.
- [x] Run focused tests, complete Runtime/Desktop suites, Desktop build, syntax checks, and `git diff --check`.
- [x] Complete an independent review, correct the successful-request upstream/downstream status ambiguity, and record the follow-up review.
- [x] Record final test and review evidence.
- [x] Commit the review correction and evidence, push the task branch, and open dedicated PR #23 against `master`; leave it open and unmerged.

## Current evidence

- The supplied request ID was not present in the expected `%APPDATA%/Cx-Routing Gateway/runtime/config.json` or `%APPDATA%/@cx-routing-gateway/runtime/config.json` locations. The current source persists only sanitized usage metadata; local fixtures will be used for regression verification.
- Independent review found and verified a successful JSON logging gap: upstream `httpStatus` was recorded, but downstream `gatewayStatus: 200` was absent. A regression test reproduced the missing status, the log now records both values, and the follow-up independent review confirmed the fix.
- Dedicated PR: https://github.com/AiaiJei/Cx-Routing-Gateway/pull/23 (OPEN, targets `master`, not merged). Runtime and Desktop GitHub Actions checks were in progress and Package checks were skipped at first inspection.
- No new provider calls or configuration writes are in scope.

## Revision 3: Local 1.1.9 Desktop Test Package

- Owner request: increment the current package/product version 1.1.8 by one patch to 1.1.9, put a local Windows x64 Portable package on the Desktop, then wait for the Owner's manual test before any PR update, commit, push, merge, or primary-worktree synchronization.
- Repository/worktree: `C:/Users/20142/Desktop/Cx-Routing Gateway/.worktree/codex-request-status-reasoning`, branch `codex/request-status-reasoning`, PR #23. The branch was clean and matched its remote at `5209878557359cdf0096c4d8f4ca3715bd99760c` before this revision; PR #23 was OPEN against `master`.
- Existing package workflow: update `apps/desktop/package.json`, the root package metadata in `apps/desktop/package-lock.json`, `apps/desktop/electron-builder.yml`, `scripts/verify-release.mjs`, and fixed-version Settings/release-manifest tests; build x64 `win-unpacked`, run the existing `scripts/package-portable.ps1`, then run the packaged version and isolated health-smoke scripts.
- Output plan: package under `apps/desktop/release/1.1.9-pr23-local-test/`; copy only to `C:/Users/20142/Desktop/Cx-Routing Gateway Portable 1.1.9 PR23 Manual Test.exe`, which was confirmed absent before work.
- Verification plan: focused Settings/release-manifest tests, complete Runtime/Desktop suites, Desktop production build, x64 PE/package file checks, `--version` smoke, isolated Portable service health smoke, source/copy size and SHA-256 comparison, `git diff --check`, and independent read-only review.
- Limits: no real provider calls, credentials/config changes, existing binary replacement, app-process termination outside the isolated smoke child, commit, push, PR update/merge, release, or primary-worktree change.
- Status: local package preparation is complete. Owner manual test remains `NOT_RUN`; the package is ready for manual testing. Revision 3 is still uncommitted in the PR worktree, and PR/primary-worktree integration remains deferred.

### Revision 3 results

- Version alignment: `1.1.9` is present in Desktop package metadata, lockfile root metadata, electron-builder `buildVersion`, release validation, and version-bound tests. Independent read-only review confirmed the metadata alignment.
- Fresh verification: `npm run build` in `apps/desktop` passed; root `npm test` passed 237/237; Desktop `npm test` passed 202/202; `node --check scripts/verify-release.mjs` passed.
- The normal `git diff --check` invocation flags the CR byte on two added lines in `SettingsPage.test.tsx`. Both the index version and worktree file use CRLF (`git ls-files --eol` reports `i/crlf w/crlf`); `git -c core.whitespace=cr-at-eol diff --check` passed with CR recognized as a line ending.
- Packaged version check: `node scripts/smoke-packaged.mjs "apps/desktop/release/1.1.9-pr23-local-test/win-unpacked/Cx-Routing Gateway.exe"` passed and reported `1.1.9`. The unpacked application PE is x64 (`0x8664`), FileVersion `1.1.9`, ProductVersion `1.1.9.0`.
- Desktop Portable check: `node scripts/smoke-portable.mjs "C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.9 PR23 Manual Test.exe"` passed; isolated `local-control` and `gateway` health endpoints returned `status: ok`. The Portable bootstrap PE is x86 (`0x014C`), as allowed by `scripts/package-portable.ps1`; its bundled application payload is x64. FileVersion and ProductVersion are both `1.1.9`.
- Package copy: worktree artifact `apps/desktop/release/1.1.9-pr23-local-test/Cx-Routing Gateway Portable 1.1.9.exe` and the Desktop test file are both 115,029,496 bytes with SHA-256 `69E80C34ADD7CE0486776E7792C532C3A1CBE088CF6D0CEB976FB54D7D6B9BCC`.
- Signing: `Get-AuthenticodeSignature` reports `NotSigned`; the package build log says no code-signing certificate is configured.
- An initial check incorrectly ran `smoke-packaged.mjs` against the Portable bootstrap and concurrently launched the Portable health smoke; that attempt produced no version stdout and the health process exited with code 1. The version check against the unpacked app and the correct, serial Portable health smoke both passed. The initial combined attempt is not counted as a passing smoke.
- Independent review confirmed version metadata and Desktop-copy identity; it did not independently rerun the smoke. The smoke results above are from direct terminal execution.
- Current integration state: the last successful `gh pr view 23` on 2026-11-24 reported PR #23 OPEN from `codex/request-status-reasoning` to `master`; a later refresh failed with GitHub API `EOF`. The task worktree has only the expected uncommitted version/evidence changes; HEAD remains `5209878557359cdf0096c4d8f4ca3715bd99760c`. No commit, push, PR update/merge, or primary-worktree synchronization was performed.
- Existing 1.1.8 Desktop process was observed and left running. Owner manual acceptance and real-provider calls remain `NOT_RUN`.

### Revision 4 results

- Owner confirmed the tested build was 1.1.9. Isolated packaged-Desktop reproduction established the route-save failure: saving the actual sanitized three-upstream route through the UI, Electron IPC, Local Control and ConfigStore succeeds when no lock exists; a zero-byte legacy `config.json.lock` makes the same UI save display `保存路由失败（500）`. A read-only inspection found a zero-byte legacy lock in the Owner's default runtime, last modified `2026-11-24 18:26:22` Asia/Shanghai, with no Gateway process owning it at that inspection time. The Owner's lock/config files were not manually edited.
- ConfigStore now writes PID/timestamp lock metadata and exposes guarded stale-lock recovery for Desktop startup while the app's single-instance lock is held. Legacy empty locks are only reclaimed after 60 seconds; locks with a live PID owner are preserved. Recovery is limited to the Desktop's serialized startup path.
- Isolated tests: final Runtime ConfigStore/supervisor tests passed 10/10, including stale legacy recovery and active-lock preservation. A packaged single-instance Desktop startup recovered an isolated stale legacy lock and both local service ports became healthy. All 18 sanitized real-profile routes replayed through a file-backed Local Control store and returned HTTP 200. Existing tests confirm live locks are not stolen.
- The reported upstream-test failure was reproduced through packaged Desktop UI/IPC using an isolated, credential-free copy of `api666`: IPC displayed the exact generic `runtime:test-upstream ... 502` response. The saved DNS approval differed from the current A record, so Local Control returned `destination_changed` before credential retrieval or any upstream request. A separate local mock upstream succeeded through the same UI/IPC path.
- Upstream test IPC is now a dedicated testable handler. It maps `destination_changed` to an explanation that DNS changed and instructs the user to edit and re-save the Base URL, retains generic status-only errors for unknown failures, and does not expose arbitrary Local Control error text. Failed connectivity tests now appear as Desktop alerts; success and unavailable runtime responses have explicit presentation handling.
- Regression TDD: the first stale-lock test failed with `Configuration store is busy`; the new Desktop alert test failed because no `role=alert` was shown; the IPC test initially failed because the handler module did not exist. After implementation the focused tests passed.
- Final-source verification: root Runtime suite PASS 244/244; Desktop suite PASS 203/203; Desktop `npm run build` PASS (TypeScript and Vite); focused Desktop upstream/workspace tests PASS 47/47; upstream-test IPC PASS 3/3; ConfigStore/supervisor tests PASS 10/10; syntax checks and CRLF-aware `git diff --check` PASS; task contract JSON parses.
- Final distinct retest package: [Cx-Routing Gateway Portable 1.1.9 PR23 Fix Test Final.exe](C:/Users/20142/Desktop/Cx-Routing%20Gateway%20Portable%201.1.9%20PR23%20Fix%20Test%20Final.exe), 115,032,038 bytes, SHA-256 `D2F2425EDA4A073EECFAC36965C77D2FEEE6821E525BC31C02F9B92F6A8E3A1F`. The x64 unpacked app reports FileVersion `1.1.9`, ProductVersion `1.1.9.0`; the Portable launcher reports 1.1.9. Candidate `--version` and isolated Portable local-control/Gateway health smoke passed. The package is unsigned because no code-signing certificate is configured. The packaged `upstream-test-ipc.cjs` and `runtime-supervisor.cjs` are present; ConfigStore and Local Control packaged files match final source SHA-256 values. The earlier `Fix Test.exe` candidate is superseded and should not be used for retesting.
- The final candidate started with an isolated zero-byte 120-second-old lock; startup removed that lock and the candidate's isolated local services became healthy. The route-save UI was not clicked in the final candidate after cleanup of the default profile event; Owner manual retest remains pending.
- **Unexpected default-profile launch and data audit:** during Computer Use recovery from a minimized candidate window, a temporary 1.1.9 executable was launched without the isolated `--user-data-dir`, using the default `%APPDATA%/@cx-routing-gateway/desktop-ui` profile. This process is still running as PID 25152 and was not stopped. The default `config.json.lock` is now absent; `config.json.bak` remains present. A read-only comparison of backup and current config found no changes to upstreams, routes, or client-key metadata; the 1,000-entry usage list has one new completed `gpt-6-astra` record and the oldest entry rolled off. This record appeared after the default-profile launch; its initiating action is unknown, so an unintended upstream request cannot be excluded. No real provider request was intentionally issued by the verification scripts or packaged smoke tests. Preserve the profile and backup as-is and leave further default-profile inspection to the Owner.
- Integration boundary: PR #23 was confirmed OPEN against `master`. No commit, push, PR update/merge, release, or primary-worktree sync was performed. The task worktree still has uncommitted Revision 3/4 changes. AWG project/map tools are bound to the primary repository task, whose task ID does not match this PR task; terminal implementation and packaging were not AWG-scope-validated.
- Owner acceptance remains `NOT_RUN`; the final distinct candidate is ready for manual testing. Real-provider testing is `NOT_RUN` intentionally, with one uncertain default-profile usage record documented above.

## Revision 5 — reboot DNS fix and authorized release (2026-11-25)

Scope: PR #23, public DNS rotation, stale configuration locks, v1.1.9 integration and publication. Owner explicitly authorized commit, push, PR merge, primary sync, GitHub/Desktop release and removal of this task worktree. Existing test binaries/processes and unrelated worktrees remain protected.

Plan and acceptance:
1. Reproduce the public-IP snapshot mismatch with injected DNS and local upstream transport. Share one policy between upstream test and Gateway. Validate on every connection; pin the actual connection to that result. Keep private trust, private snapshot checks, mixed answers and sensitive address rejection. No provider API calls.
2. Harden stale-lock recovery against live/unknown owners and competing processes. Add failure-first regressions and retain serial atomic writes.
3. Run Runtime/Desktop suites and build, obtain independent review, then package Setup and Portable in a fresh official output directory. Verify the final isolated Electron UI route save/upstream test before and after restart, plus package/Portable smoke and version/hash identity.
4. Commit/push/update PR #23, wait for checks, merge and fast-forward primary master. Publish verified v1.1.9 assets and a new Desktop Portable. Archive task-only evidence/needed artifacts before removing this worktree. Verify final remote/local status.

Roles: primary agent implements/integrates; independent reviewer audits lock/network boundaries and final diff; Owner receives formal package. Rollback is a task-scoped revert before publication, or a new corrective release afterward. No destructive history rewrite.

Evidence correction: revision 4 stale-lock startup was demonstrated with Fix Test.exe. Fix Test Final.exe passed version and isolated health smoke; its stale-lock/UI checks were not repeated. New final-artifact evidence must be recorded separately.

AWG project identity check passed; PR23 scope check returned TASK_MISMATCH against the unrelated deployment binding. Terminal operations use this task's contract and direct Owner authorization, without AWG tool validation.
