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
- Real-provider validation and Owner manual route test: NOT_RUN. Interactive native Electron UI visual inspection is NOT_RUN; the isolated x64 Portable health smoke is recorded under revision 1 below.
- Revision 1 authorizes version 1.1.7 → 1.1.8 and a distinct local Desktop test copy only. No merge, public release, overwrite/stop of the existing 1.1.7 app, or branch/worktree deletion is authorized/performed.
- Dependency versions and graph unchanged; package and lock metadata version fields are updated in revision 1. Baseline installation had reported 6 moderate audit findings; dependency remediation is outside this task.

## Delivery

Dedicated PR #22: OPEN against `master`, head `codex/codex-routing-forwarding`. GitHub runtime and Desktop checks passed for latest pushed commit `8bf96f5`; the package job was skipped by workflow rules. Do not merge or release.

## Revision 1: Local 1.1.8 Desktop Test Build

Date: 2026-11-24. Authorized by the user's follow-up to increment the version once and provide the local Desktop application for Owner testing before deciding PR integration.

- Baseline was package/product/build version 1.1.7. Updated package and lockfile version, `cxrgProductVersion`, electron-builder `buildVersion`, the release verifier's expected product version, and fixed-version Settings/release-manifest assertions to 1.1.8. No dependency versions changed.
- Focused verification: SettingsPage 13/13; release-manifest 2/2; metadata alignment check passed.
- Fresh full verification after the bump: Runtime 218/218; Desktop 196/196; TypeScript/Vite production build passed.
- Windows x64 unpacked package built in `apps/desktop/release/1.1.8-codex-forwarding-local-test/win-unpacked/`. `node scripts/smoke-packaged.mjs` reported version 1.1.8.
- Windows x64 Portable built using `scripts/package-portable.ps1` at `apps/desktop/release/1.1.8-codex-forwarding-local-test/Cx-Routing Gateway Portable 1.1.8.exe`. Portable isolated smoke passed for both `local-control` and `gateway` services, using temporary user data and reserved ports only.
- Verified Desktop test copy: `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.8.exe`; 115,030,754 bytes; SHA-256 `E4841BC2C1C5B8E279CA612D955942B1D2E8EF7422D967D4B77B80889E8EFD52`; Windows ProductVersion 1.1.8. Source and Desktop copy hashes and sizes match.
- Existing Desktop Portable 1.1.7 remains unchanged at SHA-256 `73CAB66224659675791271533BD1BA788861A7466F0FA3C3BE994FA5A8128386`; its existing process (PID 16164 at copy/smoke checks) was not stopped. The new test binary is alongside it; the running UI has not been switched. To test 1.1.8 interactively, exit the old app normally, then launch the new 1.1.8 file.
- Packaging output was unsigned because no signing certificate is configured. No GitHub release, installer deployment, provider/model request, or user-data migration was performed.
- PR #22 remains OPEN and still contains the prior pushed 1.1.7 implementation. This version bump/build revision is uncommitted and unpushed in the PR worktree. The primary `master` worktree was not modified. Owner manual real-route test and integration decision remain PENDING.

## Owner test of 1.1.8

On 2026-11-24 at 03:02:01 China Standard Time, request `8c4fb1ee-a411-4846-bd58-f0ee08175fd1` selected the A6API Chat route for `deepseek-v4.1-flash-1017`. The running 1.1.8 portable contained the same adapter bytes as the task worktree. The local request log recorded `rejected`, `unsupported_feature`, `tools.type`, `Res->Chat`, `web_search`, Gateway HTTP 400 and no upstream HTTP status. The rejection took 16.7 ms. The adapter returned before the upstream model POST.

