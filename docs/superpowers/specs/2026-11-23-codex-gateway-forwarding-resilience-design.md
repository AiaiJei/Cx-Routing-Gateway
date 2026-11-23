# Codex Gateway Forwarding Resilience — Design

**Date:** 2026-11-23
**Task:** `CXRG-CODEX-GATEWAY-FORWARDING-RESILIENCE-2026-11-23`
**Status:** Awaiting Owner review before implementation planning

## Context and verified evidence

- The request `d586f573-528d-4904-a2fe-636462e82f5c` was recorded as `Res -> Chat`, HTTP 400, `unsupported_feature`, field `tools.type`. The runtime request log does not retain the request body or the concrete `tools[].type`, so the exact rejected type cannot be recovered from that historical record.
- PR #21 is already merged into `master` and release 1.1.7 is present. The current adapter handles Responses namespace groups containing `function` and `custom` tools, but its `normalizeTools` path still rejects other types such as `tool_search` with `tools.type`.
- The request `b0c5a487-4dec-4841-85e0-c3f48c82d3a1` was a streaming `Res -> Res` request for `claude-opus-5-5` through `a6api`. Its log records `upstream_connection_reset`, `gatewayStatus: 502`, `durationMs: 20957.7872`, and `firstTokenMs: 20949.3349`.
- For that second request, the gateway observed a generated upstream SSE event before the reset. The server then records a generic 502 error and destroys an already-started downstream response. Consequently, `gatewayStatus: 502` in this failure record is not proof that the client received an HTTP 502 response; a partially delivered stream can instead have been cut off. The upstream request-log endpoint tests `GET /v1/models`, which does not exercise the streaming model-request path.

## Goals

1. Complete Codex client-executable `tool_search` conversion across Responses-to-Chat request definitions, history, non-streaming results, and streaming results, while preserving the existing namespace/function/custom behavior.
2. Make a Responses streaming reset after response headers a protocol-level stream failure rather than an unexplained socket truncation, and make request logs distinguish the upstream status, actual downstream status, and failure phase without retaining request or response bodies.
3. Add a clearly labeled Codex CLI/Desktop management placeholder that reuses existing route and upstream/credential screens without creating a second credential store or writing Codex configuration files.
4. Deliver a reviewed execution plan, self-check/acceptance checklist, evidence, and one dedicated open PR against `master`.

## Design

### A. Responses tool-search adapter

- Treat Codex `tool_search` as a client-executable tool, not as a server-side web-search implementation. Convert it to a collision-safe Chat function tool using the same normalization and reversible identity mapping used for namespace/function/custom tools.
- Convert historical `tool_search_call` items to Chat assistant tool calls and `tool_search_output` definitions to the corresponding target function definitions; do not serialize tool-search results as ordinary user prose.
- Convert a Chat call to the search proxy back to a Responses `tool_search_call` with client execution semantics. Preserve IDs and arguments in non-streaming responses, streaming events, and subsequent request history.
- Keep unrepresentable server-executed built-ins (for example, web-search tools) explicit errors; do not silently drop or pretend to execute them. When rejecting a tool type, include only a bounded safe type discriminator in diagnostic metadata—never the tool name, namespace, schema, arguments, prompt, or key.

### B. Interrupted Responses streams and truthful status

- Capture the upstream HTTP status once response headers arrive and track whether downstream headers/body have started. Keep the existing transport error classification and circuit accounting.
- If an upstream reset happens before downstream headers, return the existing sanitized HTTP 502 error. If it happens after a Responses SSE stream has started, emit the Responses `error` event with top-level `code`, `message`, `param`, and a monotonic `sequence_number`, then end the stream where possible; do not claim a new HTTP 502 after headers have already been sent. Track upstream sequence numbers in passthrough mode and assign them to Gateway-generated Responses frames in converted mode. If the downstream client has disconnected, stop writing and only record the failure.
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

- Adapter unit and Gateway integration tests cover `tool_search` definitions, history/output, target call restoration, namespace/name collision safety, non-streaming and streaming paths, and explicit rejection of unsupported server-side tools.
- Local HTTP/SSE fixtures cover resets before headers and after at least one generated event. Assertions verify downstream framing/status, failure logs, upstream status retention, and the absence of request-body/credential data.
- Desktop tests cover navigation, placeholder messaging, links to existing route/credential pages, and accurate interrupted-stream status details. Run the complete Runtime suite, complete Desktop suite, Desktop production build, syntax/diff checks, and independent review.
- Acceptance must separately label actual upstream/provider behavior as `NOT_RUN`; passing local fixtures does not prove a provider-side reset has been eliminated.

## Alternatives considered

1. **Blind retries on `ECONNRESET`: rejected.** A reset after request transmission or partial output has an ambiguous execution outcome and can duplicate calls or charges.
2. **Only change the connectivity test: rejected.** A successful `GET /v1/models` does not reproduce a streaming `POST /v1/responses` and would not explain the observed first-token-then-reset sequence.
3. **Build a new Codex credential vault/config writer now: rejected for this stage.** The user requested an initial frontend placeholder; existing upstream credentials and route management should be reused until a separate, reviewed configuration contract exists.

## Rollback

Revert only this task's commits/PR. Preserve PR #21, release v1.1.7, the primary `master` checkout, existing user files, and all unrelated worktrees. Do not merge or release this task without separate authorization.

## References

- CC Switch Codex-to-Chat adapter: [`transform_codex_chat.rs`](https://github.com/farion1231/cc-switch/blob/main/src-tauri/src/proxy/providers/transform_codex_chat.rs), reviewed 2026-11-23 for its `tool_search` proxy-function handling.
- Responses streaming event reference: [`error` event](https://developers.openai.com/api/reference/resources/responses/streaming-events), reviewed 2026-11-23 for the safe terminal error-event shape and sequence number.
