# Codex protocol compatibility and unified route effort ranges

Revision6, 2026-11-26. Project cx-routing-gateway; repo aiaijei-cx-routing-gateway; task CXRG-CODEX-ROUTE-MANAGEMENT-20261125. Existing worktree codex-route-management-20261125 and branch codex/codex-route-management-20261125. Prior revisions2–5 and unrelated edits preserved. Owner approved an allowed minimum/maximum range, explicitly superseding the initial fixed-effort proposal.

## Required behavior

1. Actual installed Codex must complete Res→Chat and Res→Mes sessions through Gateway with native local tools retained, including function, namespace and custom calls/results. Investigate default hosted web_search failure and subsequent message/stream incompatibilities. Do not silently drop tools or claim a function wrapper executes hosted search.
2. A unified model has a route reasoning range, not one forced effort. A client value inside the interval is unchanged; below/above is clamped to the minimum/maximum. A missing client value uses medium clamped into the configured interval, making the range effective even when the provider's default is unknown. Routes with no policy preserve legacy request behavior. Reject malformed/unordered requested values safely when a policy is active; no bypass through an unknown value. Log the actual effective level.
3. One horizontal, wrapping upstream selector. A single de-duplicated model selector is the union of selected upstream model IDs, preserving exact identifiers. A chosen model targets each selected upstream which advertises it, in user priority order. A model not available from any selected upstream cannot save. Existing targets absent from discovery remain visible and recoverable, without silently assigning them to unrelated upstreams.
4. Each selected model has minimum/maximum controls and an explicit legacy/unrestricted mode. Saving must validate ordering and retain each model's distinct range. Existing custom aliases, disabled state, priority and failover survive edits. Adding/removing models and upstreams must not retain hidden targets unexpectedly.
5. Client/inbound and upstream/outbound selects live together in one Protocol Settings fieldset, side-by-side at wide sizes and stacked on narrow screens. Existing failover behavior remains.

## Reasoning vocabulary and boundary

Ordered actual API levels: none, minimal, low, medium, high, xhigh, max. Official Codex0.167 reasoning_effort.rs shows Ultra is a UI alias normalized to a supported non-Ultra level (prefers Max); the installed client confirmed Ultra selection emits max. Therefore Ultra is not an eighth independent route level. Persistent is also not assigned an invented comparable rank. Anthropic effort documentation calls max its maximum; model-specific supported ranges vary. The route controls are the administrator's forwarding range, not a claim that every upstream accepts every value. Help links explain the Ultra distinction. No Gateway Max→Ultra remapping. Known unsupported provider/model values still surface upstream errors truthfully. Unconfigured legacy routes keep pass-through behavior.

Sources inspected2026-11-26: https://raw.githubusercontent.com/openai/codex/main/codex-rs/protocol/src/openai_models.rs ; https://developers.openai.com/api/docs/guides/reasoning ; https://platform.claude.com/docs/en/build-with-claude/effort . Codex0.167 source shows default cached web_search and supports_search_tool only controls deferred tool discovery, not hosted web search.

Later precise evidence supersedes the initial enum-only inference: https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/protocol/src/openai_models/reasoning_effort.rs#L10 and client.rs#L1000 normalize Ultra for all ordinary API requests. Enum recognition alone does not prove wire support; no published v3 or real-user range data exists to migrate in this local revision.

## Shared contracts

- Stored route `reasoning?: { min: Effort, max: Effort }`.
- Batch input `modelReasoning?: Array<{modelId:string,min:Effort,max:Effort} | {modelId:string,clear:true}>`. Omitted entries preserve an existing policy; clear removes it. Duplicate/unknown modelIds, unknown levels and reversed intervals return400 without partial writes. Single create/patch supports reasoning object/null under the same validation.
- Batch input `replaceTargets?: true` makes the visible selected targets authoritative when saving an existing unified model. The new UI always sends true. Older callers omitting it retain the historical merge behavior.
- Runtime route projection adds reasoning only when present. Gateway computes effective effort after route/auth selection and before protocol conversion; it updates the protocol-specific request field consistently, preserving other reasoning/format settings and avoiding mutation of shared input.
- Native getRoutes returns `{id,model,reasoning?}`; native generated catalog is version3 with route-specific allowed choices and a medium default clamped to that interval. Historical v1/v2/direct catalog recognition stays compatible. Catalog refresh happens on explicit Gateway save/enable; gateway runtime enforces saved route intervals immediately, including stale clients.
- Scalar value lists must match across backend/frontend/native; focused parity tests guard mirrored runtime boundaries.

## Hosted search compatibility

Hosted web_search is executed by a Responses provider, not by the local Codex client. A Chat/Mes upstream cannot be assumed to provide it. Gateway setup explicitly writes user-scope web_search="disabled" when selected routes require conversion and shows this effect in preview/confirmation/help. Preserve the previous value as part of managed direct-route capture and restore on return to direct. Do not delete unrelated config, local tool definitions, history, MCP or credentials. Legacy callers still sending hosted tools receive a safe specific error naming the unsupported hosted tool and guidance to reapply compatible Gateway setup. Do not silently discard a requested search or fake results.

Actual installed0.167 initialize rejects legacy root `profile="test-profile"` and instructs using `--profile test-profile` with `test-profile.config.toml`. Therefore legacy profile handling may remain for compatibility but must not be reported as proof of current profile activation. Independent startup profile files/CLI overrides are outside this selected config write and must be explicitly called out in preview/UI; no arbitrary profile-file edits.

## Validation and rollback

Use failing regression tests first: route range persistence/clear/order, per-protocol clamping/logs, model union/priority/edit retention, native catalog compatibility and hosted-search restoration. Capture safe type-only summaries from an isolated actual installed Codex request, then run successful streamed Chat/Mes turns and a local tool roundtrip; no real auth/provider/network search. Review each independent package and the combined change. Inspect actual frontend wide/narrow screens and actual Electron save/read/restore. Build a separate1.1.10 Codex Routing Test portable on Desktop, compare source/package hashes, verify two launches using isolated data, and verify original executables/data untouched.

Rollback: keep revision5 Desktop Memory Test and all previous executables; pre-revision6 snapshot .tmp/codex-routing-range-20261126/before.json. Native changes use existing preview, backup and recovery mechanisms. No commit/push/merge/release is authorized for this local revision. Real provider acceptance remains a distinct NOT_RUN boundary, never inferred from fixtures.

## UI direction

Keep existing app tokens, font, modal and shared selectors. This is a working configuration screen, following frontend-engineering and taste app-screen guidance. Primary question: which unified model goes through which ordered upstreams with what effort interval? Compact horizontal upstream choices, one model list, per-model interval rows, one protocol container, then failover and save feedback. No new dashboard or decorative elements. Protect long model names, keyboard focus, scroll reachability and saving/error states at390/816/1440px.