- A loopback fixture using the existing Gateway entry point reproduced HTTP 400 with zero upstream requests when Responses tools included `web_search`. A function-only control reached the Chat upstream once. An explicit Responses-to-Responses route forwarded both definitions intact to a local Responses fixture.
- The three existing runtime tests for unsupported built-ins and bounded diagnostics passed. They verify the refusal path. The Owner test establishes that 1.1.8 still cannot route this particular request.
- The active route has one A6API Chat target for this model. The [A6API model listing](https://a6api.vip/) lists the alias. It does not document which endpoint or search tool that route supports.
- [DeepSeek's Responses guide](https://api-docs.deepseek.com/guides/responses_api/) says its official Flash endpoint ignores the standard `web_search` tool. [DeepSeek Web Tools](https://api-docs.deepseek.com/guides/web_tools/) documents a provider-specific `deepseek_web_search` tool. [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/zh/model-studio/deepseek-api) documents standard `web_search` through Responses for the same model version on its own service. The model ID alone is insufficient evidence of A6API tool support.
- [CC Switch's Responses-to-Chat tool collector](https://raw.githubusercontent.com/farion1231/cc-switch/main/src-tauri/src/proxy/providers/transform_codex_chat.rs) skips `web_search`. Its [Alpha Search handler](https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/proxy/handlers.rs) forwards search as a separate request. [DeepSeek's Codex setup](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/) also documents standalone Alpha Search. The user's successful external Chat test establishes that text generation worked on that path. Actual search needs a search trace or structured search events and citations.
- Confirm the endpoint and search capability for this A6API line before adding a mapping. If the line supports native Responses with `web_search`, verify the existing passthrough with a real search and an ordinary function call. If it supports a separate search API, scope that integration and verify search independently from generation.
- The task remains at Owner test failed. This finding adds evidence to the existing scope. It does not authorize a provider request, a new search integration, a deployment change or PR integration.

## Revision 2: Responses round trips through Chat and Messages

On 2026-11-24 at 04:06:44 China Standard Time, Zcode showed `empty_model_response` for request `e006543f-ced5-4755-a4e4-359dac20d757`. The Gateway recorded HTTP 200, completed, and 52 output tokens for the Res → Chat route. The screenshots show the Zcode error and the two usage entries. The original SSE frames are unavailable, so the exact failing frame or absence of deliverable output remains unknown. The Owner subsequently reproduced HTTP 400 using CC Switch with RG. The origin of that 400 remains undetermined.

The earlier native Responses result was a loopback test of request forwarding. It asserted that the mock at `/v1/responses` received the same `web_search` and function definitions. Search execution was outside that test.

- The old converted SSE omitted output item and content-part frames for text, and the completion lacked a complete output array. A private-reasoning-only response could also appear successful. The Chat HTTP fixture verifies a complete Responses event lifecycle, identifies text and function deltas by item ID and index, and observes the usage tail. The thinking-only and empty cases return HTTP 502 before any output.
- The Messages fixture asserts the actual `/v1/messages` POST, translated tool choice and schema, instructions, and stream settings. It verifies reconstruction of text and segmented arguments, consistent indexes and sequences, and final usage. A Messages error after output ends the Responses stream with an SSE error.
- RED reproduced the misplaced Messages tool choice, lost text beside JSON tool calls on both routes, ignored Messages SSE errors, false completion at an output limit on both routes, empty Messages tool arguments, and split assistant turns before parallel tool results. GREEN covers these same cases. The Messages fixture also covers normal thinking-only and missing-terminal handling.
- Full `npm test` passed 231/231. `npm --prefix apps/desktop test` passed 196/196 across 24 files. `npm --prefix apps/desktop run build`, Node syntax, contract JSON parsing, and CRLF-aware `git diff --check` passed.
- Windows x64 unpacked and Portable packaging passed. The unpacked executable reported product version 1.1.8. The packaged gateway adapter and server hashes matched the working sources, and 14 focused loopback HTTP/SSE cases passed with the packaged Gateway entry point.
- Both source and Desktop-copy Portable smoke tests passed Local Control and Gateway health using isolated data and ports. The Desktop copy is `C:/Users/20142/Desktop/Cx-Routing Gateway Portable 1.1.8 - Responses Roundtrip.exe`, 115,031,199 bytes, SHA-256 `C8472A2EF7EBEA3FB382AA37088245709ED2DBA9F24674FD3347F3F4527F18D1`. The previous 1.1.7 and 1.1.8 files matched their earlier hashes. Active Gateway process IDs matched before and after smoke.
- Independent review is blocked. The reviewer session received HTTP 400 `unsupported_feature` from its CC Switch route during startup. This retry produced no code-review verdict and does not identify the origin of the Owner's CC Switch error.
- Real-provider requests and interactive client acceptance remain pending. Unsupported server-side search still receives its field-level Gateway error in cross-protocol mode.

## Revision 3: Privacy-preserving stream-stage diagnostics

Date: 2026-11-24. The Owner reported that the previous 1.1.8 round-trip candidate passed manual testing and authorized numeric stream-stage instrumentation using local SSE fixtures only. PR integration remains pending.

- TDD RED: `node --test --test-name-pattern="paced Responses-to-Chat" tests/runtime/request-logs.test.mjs` failed at the expected missing `upstreamHeadersMs` field before implementation.
- TDD GREEN: the paced local Res → Chat fixture delays upstream response headers, the first body byte, and subsequent SSE chunks independently. It verifies timing boundaries, converted output order, finite processing timing, and persisted-log redaction. The response marker, request prompt marker, raw SSE frame markers, and test credential do not appear in persisted usage data.
- Runtime verification: `node --test tests/runtime/request-logs.test.mjs` passed 9/9; focused converted and native reset cases passed 2/2; direct route-batch/supervisor regressions passed 7/7; final full `npm test` passed 232/232. Failure logs also retain timing metadata without changing the single-attempt reset outcome.
- Desktop verification: focused mapping/details tests passed 61/61; final full `npm --prefix apps/desktop test` passed 197/197 across 24 files. Older rows display `—`; invalid timing values are discarded and chunk count must be a safe non-negative integer.
- Build and static checks: `npm --prefix apps/desktop run build` passed (`tsc -b && vite build`, 78 modules); `node --check` passed for `request-metrics.mjs` and `server.mjs`; both task JSON files parse and share the same task ID; `git -c core.whitespace=cr-at-eol diff --check` passed. Plain `git diff --check` flags CRLF endings on pre-existing 1.1.8 Settings test lines, so the repository-aware CRLF setting was used rather than rewriting those prior changes.
- Metrics preserve `firstTokenMs`: response-header and first-byte values start at Gateway request receipt; body duration ends at upstream stream termination (including reset); chunk count means body-reader chunks, not SSE events; Gateway processing sums synchronous parse/convert/write time and excludes upstream waiting.
- No real-provider request, reasoning-parameter change, protocol conversion change, version change, portable package build, executable replacement, commit, push, merge, or release was performed for this revision. The previously tested 1.1.8 Desktop Portable does not contain these diagnostic changes. Same-model/same-input Owner A/B and review of fresh request IDs are `NOT_RUN` pending separate authorization for a diagnostic-enabled local candidate.
- Independent review is `BLOCKED`, not PASS: two read-only reviewer dispatches failed before inspecting code when the CC Switch local proxy returned HTTP 404 `route_not_found` and HTTP 400 `unsupported_feature` for their Codex `/responses` requests. These are review infrastructure failures and provide no verdict on the Gateway patch. Earlier independent reviews of the round-trip work do not cover revision 3.


## Revision 4 integration and release preflight

Date: 2026-11-24. Direct Owner authorization now covers committing/pushing the accepted task-scope changes, updating and merging PR #22, synchronizing primary master, and publishing GitHub v1.1.8. Live GitHub state confirmed v1.1.7 is the latest release/tag and no v1.1.8 tag exists. PR #22 is open against master at 8bf96f5; its existing Runtime/Desktop checks pass, package jobs are skipped by tag/workflow rules, and those checks predate the current local changes. The task branch package/product/build versions are aligned at 1.1.8.

Fresh local validation on the full current task worktree: npm --prefix apps/desktop run build passed; npm test passed 232/232; npm --prefix apps/desktop test passed 197/197 across 24 files. These are local fixture/suite results, not provider or Desktop Owner acceptance. Revision 3 independent review remains BLOCKED (two dispatch failures at the CC Switch local proxy, with no code verdict). Release packaging, updated-head CI, merge, primary sync, and GitHub publication are pending this preflight note.


### Revision 4 local release candidate

Updated-head CI for commit 8b7567707929e1ec253af6be021ea1e273df7643 passed Runtime and Desktop for both push and pull_request runs; package jobs were skipped by branch-event rules. A local Windows x64 release candidate was built in the unique task output directory apps/desktop/release/1.1.8-github-release. verify-release passed and generated a manifest covering the unpacked runtime, installer, blockmap, and Portable. Unpacked version smoke passed (1.1.8); isolated Portable smoke passed for Local Control and Gateway. Build is unsigned (no signing certificate configured).

Release assets: Portable 115033173 bytes, SHA-256 78908A66518DD7C17D9B42A1AC3DBA042D2E52D53B739801A2D7889DAEFE5DDB; Setup 126513094 bytes, SHA-256 CE16E92F08C91BA2BE7BD64D9E7712F98980650833A04F276197AF1CC8ADCDBE; Setup blockmap 133196 bytes, SHA-256 7073DF5D2EC525A419821FBBDCE0240D56271264B97DB2712A0DE9D155567C21; manifest 1A3FA9A3FF4D722549D94D051283F8FC1A58663BB453605E69DD96B653C144C7.

Independent review is BLOCKED for both the revision 2 round-trip changes and revision 3 timing changes because the CC Switch local proxy failed before review output. The Owner's explicit integration direction is recorded; this does not convert those reviews to PASS. No live provider requests were made.
