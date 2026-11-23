# Codex Gateway Forwarding Resilience — Design

**Date:** 2026-11-23
**Task:** `CXRG-CODEX-GATEWAY-FORWARDING-RESILIENCE-2026-11-23`
**Status:** In implementation under the user-authorized task scope; provider validation remains out of scope

## Context and verified evidence

- The request `d586f573-528d-4904-a2fe-636462e82f5c` was recorded as `Res -> Chat`, HTTP 400, `unsupported_feature`, field `tools.type`. The runtime request log does not retain the request body or the concrete `tools[].type`, so the exact rejected type cannot be recovered from that historical record.
- PR #21 is already merged into `master` and release 1.1.7 is present. The current adapter handles Responses namespace groups containing `function` and `custom` tools, but its `normalizeTools` path still rejects other types such as `tool_search` with `tools.type`.
- The request `b0c5a487-4dec-4841-85e0-c3f48c82d3a1` was a streaming `Res -> Res` request for `claude-opus-5-5` through `a6api`. Its log records `upstream_connection_reset`, `gatewayStatus: 502`, `durationMs: 20957.7872`, and `firstTokenMs: 20949.3349`.
- For that second request, the gateway observed generated upstream SSE data before the reset. That is evidence the request reached a response stream, even if the provider's own usage log has no matching entry. The server then records a generic 502 classification and destroys an already-started downstream response. Consequently, `gatewayStatus: 502` in this failure record is not proof that the client received an HTTP 502 response; the actual downstream wire status was already 200 and the stream was cut off. The upstream-management test exercises authenticated `GET /v1/models`, while the circuit health probe checks TCP connectivity; neither reproduces the streaming model `POST`.
- A separate confirmed Gateway asymmetry can explain some pre-header failures despite a healthy connectivity probe: `validateDestination` returns sorted validated addresses, `checkTransportConnectivity` tries each address until TCP succeeds, but `fetchWithTimeout` previously selected only `addresses[0]`. If that first address refuses a connection while a later approved address is healthy, the probe can pass but a real model request can fail before reaching the provider application.

## Goals

1. Complete Codex client-executable `tool_search` conversion across Responses-to-Chat request definitions, history, non-streaming results, and streaming results, while preserving the existing namespace/function/custom behavior.
2. Make a Responses streaming reset after response headers a protocol-level stream failure rather than an unexplained socket truncation, and make request logs distinguish the upstream status, actual downstream status, and failure phase without retaining request or response bodies.
3. Use another already validated destination address only when TCP/TLS connection establishment fails before HTTP request bytes can be sent; never replay a request after connection readiness or any ambiguous transmission.
4. Add a clearly labeled Codex CLI/Desktop management placeholder that reuses existing route and upstream/credential screens without creating a second credential store or writing Codex configuration files.
5. Deliver a reviewed execution plan, self-check/acceptance checklist, evidence, and one dedicated open PR against `master`.

## Design

### A. Responses tool-search adapter

- Treat Codex `tool_search` as a client-executable tool, not as a server-side web-search implementation. Convert it to a collision-safe Chat function tool using the same normalization and reversible identity mapping used for namespace/function/custom tools.
- Collect descriptors from top-level `tools`, `input[].type=additional_tools` structural carriers, and historical `tool_search_output.tools`. Normalize nested namespace/function/custom definitions into target Chat function tools, and consume `additional_tools` as structural metadata instead of emitting a null-content Chat system/developer message.
- Convert historical `tool_search_call` items to Chat assistant tool calls. Preserve the paired `tool_search_output` as a Chat tool result for its `call_id` while also registering its returned definitions as callable tools on the resumed request; do not serialize tool-search results as ordinary user prose.
- Convert a Chat call to the search proxy back to a Responses `tool_search_call` with client execution semantics. Preserve IDs and arguments in non-streaming responses, streaming events, and subsequent request history.
- Keep unrepresentable server-executed built-ins (for example, web-search tools) explicit errors; do not silently drop or pretend to execute them. When rejecting a tool type, include only a bounded safe type discriminator in diagnostic metadata—never the tool name, namespace, schema, arguments, prompt, or key.

### B. Interrupted Responses streams and truthful status

