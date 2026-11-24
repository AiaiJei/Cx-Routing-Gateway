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
