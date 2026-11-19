# Project Phase 0 Contract Design

## Intent

Turn the approved Cx-Routing Gateway product direction into an implementation contract. The product is a single-user Desktop app that starts a local Gateway; arbitrary clients choose the inbound API by the request they send, each model route chooses its outbound API, and the response returns in the original inbound format.

## Goals

- Pin the three protocol identities, their version rules, and the provider documentation used as evidence.
- Define explicit support and failure behavior for all nine inbound/outbound combinations.
- Draft stable normalized request, response, stream-event, error, route, upstream, credential-reference, and usage-log contracts.
- Decide the Desktop/Gateway lifecycle, single-instance policy, startup behavior, and network listener boundary.
- Threat-model client credentials, upstream secrets, local control access, SSRF, request limits, and logs before implementation.
- Split later implementation into stage-specific contracts with independent verification and rollback.

## Non-goals

- No application, protocol adapter, server, API, IPC, persistence, migration, or network code in phase 0.
- No promise of full semantic equivalence among provider APIs or support for every model feature.
- No real provider credentials or live upstream calls.
- No merge, release, or deployment.

## Protocol baseline proposal

The Owner selected the existing names: Res = OpenAI Responses API, Mes = Anthropic Messages API, and Chat = OpenAI Chat Completions API. The implementation contract should use these exact endpoints:

| Name | Request endpoint | Version pin |
|---|---|---|
| Res | `POST /v1/responses` | OpenAI REST API `v1`; freeze the reference schema with retrieval date and content hash alongside adapter fixtures. |
| Mes | `POST /v1/messages` | Send `anthropic-version: 2026-10-21`; do not send removed sampling fields `temperature`, `top_p`, or `top_k`. |
| Chat | `POST /v1/chat/completions` | OpenAI REST API `v1`; freeze the reference schema with retrieval date and content hash alongside adapter fixtures. |

The OpenAI API reference documents the Responses endpoint and the migration from `/v1/chat/completions` to `/v1/responses`. Anthropic's versioning and migration documentation requires the dated header and documents breaking changes in `2026-10-21`.

References checked 2026-11-19:

- [OpenAI Responses API reference](https://platform.openai.com/docs/api-reference/responses/create)
- [OpenAI Chat Completions API reference](https://platform.openai.com/docs/api-reference/chat/create)
- [OpenAI migration guide](https://platform.openai.com/docs/guides/migrate-to-responses)
- [Anthropic Messages API reference](https://platform.claude.com/docs/en/api/messages)
- [Anthropic API version history](https://platform.claude.com/docs/en/api/versioning)
- [Anthropic migration guide](https://platform.claude.com/docs/en/api/migration-2026-10-21)

The `2026-10-21` Messages profile is the direct Anthropic API profile. Anthropic's migration guide says that version is available on Amazon Bedrock only for Claude 4.7 and later; older Bedrock model calls must remain on their current version. Therefore an upstream stores an explicit provider/API profile in addition to its protocol family. Bedrock and third-party OpenAI-compatible services must not be labeled with the direct-provider profile unless their endpoint and schema are verified.

These pins identify API surfaces, not model IDs. Model names remain upstream configuration and must not be used as protocol-version identifiers. OpenAI API `v1` is not a dated schema revision, so the implementation task must refresh the official references and store the exact schema retrieval date and content hash with adapter fixtures before coding against them.

## Conversion contract proposal

Use a provider-neutral conversation model with explicit roles/instructions, ordered content parts, tool definitions and results, generation controls, response metadata, and normalized stream events. Preserve the original inbound protocol and route-selected outbound protocol in request context. Keep provider-only fields in typed extension data only when their semantics are understood; never silently discard an input field or stream event that changes meaning.

For each of the nine protocol pairs, the capability matrix must classify text, role/instruction semantics, images/files, tool calls/results, structured output, sampling controls, usage/finish metadata, and streaming as `supported`, `lossy-with-explicit-policy`, or `unsupported`. A request using an unsupported or lossy capability must be rejected with a stable client-facing error unless the Owner explicitly approves a documented downgrade. Streaming must preserve ordering and terminal/error events; mid-stream conversion failures must terminate with a documented error event and correlation ID.

Phase 0 will specify the normalized contract and test vectors. It will not claim a protocol pair is compatible until request, response, tool, error, and stream fixtures cover the declared capabilities.

### Initial cross-protocol profile proposal

The first cross-protocol implementation should deliberately support a small, testable profile. It accepts ordered `user`/`assistant` text turns and at most one initial `system` instruction block; it returns one assistant text result. It accepts one output-token ceiling and uses each API's implicit single-candidate default. It supports text-only SSE streaming, one streamed function-tool call, and multiple function-tool definitions/calls/results in one turn; it rejects parallel streamed tool calls, images/files/audio, structured-output modes, explicit multiple-candidate requests, log probabilities, provider reasoning controls, and unrecognized provider-specific fields before any upstream request.

The token ceiling maps from Responses `max_output_tokens`, Chat Completions `max_completion_tokens`, and Messages `max_tokens`. They represent an output budget, not an exact visible-token count shared across providers; output usage is omitted from converted client responses and recorded as provider-reported values in sanitized logs. The upstream model is always selected by the saved route, never copied from the inbound alias.

One `system` instruction maps to the destination's instruction field. Messages uses a top-level `system` field rather than a message role. A single OpenAI `developer` instruction remains `developer` when sent to Res or Chat; mapping it to Messages' `system` field requires an explicitly enabled lossy-conversion policy. Requests containing both `system` and `developer`, or repeated instruction blocks, are rejected for cross-protocol conversion.

| Inbound / Outbound | Res | Mes | Chat |
|---|---|---|---|
| **Res** | Native wire-format forwarding, bounded by destination support | Cross-protocol text profile; strict instruction handling | Cross-protocol text profile; strict instruction handling |
| **Mes** | Cross-protocol text profile; strict instruction handling | Native wire-format forwarding, bounded by destination support | Cross-protocol text profile; strict instruction handling |
| **Chat** | Cross-protocol text profile; strict instruction handling | Cross-protocol text profile; strict instruction handling | Native wire-format forwarding, bounded by destination support |

The three diagonal entries bind to these explicit API profiles:

| Direction | API profile | Native-direction support rule |
|---|---|---|
| Res->Res | `openai-responses-v1` | Forward Responses request/response fields unchanged except the routed model and Gateway-owned headers; stream frames pass unchanged. |
| Mes->Mes | `anthropic-messages-2026-10-21` | Forward valid Messages payloads unchanged with the pinned version header; enforce this version's content-placement rules. Bedrock and legacy Messages versions use separate profiles. |
| Chat->Chat | `openai-chat-completions-v1` | Forward Chat Completions request/response fields unchanged except the routed model and Gateway-owned headers; stream frames pass unchanged. |

Each profile owns a dated official schema snapshot and content hash, supported-field list, authentication-header policy, and known version-specific validation rules. Profile IDs are not upstream model names; `modelId` is an independent route target.

For all six cross-protocol directions, ordered user/assistant text, one system instruction, one result, an output-token budget, text-only streaming, and one function-tool definition/call are `supported`; a developer instruction mapped to Messages is `lossy-with-explicit-policy`; multiple/conflicting instruction blocks, tool-result chains, images/files/audio, structured output, `n > 1`, provider reasoning controls, and log probabilities are `unsupported`. Same-protocol forwarding preserves the request shape, but does not promise that every destination model accepts every optional field. The nine adapter test suites must exercise each applicable classification.

The `TextCore-1` profile applied to each off-diagonal pair has this explicit feature classification:

| Feature | Classification | Contract |
|---|---|---|
| Ordered user/assistant text turns | `supported` | Preserve turn order and text exactly. |
| One initial system instruction | `supported` | Res/Chat `system` maps to Messages top-level `system`, and back. |
| One developer instruction to Res or Chat | `supported` | Preserve the `developer` role. |
| One developer instruction routed to Messages | `lossy-with-explicit-policy` | Reject in strict mode; allow only when the route explicitly enables the documented downgrade to the Messages system field. |
| Output-token budget | `supported` | Map `max_output_tokens` / `max_completion_tokens` / `max_tokens` as an upper-bound intent. |
| One result | `supported` | Use each API's implicit single-result default; reject `n > 1`. |
| Finish reason | `supported` | Normalize only completed, output-limit, and filtered outcomes; map an unknown upstream finish reason to sanitized `upstream_error` and log it. |
| Usage | `supported` by explicit Gateway policy | Omit provider usage from converted response bodies; store provider-reported counts in the redacted usage record. |
| Multiple/conflicting instructions | `unsupported` | Reject before upstream I/O. |
| Images, files, audio, and other non-text parts | `unsupported` | Reject before upstream I/O. |
| Function tool definitions, calls, and result turn | `supported` | Map function schemas, return multiple normalized tool calls, and map a subsequent result block for each call; standard Chat/Messages/Responses function-call stream deltas preserve indexes and argument fragments. |
| JSON schema / constrained output | `unsupported` | Reject before upstream I/O. |
| Document/citation blocks | `unsupported` | Reject in cross-protocol `TextCore-1`; the native Messages profile additionally validates version-specific placement rules. |
| Sampling, reasoning controls, log probabilities, provider extensions | `unsupported` | Reject unrecognized or unmapped fields before upstream I/O. |
| Text and function-tool streaming | `supported` | Map text deltas, indexed single or parallel function-tool start/argument streams, and terminal events between Chat/Messages/Responses; provider-specific non-function events remain unsupported. |

Each diagonal pair uses the `Native-Forward` profile. Its feature classification is explicit but depends on the selected provider/API profile:

| Feature class | Native-Forward classification | Required behavior |
|---|---|---|
| Text, roles/instructions, token controls, candidates, tools, multimodal, structured output, sampling/reasoning controls | `pass-through-if-profile-supported` | Preserve the API payload except the model alias and Gateway-owned headers. A profile lists supported fields; provider rejection is sanitized and recorded. |
| Streaming and stream events | `pass-through-if-profile-supported` | Forward valid event frames unchanged, including unknown new event types. Do not reinterpret unknown events or terminate because an event is unknown. Enforce backpressure, size, and duration limits. |
| Usage and finish metadata | `pass-through-if-profile-supported` | Preserve response fields; log only allowlisted usage/status metadata. Unknown fields are not copied to logs. |
| Unknown request fields | `pass-through-with-profile-review` | Preserve body fields the Gateway does not own. Schema-diff review must classify new fields before release; never allow body/header values to replace Gateway auth, destination, timeout, or route model. |
| Provider-specific invalid/unsupported fields | `provider-rejected` | Sanitize the provider error; do not claim the field is supported by the Gateway profile. |

`Native-Forward` means wire-format preservation for the selected `providerId`/`apiProfile`; it does not promise that every API implementation or model supports every optional field. The nine directions therefore have a concrete behavior: three native directions use this profile-specific pass-through classification and six cross-protocol directions use the `TextCore-1` table above.

### Normalized contracts

- `RequestContext`: generated `requestId`, detected `inboundProtocol`, client credential identifier, route identifier, and selected `outboundProtocol`.
- `ConversationRequest`: client model alias; ordered messages; optional single instruction block; optional output-token ceiling; requested stream flag; explicitly enumerated feature use. Raw provider payloads are not passed across protocols.
- `Message`: `role` (`system`, `developer`, `user`, `assistant`), ordered `TextPart` content, and no implicit tool/image/file payloads in the initial cross-protocol profile.
- `ConversationResponse`: one assistant text result, normalized finish reason (`completed`, `limit_reached`, `filtered`, `upstream_error`), request ID, and optional provider usage metadata kept out of converted client responses by default.
- `GatewayError`: stable `code`, safe `message`, `requestId`, optional field path, and retryable flag. Never embed provider credentials, raw response bodies, or request content.
- `UsageRecord`: request ID, timestamps/duration, inbound/outbound protocols, route/upstream/model identifiers, status/error code, and provider-reported usage counts; no prompt, completion, client key, or upstream secret.

The planned module interfaces are:

- `WorkspaceControl`: typed operations for upstream CRUD/model discovery/connectivity test, route CRUD, client-key create/rotate/revoke, runtime status, settings, and sanitized logs. It is invoked through Desktop-mediated IPC; renderer code receives no secret-store handles.
- `GatewayRuntime`: `start(config) -> RuntimeStatus`, `stop() -> void`, and `getStatus() -> RuntimeStatus`; startup returns only after bind and readiness checks. Stop is idempotent.
- `RouteResolver`: `resolve(clientKeyId, modelAlias, inboundProtocol) -> ResolvedRoute | GatewayError`; a route includes target provider profile, target model, outbound protocol, enabled state, and conversion policy.
- `ProtocolAdapter`: validate/parse inbound request, report feature use, serialize a normalized request for a named provider profile, parse upstream response, serialize the response to the original inbound profile, and map errors. Streaming is a later feature with a separate event contract.
- `CredentialVault`: store/read/delete by opaque credential reference; secrets never appear in ordinary config records or UI query results.
- `UsageStore`: append a `UsageRecord` and query by bounded time/status/model filters; request and response bodies are outside the interface.

Inbound protocol is selected from the standard request path (`/v1/responses`, `/v1/messages`, `/v1/chat/completions`) and then validated against the selected profile. A model alias resolves to a route before any upstream request. The selected route's `outboundProtocol` and provider profile determine conversion and destination; the response is serialized for the detected original inbound protocol.

### Later-stage handoff gates

| Stage | Deliverable | Required evidence before exit |
|---|---|---|
| 1. Desktop UI | Six-screen Electron workspace | Existing merged PR #3; remaining narrow-viewport screenshot and Owner acceptance stay recorded as pending. |
| 2. Local control and configuration | Versioned config store, upstream/route CRUD, client-key lifecycle, credential-vault adapter, Desktop IPC | Migration/restore test; authorization and redaction tests; key rotation/revoke; SSRF-safe connectivity checks; backup and rollback rehearsal. |
| 3. Gateway and protocol data plane | Authenticated inbound routes, model alias resolution, native forwarding, six TextCore-1 conversions, text-only streaming, and one function-tool call; tool-result chains remain separately gated | Contract tests for nine protocol pairs; request/response/error/stream/tool fixtures; no silent field loss; request limits, timeout, throttling, and upstream mock E2E tests; refresh schema snapshots/hashes, classify every added/removed field and stream event, verify unknown native stream events pass unchanged, and verify hard termination of the Desktop process stops Gateway within 3 seconds. |
| 4. Logs and operations | Sanitized usage query, retention/rotation, diagnostics and limits | Sentinel-secret redaction tests; retention/volume test; bounded storage behavior; operational recovery procedure. |
| 5. Packaging and release | Desktop runtime packaging, install/update strategy, migration and recovery instructions | Clean-machine install/uninstall; Gateway close/crash recovery; security/performance checks; release and rollback owner signoff. |

Each stage gets a new task ID, contract, authorized path list, independently testable acceptance criteria, rollback instructions, and Owner acceptance. No phase-0 document authorizes the next stage's code paths.

Minimum adapter vectors are: each of the six cross-protocol directions maps a user/assistant text conversation and one system instruction; maps the output-token ceiling and response text; preserves the request ID; and rejects streaming, tool calls, image parts, JSON-schema output, unknown fields, multiple instructions, and `n > 1` before network I/O. Add a developer-to-Messages vector proving strict rejection and the route's explicit lossy opt-in. Each same-protocol direction preserves documented fields byte-for-byte where practical and checks configured body/time limits. Error vectors cover authentication, invalid request, route miss, upstream rejection, timeout, and throttling.

Version-specific Messages tests must confirm that `temperature`, `top_p`, and `top_k` are not emitted for `2026-10-21`; top-level document blocks in assistant messages and non-empty citations on text blocks in user messages are rejected without dropping content. A user document block and assistant text with citations are valid native-profile vectors and must remain unchanged. Bedrock profiles targeting Claude 4.6 or earlier must not use the `2026-10-21` version header.

Model alias resolution happens before conversion. Validate that the requested feature set fits the selected route's matrix entry before opening an upstream connection. In strict mode (the default), any lossy or unsupported feature fails with HTTP 400 and `unsupported_feature`; invalid protocol payloads fail with HTTP 400 and `invalid_request`. Authentication failure is HTTP 401 `unauthorized`; missing model route is HTTP 404 `route_not_found`; local throttling is HTTP 429 `rate_limited`; sanitized upstream failures are HTTP 502 `upstream_error`; deadline expiry is HTTP 504 `upstream_timeout`. Preserve `requestId` in response headers/body and logs. Do not expose raw upstream error text to the client.

For native same-protocol forwarding, supported upstream HTTP error statuses may be mapped only through an explicit allowlist; all other provider errors become the stable sanitized Gateway errors above. Cross-protocol failure before headers is a normal JSON GatewayError. Text-only cross-protocol streams use the same stable request ID and terminate with the destination protocol's terminal event; tool-call deltas and tool-result chains remain explicit `unsupported_feature` failures.

The first release profile targets verified direct OpenAI API `v1` and Anthropic Messages API `2026-10-21` endpoints. Each configured upstream records `providerId`, `apiProfile`, `baseUrl`, `protocol`, and `modelId`; the route selects `outboundProtocol` and target model. Compatible third-party endpoints require their own profile and fixture evidence before they can claim the same conversion support.

## Architecture proposal

Retain the existing Electron + React/TypeScript Desktop shell. Keep product logic separated by responsibility: Desktop composition/lifecycle, local control, Gateway request pipeline, routing, protocol adapters, upstream transport, credential storage, persistence, and sanitized usage logging. Define interfaces at these boundaries before selecting storage, packaging, or provider SDKs. The Desktop renderer must not hold upstream secrets or own server lifecycle state directly.

The Gateway pipeline is: authenticate client key; identify inbound protocol from the endpoint/request; validate request; resolve client model alias and route; validate capabilities; convert and call the configured upstream; convert the response or stream back to the same inbound protocol; emit a redacted usage record with a correlation ID. Control-plane operations remain local to the Desktop app and must not become an unauthenticated network administration API.

### Security and abuse cases

| Asset / boundary | Abuse case | Required control and evidence |
|---|---|---|
| Upstream secrets / Desktop process | Secret returned to renderer, log, crash dump, or export | OS-protected secret-store adapter; configuration stores references; one-time reveal only where required; field-allowlist redaction tests. |
| Client keys / Gateway listener | Guessing, replay, or accidental leakage | High-entropy keys; store only a one-way verifier; constant-time verification; rotation/revoke; per-key throttling; never include key in logs or URLs. |
| Desktop renderer / local control | Untrusted web content invokes management operations | Context-isolated preload with narrow IPC capability allowlist; deny remote navigation; validate sender and payload for every privileged operation. |
| Gateway / upstream network | Configured URL reaches loopback, private, link-local, cloud metadata, or changes after validation | Validate scheme/host/port; normalize IPv4-mapped IPv6; classify IPv4 loopback `127.0.0.0/8`, RFC1918 private ranges, IPv6 `::1/128`, `fc00::/7`, and `fe80::/10`; reject unspecified, multicast, and reserved ranges. Connect only to a validated address and verify the peer. Require explicit exact-destination trust for loopback/RFC1918/ULA targets; always block link-local and metadata addresses including `169.254.169.254` and `fd00:ec2::254`; block self-target; disable redirects by default, or revalidate each redirect and strip credentials on origin changes. |
| Request pipeline / provider | Oversized, slow, or high-concurrency requests exhaust local resources | Bound body/response/header size, connection/read/total timeouts, concurrency, queue length, and stream duration; test each limit at and beyond boundary. |
| Logs / local filesystem | Prompt, completion, secret, or high-cardinality values are written to disk | Structured field allowlist, no body logging by default, secret-pattern redaction, bounded retention/rotation, and tests with sentinel secrets. |
| Desktop process / child runtime | Shell injection, orphan process, or stale port ownership | Launch fixed executable/arguments without a shell; record child identity; health-check readiness; graceful shutdown then bounded forced termination; test crash/close/restart. |

Assume local OS users can inspect the same user account's process and filesystem according to OS permissions; the app does not claim to isolate mutually untrusted local users. LAN access stays disabled by default. A trusted upstream exception is approved by the user for an exact scheme/host/port in the upstream editor; resolved addresses must remain within the approved address class. Mixed public/private DNS answers fail closed. Test each listed IPv4/IPv6 range, DNS changes between validation and connect, redirects across origins, and Gateway self-targeting. Local control uses Desktop-mediated IPC and remains separate from the client-facing Gateway listener.

### Lifecycle proposal

- Electron main process owns a single-instance lock and starts one Gateway child process after local configuration is loaded. The parent keeps a private liveness pipe open; Gateway closes its listener and exits within 3 seconds of pipe EOF so an abnormal Desktop crash cannot orphan the server.
- Gateway binds only to `127.0.0.1` and the configured port. A port conflict is a visible startup failure; do not silently choose a new port that would invalidate clients' saved base URL.
- Closing the Desktop window requests graceful shutdown; after 3 seconds, the Desktop terminates the child. No tray residency, background service, OS startup, or automatic restart loop in the first release.
- An abnormal Gateway exit changes the Desktop status to failed and exposes an explicit retry action. Restart must re-run bind, configuration, and readiness checks. A hard Desktop-process termination closes the liveness pipe; a process-level test must prove Gateway exit within 3 seconds.
- The client-facing Gateway requires a client key even on loopback. The management plane is not exposed as HTTP and is only reachable through validated Desktop IPC.

The proposed default port value and storage/keychain implementation remain implementation-phase decisions. A selected port must be documented and checked for collision before release.

These lifecycle and security choices are proposals. Phase 0 must record explicit Owner acceptance or retain any unresolved item as blocked; implementation must not infer approval from this design draft.

## Acceptance evidence

- Owner confirms protocol mapping, version pins, capability scope, and lifecycle/listener defaults.
- All nine protocol directions have a reviewed capability classification and stable rejection/downgrade semantics.
- Domain objects and control/data-plane interfaces identify owners, inputs, outputs, error categories, and secret boundaries.
- Threat model records assets, trust boundaries, abuse cases, mitigations, residual risks, and verification cases.
- Later phases have task-scoped paths, tests, rollback, and owner acceptance gates.

## Rollback

Revert the phase-0 contract and its planning documents only. No runtime behavior, credentials, database, or external state is changed.
