# Revision6 route runtime evidence

Date: 2026-11-26. Project `cx-routing-gateway`; repository `aiaijei-cx-routing-gateway`; task `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`; contract revision6 active.

Worktree: `C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125`. Branch: `codex/codex-route-management-20261125`. Local source only; no commit, push, merge, release, real Codex config/auth access, real credentials or provider requests were performed by this package.

## Scope and implementation

- `packages/shared/src/reasoning-policy.mjs`: pure Node ESM policy validation/projection; exported ordered `REASONING_LEVELS`, `validateReasoningRange`, `updateRouteReasoning`, `applyRouteReasoningPolicy`.
- `services/local-control/src/route-service.mjs`: atomic batch route assembly, per-model range validation/preserve/clear, explicit `replaceTargets:true` behavior. The HTTP server retains auth and store transaction ownership.
- `services/local-control/src/server.mjs`: batch delegation and single create/patch `reasoning` object/null handling.
- `services/gateway/src/server.mjs`: apply policy after route/auth/target selection and before conversion; use effective level for outbound request and usage log; expose adapter-sanitized `toolType` diagnostics.
- New route-reasoning HTTP regression files; protocol adapter, native and renderer ownership remains with their assigned packages.

## Acceptance results

| Requirement | Result | Evidence |
| --- | --- | --- |
| Distinct model ranges persist and survive restart/read | PASS | Batch HTTP response and a new ConfigStore reader agree. |
| Omitted policy preserves old range; explicit clear/null removes it | PASS | Batch omission/clear and single create/patch HTTP cases. |
| Duplicate/unknown model IDs, invalid/reversed/unordered range reject atomically | PASS | HTTP400 with byte-identical config after every invalid request. |
| All seven ordered wire values through max are accepted; ultra/persistent are not ordered route levels | PASS | Single-route exact ranges and pure projection checks; ultra/persistent rejected by active-policy HTTP. |
| Lower/higher values clamp; inside values remain; absent/empty/whitespace defaults clamp medium | PASS | 54 real local HTTP model requests across all nine protocol pairs; upper/lower default bounds checked separately. |
| Sibling settings survive policy update | PASS | Same-protocol reasoning summary, thinking settings, Messages format and structured Res-to-Mes format verified. |
| Alternate effort fields cannot bypass policy | PASS | Every present recognized effort field validates and synchronizes; malformed field/container and unknown nonempty value return400 without upstream I/O. |
| Effective values, never rejected requested values, are logged | PASS | Successful, upstream-failed, rejected and streaming paths checked. Rejected policy input has no effective reasoningEffort field. |
| All nine streaming pairs apply/log range | PASS | Local SSE upstream fixtures; complete downstream stream and persisted completed log. |
| Priority failover uses the same model policy | PASS | First upstream returns503; later request selects backup; both outbound levels and logs are high. No same-request retry introduced. |
| Legacy unrestricted behavior stays compatible | PASS | No-policy same-protocol requests remain byte-equivalent after model replacement, including absent/persistent/null values. Existing batch/failover/control/log suites pass. |
| Explicit target replacement removes hidden prior target | PASS | replaceTargets:true replaces; omission retains legacy merge. editId preserves alias/ID/disabled state/failover and ordered selected targets. Invalid replacement flags return400. |
| Hosted-tool diagnostics stay bounded | PASS | HTTP error exposes web_search type and fixed guidance; private names/parameters absent; unsafe type omitted; no upstream request. |
| Shared input is not mutated | PASS | Frozen source body and nested containers remain unchanged after projection. |

Empty or whitespace-only effort is explicitly treated as an omitted value when a range is active. Unknown nonempty scalar modes (including ultra and persistent), null/numeric/boolean/object/array values, or malformed recognized containers are rejected. The admin interval is a forwarding policy and does not claim that every provider accepts every scalar.

## Commands and observed results

1. Before production changes: `node --test tests/runtime/route-reasoning-control.test.mjs tests/runtime/route-reasoning-gateway.test.mjs` -> 12 tests, 1 pass, 11 expected failures demonstrating missing save/validation/replacement/clamp/log behavior.
2. After initial implementation: new route tests plus `route-batch.test.mjs` -> 16/16 PASS.
3. Second focused red/green cycle: malformed replaceTargets, rejected-value log omission and toolType HTTP diagnostics failed before the respective fixes, then passed. The rejected-log case was rerun after correcting the test's literal request count from30 to27; it failed on the intended forbidden reasoningEffort field before production was changed.
4. Final affected-chain run: `node --test tests/runtime/route-reasoning-control.test.mjs tests/runtime/route-reasoning-gateway.test.mjs tests/runtime/route-batch.test.mjs tests/runtime/control-server.test.mjs tests/runtime/request-logs.test.mjs tests/runtime/gateway-server.test.mjs tests/runtime/protocol-adapters.test.mjs` -> **184 tests, 184 pass, 0 fail, 0 skip**, exit0.
5. `node --check packages/shared/src/reasoning-policy.mjs` and `node --check services/local-control/src/route-service.mjs` -> exit0.
6. `git diff --check -- services/local-control/src/server.mjs services/gateway/src/server.mjs` -> exit0.

