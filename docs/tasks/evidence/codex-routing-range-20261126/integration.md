# Revision6 integration evidence

2026-11-26. Task worktree codex-route-management-20261125; revision6 active. No real Codex authentication/configuration read, no external provider generation or search. Tests use isolated homes and local fixtures.

## Root cause and actual installed client

The supplied screenshot shows unsupported_feature/tools.type/Res→Chat. An installed Codex0.167 baseline was captured through a loopback recording proxy using type-only metadata: function, namespace and default cached web_search. Both Chat and Messages routes rejected before the upstream received a request. See .tmp/codex-routing-range-20261126/installed-protocol-baseline.json.

After applying native Gateway configuration, actual installed Codex completed Chat and Messages streamed turns including one synthetic dynamic fixture_echo invocation and the resulting follow-up call. Each outgoing request retained13 local tool definitions; developer instructions reached each backend. No local shell commands executed, and no real provider calls occurred. The route allowed low→high while Codex sent xhigh; the fixture and persisted usage logs both received high. See installed-protocol-result.json / installed-protocol.log. This validates the complete client→Gateway→upstream→client/tool-result chain; protocol tests separately cover namespace/custom/client-tool-search cases.

Cross-layer test tests/runtime/codex-route-integration.test.mjs uses actual Control HTTP, runtime-client projection, native catalog generation and Gateway HTTP. It verifies one shared model across two ordered upstreams, policy persistence and v3 catalog choices, immediate enforcement of changed ranges on stale clients, effective log values and explicit catalog refresh. It first failed on cached rather than disabled hosted search; subsequent integration passed. Native/runtime level parity is asserted; frontend parity lives in route-selection.test.ts.

## Highest level evidence

Initial investigation saw Ultra in Codex's enum; this was insufficient to treat it as an independent API level. Additional actual-client experiment showed catalog high/xhigh/max/ultra yet turn/start Ultra produced HTTP max on both routes. Official rust-v0.167.0 protocol/src/openai_models/reasoning_effort.rs lines10–38 calls Ultra a UI alias and resolves it to a supported non-Ultra effort, preferring Max. core/src/client.rs lines1000–1009 always invokes that normalization for normal requests. Therefore final route controls use seven actual API values none/minimal/low/medium/high/xhigh/max. Neither configured range nor v3 catalog invents an independent Ultra parameter. Existing unrestricted legacy requests retain their old behavior. This is a correction based on stronger evidence, not a claim that every vendor accepts Max.

Public sources: https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/protocol/src/openai_models/reasoning_effort.rs#L10 ; https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/core/src/client.rs#L1000 ; https://developers.openai.com/api/docs/guides/reasoning ; https://platform.claude.com/docs/en/build-with-claude/effort .

## Actual interface checks

Electron fixture electron-smoke-h7RoL7 contains apikey/api666 advertising the same gpt-6.1-sol and distinct additional models. Native route editor showed one unified gpt-6.1-sol selection, both ordered targets, horizontal upstream choices and one protocol container. Selecting low→high and saving produced success feedback. Disk confirmed one enabled route, both target pairs in the same order, reasoning{min:low,max:high}, and zero generated requests.

Browser preview was inspected at390/816/1440px. The dialog and document had no horizontal overflow, protocols and range controls stacked at390px, upper/lower content and save controls were reachable by keyboard scrolling, and focus rings remained visible. Multi-model per-model fields remained readable. Override reset after inspection. This proves layout in the preview; native persistence is evidenced separately above.

## Verification boundary

Fresh final source checks after review fixes: Runtime468/468, Desktop292/292(35files), TypeScript/Vite production build and production dependency audit0. Final UI assets index-DeD_Nw6s.js and index-BEmGGcXT.css. Diffcheck uses core.whitespace=cr-at-eol. Packaging checks are recorded separately in delivery.md.

The final seven-level catalog was additionally verified with actual installed Codex on Chat and Messages: allowed high/xhigh/max, default high, requested max, observed max at upstream and both persisted logs. Each direction completed one fixture tool call and final response; no external provider calls. Result installed-max-result.json.

After restarting the same Electron fixture with final source/build, the saved route interval remained low→high. The real Gateway page showed the shared model, ordered apikey/api666 targets and interval. Applying with the synthetic fixture Key opened the actual confirmation displaying user scope, hosted-search disabling and independent--profile override limitation, then showed successful activation. Disk readback confirmed provider cx_routing_gateway, web_search disabled, model gpt-6.1-sol, catalogversion3, low/medium/high choices/defaultmedium, and zero model requests.

AWG exact-worktree tools returned PROJECT_ROOT_MISMATCH due to the primary-root binding. Terminal/file/UI operations use the checked revision6 contract and host permissions; they were not AWG MCP enforced. No commit/push/merge/release; PR25 retains its original committed head. Real provider support and Owner acceptance remain separate NOT_RUN boundaries.