- Capture the upstream HTTP status once response headers arrive and track whether downstream headers/body have started. Keep the existing transport error classification and circuit accounting.
- For a multi-address validated destination, open the HTTP/TLS transport before writing the model request. If connection establishment fails before HTTP bytes are written, try the next already validated address under the same overall deadline. Once the HTTP connection is ready and request bytes may be sent, stop: do not retry that model request on another address. A local fixture with an unreachable first address and healthy later address must deliver exactly one model request to the healthy fixture.
- Isolate each outbound address attempt from cross-request HTTP socket pooling so a keep-alive connection cannot bypass the current validated-address snapshot. Validate upstream HTTP status values before constructing a Fetch `Response`; malformed statuses must become one sanitized failure, not an uncaught exception.
- If an upstream reset happens before downstream headers, return the existing sanitized HTTP 502 error. If it happens after a Responses SSE stream has started, emit the Responses `error` event with top-level `code`, `message`, `param`, and a monotonic `sequence_number`, then end the stream where possible; do not claim a new HTTP 502 after headers have already been sent. Track upstream sequence numbers in passthrough mode and assign them to Gateway-generated Responses frames in converted mode. Do not forward a `response.completed` terminal until clean transport EOF; missing or failure terminal markers and an exhausted sequence number must fail safely. If the downstream client has disconnected, stop writing and only record the failure.
- Persist bounded metadata such as `upstreamStatus`, actual `gatewayStatus`, and a finite `streamFailurePhase`; keep `status: failed` and `errorCode: upstream_connection_reset`. Never log raw payloads or credentials. Update the desktop log detail to show an interrupted stream and the recorded statuses rather than presenting the synthetic error code as proof of a wire-level 502.
- Do not automatically retry an ambiguous model request after request bytes may have been sent or response output has begun. Such a retry could duplicate model execution or billing. This change cannot prevent a third-party service or network from resetting its own socket; provider-level confirmation remains outside local fixture tests.

### C. Codex management placeholder

- Add a Codex navigation destination and a responsive `Codex 路由与管理` page with an explicit `规划中` state.
- Provide links to existing `模型路由`, `上游服务`, and `接入凭证` pages. Explain that Codex routing uses the current gateway route and upstream credentials; do not copy or persist credentials in the new page.
- Mark CLI/Desktop config synchronization as not implemented. Do not read, create, or modify `~/.codex/config.toml`, Codex auth files, or gateway runtime configuration from this placeholder.

## Failure handling and security

- Keep error messages safe and field/direction-specific. Do not expose raw Node socket errors, provider response bodies, or secrets to the client.
- Preserve streaming failure as a failed request even when some tokens were already observed; partial output must not be labeled successful.
- Restrict new observability to validated status codes, a finite phase enum, existing timing/token metrics, and a bounded safe tool-type discriminator.
- All network verification in this task uses local mock upstreams. No real provider request is authorized.

## Verification design

- Adapter unit and Gateway integration tests cover `tool_search` definitions, `tool_search_call`/`tool_search_output` history, `additional_tools` carriers, target call restoration, namespace/name collision safety, non-streaming and streaming paths, and explicit rejection of unsupported server-side tools.
- Local HTTP/SSE fixtures cover resets before headers and after at least one generated event. Assertions verify downstream framing/status, failure logs, upstream status retention, and the absence of request-body/credential data.
- Desktop tests cover navigation, placeholder messaging, links to existing route/credential pages, and accurate interrupted-stream status details. Run the complete Runtime suite, complete Desktop suite, Desktop production build, syntax/diff checks, and independent review.
- Acceptance must separately label actual upstream/provider behavior as `NOT_RUN`; passing local fixtures does not prove a provider-side reset has been eliminated.

## Alternatives considered

1. **Blind retries on `ECONNRESET`: rejected.** A reset after request transmission or partial output has an ambiguous execution outcome and can duplicate calls or charges.
2. **Retry after request transmission on an alternate IP: rejected.** Address fallback is allowed only before the request can be written to any connected socket; a reset after that boundary is recorded and surfaced but not replayed.
3. **Only change the connectivity test: rejected.** A successful TCP check or `GET /v1/models` does not reproduce a streaming `POST /v1/responses` and cannot confirm model-request health.
4. **Build a new Codex credential vault/config writer now: rejected for this stage.** The user requested an initial frontend placeholder; existing upstream credentials and route management should be reused until a separate, reviewed configuration contract exists.

## Rollback

Revert only this task's commits/PR. Preserve PR #21, release v1.1.7, the primary `master` checkout, existing user files, and all unrelated worktrees. Do not merge or release this task without separate authorization.

## References

- CC Switch Codex-to-Chat adapter: [`transform_codex_chat.rs`](https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/proxy/providers/transform_codex_chat.rs), reviewed 2026-11-23 for its `tool_search` proxy-function handling.
- CC Switch Codex Responses Lite `additional_tools` handling: [v3.20.4 release notes](https://github.com/farion1231/cc-switch/blob/main/docs/release-notes/v3.20.4-en.md), reviewed 2026-11-23 for lifting structural tool carriers into Chat tool definitions.
- Responses streaming event reference: [`error` event](https://developers.openai.com/api/reference/resources/responses/streaming-events), reviewed 2026-11-23 for the safe terminal error-event shape and sequence number.
