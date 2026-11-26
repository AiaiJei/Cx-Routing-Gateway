# Revision5 reasoning effort protocol and installed-client proof

Date2026-11-26. Project `cx-routing-gateway`, repository `aiaijei-cx-routing-gateway`, task `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`, active contract revision5.

## Outcome and scope

Task3 implementation and local chain verification PASS, frozen for independent review. The production change is limited to `services/gateway/src/protocol-adapters.mjs`: normalize Chat `reasoning_effort` into the existing bounded `reasoningEffort` field and serialize that field back to Chat. Existing Responses `reasoning.effort` and Messages `output_config.effort` conversion is retained. Bounded nonempty strings are trimmed and preserved, including `none`; missing/empty/non-string/oversized values stay absent. The adapter does not invent a default. Same-protocol forwarding is unchanged.

Test changes are `tests/runtime/protocol-adapters.test.mjs` and new `tests/runtime/codex-reasoning-proof.test.mjs`. Existing Gateway server/request-log tests were run without edits. No production Gateway server changes, credential changes, catalog changes or UI edits by this worker. Native worker owns the generated Gateway catalog metadata/default; the actual installed-client proof consumes that native implementation through `createCodexConfigService`.

Worktree `C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125`, branch `codex/codex-route-management-20261125`. Source remains uncommitted/unpushed; primary/PR25 not updated. Other workers' edits and prior local revisions preserved.

## Test-first and HTTP evidence

The focused failing test reproduced `Res -> Chat` losing `none` (`undefined` instead of `none`). The unit matrix then verifies all nine source/destination pairs, the six standard levels and a bounded custom level. After the minimal two-line behavior correction, protocol tests PASS41/41.

The new actual HTTP fixture starts real local Gateway and loopback HTTP upstreams, authenticates with an inert test Key and checks emitted POST bodies, actual response completion and persisted usage logs. It verifies54 successful requests (nine protocol pairs × six standard efforts), plus24 missing/invalid effort conversions and one native Responses passthrough preserving whitespace/summary/metadata. Logs retain only the normalized effort and metadata, never the prompt, Key or raw request body. `Res -> Chat`, `Res -> Mes`, `Res -> Res`, `Chat -> Res` and remaining directions are covered.

Fresh checks:

- `node --test tests/runtime/protocol-adapters.test.mjs`: PASS41/41 after RED.
- `node --test tests/runtime/codex-reasoning-proof.test.mjs tests/runtime/protocol-adapters.test.mjs tests/runtime/request-logs.test.mjs`: PASS55/55.
- `node --test tests/runtime/gateway-server.test.mjs tests/runtime/protocol-adapters.test.mjs tests/runtime/request-logs.test.mjs tests/runtime/codex-reasoning-proof.test.mjs`: PASS136/136, zero failures/cancelled/skipped.
- `node --check` for the adapter, new HTTP test and ignored installed-client script: PASS.
- `git diff --check -- services/gateway/src/protocol-adapters.mjs tests/runtime/protocol-adapters.test.mjs`: PASS.

## Actual installed Codex outgoing-request evidence

Ignored reproducible script: `.tmp/codex-memory-effort-20261126/installed-codex-reasoning-proof.mjs`. Result: `.tmp/codex-memory-effort-20261126/installed-codex-reasoning-result.json`.

Executed official installed `C:/Users/20142/AppData/Local/Programs/OpenAI/Codex/bin/codex.exe app-server --stdio`, returned user-agent `Codex Desktop/0.167.0`. This run used a newly generated isolated `CODEX_HOME` and empty working directory under worktree `.tmp/codex-memory-effort-20261126/installed-cli-y8elGs/`. Generated config selects the authenticated local Gateway only; Gateway connects to a loopback Responses SSE fixture. Environment overrides for OpenAI key/base endpoints were removed, and no login or real-account status command was used. No tool call is returned by the fixture and no tool execution occurs.

The native-generated catalog was loaded by the installed CLI. `model/list` showed only `cxrg-reasoning-fixture`, standard options `none/minimal/low/medium/high/xhigh`, and default `medium`.

Three actual `turn/start` runs completed:

| Selection submitted to installed Codex | Actual outgoing POST observed at loopback upstream | Actual Gateway usage log | Turn |
| --- | --- | --- | --- |
| `effort: high` | `reasoning.effort: high` | `high`, completed, Res -> Res | completed |
| `effort: none` | `reasoning.effort: none` | `none`, completed, Res -> Res | completed |
| No effort override | `reasoning.effort: medium` | `medium`, completed, Res -> Res | completed |

This proves actual selected/default effort emitted by installed Codex through local Gateway/mock Responses streaming, not merely schema/catalog visibility. The separate real HTTP matrix above proves conversion to Chat and Messages upstream fields. The first probe completed two local turns (`high/none`); the final expanded probe completed three (`high/none/default`), five local fixture model requests total in this worker session. No external provider/model call was made. Login, actual-account auth and provider acceptance remain `NOT_RUN`; no live-provider capability support is claimed.

## Freeze hashes

- `services/gateway/src/protocol-adapters.mjs`: `C680C90E45E139834E18115A76014472F01C1E8EA38D9B3C367F12A7598D800C`
- `tests/runtime/protocol-adapters.test.mjs`: `19F5194E1566EE2537F10D4EF9B181A3F944231153B8EE3FD57D923E5CBA0CF9`
- `tests/runtime/codex-reasoning-proof.test.mjs`: `CBCB35B2DCFCF7521BE1D73A1C19EB9DAEA6610360EC884A86A35B66CD86AABA`
- Ignored installed-client script: `498DB45A79AFB6BA2F888D3B11E5F8B6ED9B0E56159318FEB942A76BB9501A9A`
- Ignored installed-client result JSON: `A99FB370FF5646FAEDB8219CB6D21EE2CAF236FEA8DDA309031875BA99114B70`

## Governance and next action

Git root, AGENTS, identity and revision5 task/spec were read and match this package. AWG scope checks for adapter/new test/evidence were attempted but returned `PROJECT_ROOT_MISMATCH`: MCP is fixed to the primary root. Actual edits and checks used terminal/apply_patch within explicit task scope and are not an AWG tool PASS. No real user config/auth, app data, old binaries, processes or Git integration were modified.

Current availability: local protocol and installed-Codex-to-local-fixture behavior verified. Independent review, whole-revision Runtime/Desktop/build, packaged app acceptance and Owner real provider use are outside this focused result. Next: coordinator obtains independent review and completes whole-revision integration/package checks. Rollback preserves old Desktop/data and reverts only this task's bounded adapter patch in a separately authorized integration operation; no deletion performed here.