Streaming log verification waits for the actual log count, because downstream SSE completion can precede the asynchronous persistence enqueue. No arbitrary long sleep or production change was needed for that test race.

## Boundaries and remaining stages

- Package implementation and local HTTP/SSE verification: PASS.
- Independent review and combined native/UI/CLI/build/Desktop acceptance: NOT_RUN by this package; coordinator owns those stages.
- Real provider acceptance: NOT_RUN. All upstreams are isolated loopback fixtures; no real key or provider was used.
- Source remains uncommitted and unpushed; the target branch/PR has not been updated by this package.
- AWG contract/Rules were read and checked using terminal reads. File edits used apply_patch and validation used terminal commands; these calls did not pass through AWG MCP enforcement. Host permissions and active task authorization remain the boundary.
- Rollback: remove this package's bounded source edits/new files after coordinator review; preserve other workers' files and earlier revisions. Existing revision5 build/data and user processes were not touched.

Next: coordinator performs independent package review, mirrors/parity checks and combined acceptance. This package is frozen pending that review.

## Independent review repair: same-batch alias collision

An Important review finding demonstrated that editing an enabled route `alias=two, modelId=one` while selecting models one and two could produce two enabled Res routes both named two. The previous validation checked retained routes but not routes assembled earlier in the same batch. Gateway would match only the first one.

- Added six HTTP regression cases before the fix. Three active-collision cases (`one,two`, `two,one`, and `three,one,two`) failed as expected: status200 instead of409. This covers either assembly order, multiple distinct model ranges and a late conflict after another model has already been assembled. All three now assert409 `route_conflict` and byte-identical persisted configuration.
- The bounded fix adds an enabled alias/inbound uniqueness check against this batch's already assembled routes before accepting the next candidate. The enclosing ConfigStore update aborts without writing any candidate on conflict.
- Disabled edited-route identity remains disabled and may share a name with one active new model, in either assembly order. A disabled retained route and a same-name route under a different inbound protocol remain valid. Those three non-conflict cases passed before and after the fix.
- Focused post-fix command `node --test tests/runtime/route-reasoning-control.test.mjs tests/runtime/route-batch.test.mjs tests/runtime/control-server.test.mjs` -> **43/43 PASS**, exit0.
- Fresh affected-chain rerun using the seven files listed above -> **190/190 PASS**, 0 failures/skips, exit0. This supersedes the earlier184-test count after adding six regressions.
- `node --check services/local-control/src/route-service.mjs` and scoped `git diff --check` -> exit0.

Review finding repair: implemented and locally verified. Independent reviewer closure remains with the coordinator. Only route-service, its owned control HTTP test and this evidence were updated during this repair; no commit/push/merge/provider activity. Package frozen again for reviewer recheck.

## Evidence correction: seven wire levels, max as the upper bound

The coordinator's official-documentation and installed-Codex evidence corrected the initial vocabulary assumption: Codex0.167's Ultra is a UI alias and is not an independently established HTTP effort rank; current OpenAI/Anthropic API documentation establishes max as the documented upper level. This package therefore now exposes only `none, minimal, low, medium, high, xhigh, max` as ordered route values. Earlier eight-level assumptions and test counts above are historical evidence and are superseded by this correction.

- Production change is limited to removing ultra from `REASONING_LEVELS`. No changes were needed in either HTTP server or route-service.
- New/updated control cases reject ultra in batch/single create/patch boundaries, including ultra as only the maximum and as both interval endpoints. Invalid writes remain atomic.
- Active range HTTP cases reject client ultra as `invalid_reasoning_effort` for Res, Mes and Chat without upstream I/O; rejected logs omit an effective level. Unknown/persistent behavior remains unchanged.
- Legacy routes with no policy still forward ultra unchanged in each same-protocol path. No silent ultra-to-max mapping is introduced by the runtime.
- Valid upper-bound, failover, sibling-field, frozen-input and all nine JSON/streaming test combinations now use max. All seven levels remain individually exercised.
- Test-first RED: selected batch/single/active-policy/legacy cases -> 4 tests, 3 expected failures200 instead of400 for ultra, and1 legacy pass before changing the helper.
- One post-change focused run: `node --test tests/runtime/route-reasoning-control.test.mjs tests/runtime/route-reasoning-gateway.test.mjs tests/runtime/route-batch.test.mjs tests/runtime/control-server.test.mjs tests/runtime/request-logs.test.mjs` -> **68/68 PASS**, 0 failures/skips, exit0.
- `node --check packages/shared/src/reasoning-policy.mjs` and scoped `git diff --check` -> exit0.

This correction changed only the owned policy helper, two owned route-reasoning tests and this evidence. No commit/push/merge or provider call. Package frozen for a narrow independent recheck; UI/native parity updates and combined acceptance belong to the coordinator.
