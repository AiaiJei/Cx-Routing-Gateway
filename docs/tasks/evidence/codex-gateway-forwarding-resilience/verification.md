# Codex Gateway Forwarding Resilience — Verification

Date: 2026-11-23
Task: CXRG-CODEX-GATEWAY-FORWARDING-RESILIENCE-2026-11-23
Worktree: `.worktree/codex-codex-routing-forwarding`
Branch: `codex/codex-routing-forwarding`
Base: `master` at `451d40f3f621a635afc093bc50070feb2a58fa59`

## Runtime evidence

- Initial adapter regression tests: RED 5 missing conversions, with existing behavior preserved. Fixed test fixtures were independently reviewed (all findings resolved).
- Reset/disconnect regression tests: RED 4/4 (missing phase/status metadata and abrupt `terminated` client stream); after implementation GREEN 4/4.
- Additional backend-boundary regressions: RED 6/6, then GREEN 6/6 for converted-stream EOF without a terminal marker, completion deferral until transport EOF, large/incomplete passthrough SSE sequence tracking, cancellation classification/circuit isolation, and non-critical credential-use bookkeeping failures.
- The converted `tool_search` EOF fixture was rewritten with `JSON.stringify` and independently rerun RED (HTTP 200 vs required pre-output 502), confirming it emits a valid Chat tool call rather than malformed fixture data.
- Multi-address forwarding regression: RED (first validated IP returns HTTP 502 despite a later healthy approved IP); GREEN after delaying request bytes until transport readiness and advancing only on pre-send connect failures. A companion two-address reset test confirms no fallback after the first server has accepted the model request.
- Focused reset/address-fallback regressions: PASS 6/6.
- Full `node --test tests/runtime/gateway-server.test.mjs`: PASS 68/68.
- Invalid upstream search-argument response: RED 400 instead of502; now one sanitized failed502 record and no preceding success record.
- Combined adapter/server/request-log tests: PASS 98/98 before adding the final no-downstream-output boundary case.
- Full `npm test`: PASS 218/218, 0 failures (final run).
- Coverage includes tool-search schema and collision-safe identity, fragmented streamed arguments, dynamic namespace/custom definitions, structural-carrier consumption, resumed call/result IDs, unknown-type diagnostics, local Gateway roundtrip, pre-header reset, post-output passthrough/converted resets, upstream-headers/no-downstream-output502 boundary, cancellation, no retries, and privacy-limited persisted metadata.

## Desktop evidence

- Test-first mapping/UI checks failed for missing bounded phase mapping and interruption disclosure. A later test-first edge correction failed4 cases distinguishing pre-output502 from partial200/201; correction then passed68/68 focused tests.
- `npm --prefix apps/desktop test`: PASS 24 files, 196/196 tests, 0 failures (final run).
- `npm --prefix apps/desktop run build`: PASS (`tsc -b && vite build`, 78 modules, exit0; final run).
- Task5 focused page/navigation tests: PASS 7/7; the page and navigation were absent in the prior RED run.

## Browser preview

Local Vite production preview only at 127.0.0.1:5196; no real Gateway configuration, credentials, or upstream calls were used.

- 1280×720: page title, 规划中 status, CLI/Desktop synchronization-not-implemented statement, and three existing management links are visible. Document width1280 matches viewport; link hit areas are40px high.
- 390×844: placeholder text wraps, links remain visible40px high, no document horizontal overflow (document width390). Navigation drawer opens; Escape closes it and restores focus to the menu button.
- Clicking 模型路由 enters the existing route page; back returns to Codex. Existing links are /routes, /upstreams, /credentials.
- Browser console errors: none observed.
- Screenshots: `codex-preview-wide.jpg`, `codex-preview-narrow.jpg`.
- Scope: browser rendering/interaction for the placeholder, not native Electron or real-provider acceptance. Log UI is covered by component/page tests, not native screenshot validation.

## Independent review

- Task1 regression-test review: PASS after correcting carrier location, descriptor identity/collision fixtures, stream argument assembly, schema overconstraint and explicit history declaration.
- Task5 placeholder review: APPROVED, no Critical/Important findings. Minor touch-target concern addressed by40px link hit areas, verified in preview.
- Task4 log mapping/UI review: APPROVED, no findings. Final full Desktop suite/build above were run after the downstream502/201 correction.
- Task2/Task3 backend findings were addressed with the additional backend-boundary regressions. The final read-only backend re-review assessed the current fix snapshot as **ADDRESSED**, with no remaining Critical or Important findings; its conclusion explicitly does not establish live-provider behavior. Earlier adapter/history review and Desktop request-log/placeholder reviews were approved as recorded above. Two other review dispatches could not inspect the worktree (one reviewer route returned HTTP 404; another had no filesystem tools); they are not counted as approvals.

## Security/scope and limitations

- No real third-party provider/model requests were made for task verification; all model-path tests use local HTTP/SSE fixtures.
- No automatic retry is added for ambiguous or partially generated requests. Existing future-request circuit selection remains unchanged.
- No Codex CLI/Desktop config/auth files were read or modified; no second credential vault or runtime API was added.
- Historical request d586f573-528d-4904-a2fe-636462e82f5c remains unknown at the concrete tool-type level. A fixed adapter gap does not retroactively identify that historical discriminator.
- Historical request b0c5a487-4dec-4841-85e0-c3f48c82d3a1 recorded `firstTokenMs` ≈20.95 seconds and upstream HTTP 200 before reset. That proves the Gateway received data from an upstream response stream for this request, although provider-side usage-log absence has not been independently verified. Its stored `gatewayStatus: 502` was a synthetic classification even though the downstream stream had already started with HTTP 200; Desktop now describes actual statuses separately. The safe multi-address fallback applies only to a connection failure before request bytes can be sent and does not address this post-output reset.
- For that request ID, “no provider usage entry” is not evidence that the Gateway sent no request: the recorded upstream HTTP 200 and generation-frame timing contradict a no-response-at-all interpretation. The local repair makes post-output resets an explicit failed Responses terminal event and records the actual 200/200 status boundary; it cannot prevent a provider or network from resetting an active stream or prove why the provider omitted a usage entry.
- A successful Gateway circuit probe is TCP-only, and the Upstreams screen's test calls `GET /v1/models`; neither proves a subsequent model-generation `POST` or stream will complete. Source review found another concrete pre-header gap: the TCP probe tries each validated address, while the old request path selected only the first. The Gateway now advances among validated addresses only before transport readiness; local tests confirm one request reaches a healthy later address and no request replay follows an accepted-connection reset.
- Real-provider validation, native Electron inspection and Owner final acceptance: NOT_RUN.
- No version bump, merge, release, Desktop binary replacement, or branch/worktree deletion is authorized or performed.
- Dependency manifests and lockfiles unchanged. Baseline installation had reported6 moderate audit findings; dependency remediation is outside this task.

## Delivery

Dedicated PR #22: OPEN against `master`, head `codex/codex-routing-forwarding`. GitHub CI was IN_PROGRESS at the last check; do not merge or release.
