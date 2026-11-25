# Verification: HTTP Status and Res/Mes Reasoning Effort

- Task: `CXRG-STATUS-REASONING-2026-11-24`
- Repository: `AiaiJei/Cx-Routing-Gateway`
- Base: `master` at `49c9a389d58b2e5bdb02554d559989ed7fb07596`
- Branch/worktree: `codex/request-status-reasoning` / `.worktree/codex-request-status-reasoning`

## Implementation

- Request-log status cell now displays the downstream code by preferring `gatewayStatus`, then `httpStatus`, then `upstreamStatus`; malformed/out-of-range values are ignored and old records without a code retain their success/failure label.
- Successful JSON request logs now retain upstream `httpStatus` and separately record the actual downstream `gatewayStatus: 200`, so an upstream `201` cannot be mistaken for the response returned by the gateway.
- Failed requests and interrupted streams remain negative. For an interrupted stream the code is paired with `流已中断`; the existing details continue to distinguish upstream and downstream codes and explain partial delivery.
- Res `reasoning.effort` is normalized and serialized as Messages `output_config.effort`. Messages `output_config.effort` is normalized and serialized as Res `reasoning.effort`. Effort is bounded to a trimmed string of at most 32 characters.
- Messages `output_config.effort` is included in the existing bounded `reasoningEffort` usage field. Request/response bodies remain unrecorded.
- The supplied request ID `b42fa972-2acb-4339-8fa8-41541fe68aee` was not found. No runtime config file was present at either `%APPDATA%/Cx-Routing Gateway/runtime/config.json` or `%APPDATA%/@cx-routing-gateway/runtime/config.json`; source was verified using local fixtures instead.

## Verification

- TDD red: adapter regressions failed on both missing effort mappings; status-cell regressions failed on the missing numeric display; the Mes→Res integration regression forwarded effort upstream but failed to find it in usage logs.
- Focused Runtime: `node --test tests/runtime/protocol-adapters.test.mjs tests/runtime/request-logs.test.mjs` — PASS, 50/50.
- Focused Desktop: `npm test -- src/components/RequestLogCells.test.tsx src/pages/LogsPage.test.tsx` — PASS, 37/37.
- Full Desktop: `npm test` from `apps/desktop` — PASS, 202/202.
- Desktop build: `npm run build` from `apps/desktop` — PASS (TypeScript and Vite production build).
- Full Runtime: the initial run was 235/236 because the clean worktree had no `apps/desktop/dist/index.html`; after the successful production build, rerun `npm test` — PASS, 236/236. After the review correction, rerun `npm test` — PASS, 237/237.
- Syntax and contract: `node --check` for `protocol-adapters.mjs` and `server.mjs`, and JSON parse of the task contract — PASS.
- Dependency setup: `npm ci --ignore-scripts --offline` in `apps/desktop` installed the existing lockfile dependencies; 439 packages added, audit reported 0 vulnerabilities. No dependency or lockfile change was made.
- Real provider requests: NOT_RUN. Desktop runtime smoke and Owner acceptance: NOT_RUN.
- Independent review: PASS. The first review identified that a successful non-stream request could show an upstream `201` although the gateway returned `200`. A new local regression test failed before the fix (`gatewayStatus` was absent) and passed after the server began recording downstream `gatewayStatus: 200` separately. Follow-up review confirmed the issue is resolved and found no log-semantic regression; its review scope was the changed status path and request-log tests.
- Dedicated PR: [#23](https://github.com/AiaiJei/Cx-Routing-Gateway/pull/23), open against `master` and not merged. At first inspection, Runtime and Desktop GitHub Actions checks were in progress across the push and pull-request events; Package checks were skipped. The branch was pushed and the task evidence was updated with the PR reference.

## Integration boundary

- No version change, release, merge, credential/config write, or Desktop binary replacement was made.
- The task PR is authorized to be created against `master` and must remain open.
## Revision 5 — final release candidate verification (2026-11-25)

- Root cause: both upstream testing and forwarding compared every DNS answer to the addresses saved at configuration time. Normal public DNS rotation was rejected after a restart.
- Shared destination policy now revalidates each connection and permits public-IP rotation. The HTTP connection remains pinned to that validated result. Private-IP changes, public/private transitions, mixed answers, metadata/link-local/unspecified addresses remain rejected before credential access.
- Windows ConfigStore writes and startup recovery share a crash-released named-pipe mutex derived from the canonical config directory. PID ownership is considered dead only on ESRCH. A legacy empty lock is recovered only when older than the current OS boot plus a 60-second margin. Unknown/malformed owners are retained. First-time configuration creation is also serialized.
- Failure-first regressions: public rotation failed with upstream_error/destination_changed; current-boot empty lock, unknown process probe, and competing recoverers failed before their fixes. All pass after the fixes.
- Full Runtime: `npm test` — PASS 253/253. Full Desktop: `npm test --prefix apps/desktop` — PASS 203/203. `npm run build --prefix apps/desktop` — PASS.
- Independent reviewer `/root/release_lock_review`: PASS, no blocking P1/P2 after corrections. Independently ran syntax/diff checks, 5 lock-recovery matrix cases and 10 IPv6/mapped-address cases. Full suites were run by the primary agent.
- Final official build: `electron-builder --win nsis portable --x64 --config.directories.output=release/1.1.9-official` — PASS. Setup, blockmap and Portable built. `verify-release.mjs ... --write` verifies 13 artifacts. Eight critical packaged source/asar modules hash-match the tested source.
- Actual packaged Electron UI, isolated profile `.task-evidence/official-desktop-profile-3`: pre-boot empty lock recovered; upstream-test click displayed “连通成功，发现 1 个模型”; route threshold changed 3→4 and Save displayed “已保存 1 个上游模型配置”. Restarted the process with the same profile, changed injected public DNS from 1.1.1.1 to 9.9.9.9 without resaving Base URL, and the same UI test succeeded. The old stored approval remained 8.8.8.8. The route value 4 survived restart; a second edit 4→5 saved successfully. Disk snapshots confirm both writes and no remaining lock.
- Desktop fixture used real renderer→preload→IPC→Local Control→ConfigStore. Only DNS lookup and the upstream socket destination were redirected to a loopback fixture through the isolated process debugger; no third-party API calls, real profile or credentials were used. Exactly two local GET /v1/models requests were recorded with original Host preserved. This is controlled Desktop evidence, not real-provider or physical-PC-reboot acceptance.
- Final unpacked `--version` — PASS 1.1.9. Official Portable isolated Local Control/Gateway health smoke — PASS. All task-launched GUI/mock processes stopped; the pre-existing Owner app remains untouched.
- Limitations: unsigned Windows assets; non-Windows automatic stale-lock recovery disabled. Do not run an old unpatched 1.1.9 test candidate concurrently against the same profile as the formal build. Owner testing of real providers remains NOT_RUN for this final candidate.
- Governance: AWG project identity check PASS; PR23 scope check TASK_MISMATCH against the separate deployment contract. Task writes/release commands use direct Owner authorization and the PR23 contract through terminal tools, not AWG tool validation.

Integration and publication will be recorded in the archived closeout after the PR is merged and release assets are verified.
