# Revision7 protocol package evidence

Project `cx-routing-gateway` / repository `aiaijei-cx-routing-gateway`; task `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`; active contract revision7. Worktree `C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125`, branch `codex/codex-route-management-20261125`.

## Scope and interfaces

- `services/gateway/src/protocol-adapters.mjs`: compatible opaque Responses reasoning history, structured media request conversion, ordered Messages content/tool normalization. Existing custom/namespace/search tools and streaming conversion remain covered by the prior suites.
- New `services/gateway/src/protocol-media.mjs`: content normalization, safe HTTPS/base64 validation and destination image blocks. Text-only normalized content remains a string. Media content is an ordered array of `{type:'text',text}` and `{type:'image',source,detail?}`; sources are `{type:'url',url}` or `{type:'base64',mediaType,data}`.
- Optional normalized `compatibilityWarnings: [{code:'opaque_reasoning_ignored',count:N}]` aggregates only nonempty encrypted reasoning items on explicit `Res->Chat` / `Res->Mes` parsing. No request IDs, reasoning text, ciphertext, URLs or other payload values occur in these warnings. Coordinator owns Gateway log integration.
- Under the coordinator's explicit review decision, Res/Chat `detail:'high'|'low'` converted to Messages retains the image and records `{code:'image_detail_omitted',count:N}` because Messages has no equivalent field. The count covers ordinary messages and function/custom tool-result images; `auto` or absent detail does not count. This warning coexists with opaque-reasoning warnings and carries only the fixed code/count.
- Res->Chat/Mes validates `encrypted_content` as a string, omits it from the normalized cross-protocol history, retains public reasoning metadata separately, and never turns metadata or ciphertext into assistant text, thinking content or signatures. Default Responses parsing / explicit Res->Res preserves encrypted content; the existing native Gateway path bypasses conversion and preserves the original request.
- Supported image data MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, with canonical padded base64. HTTPS images retain their original URL. No image fetch occurs. Images in system/developer instructions, file IDs, HTTP/file URLs, unsupported MIME types, audio/video and unknown content blocks fail with bounded 400 errors rather than disappearing.
- Messages/Responses image tool results remain structured images. Chat allows images only in user messages: assistant/tool images fail safely without changing roles, rather than stringify or drop the image. Explicit source->Chat parsing reports a source-specific field (`input.content`, `input.output`, or `messages.content` / `messages.tool_result.content`) and the complete conversion direction. Standalone Chat serialization also guards normalized non-user media. Ordinary user image requests convert across all six directions.

## Test-first record

1. Changed the former opaque-history and image-rejection expectations and added `tests/runtime/protocol-media.test.mjs` before production edits. Ran:

   `node --test --test-reporter=spec tests/runtime/protocol-media.test.mjs tests/runtime/protocol-adapters.test.mjs tests/runtime/protocol-codex-compat.test.mjs`

   RED, exit1: existing production code rejected opaque reasoning and Responses/Messages images, dropped Chat images, and accepted malformed/unsupported content. Assertions showed the intended missing behavior rather than import or syntax failures.

2. Added the media helper and minimal adapter integration. The same command reached GREEN, 98/98.

3. Review found a changed empty Responses tool-output array result. Added the focused empty-result regression first and ran:

   `node --test --test-name-pattern='empty Responses tool content' tests/runtime/protocol-media.test.mjs`

   RED, exit1: observed `'[]'` instead of the existing empty string. Restored the old empty-text behavior, then reran the three complete protocol suites: **PASS 99/99**, exit0, no skipped/cancelled tests.

4. Ran the existing local Gateway and route regression suites:

   `node --test --test-reporter=spec tests/runtime/gateway-server.test.mjs tests/runtime/codex-route-integration.test.mjs tests/runtime/route-reasoning-gateway.test.mjs`

   **PASS 96/96**, exit0. These cover real loopback Gateway HTTP/SSE conversion, resumed tool history, original native forwarding and reasoning route ranges. They do not call a real provider.

5. `git diff --check -- services/gateway/src/protocol-adapters.mjs tests/runtime/protocol-adapters.test.mjs tests/runtime/protocol-codex-compat.test.mjs`: **PASS**, exit0.

The new media matrix covers all nine source/destination combinations (including adapter-level same-protocol roundtrips), ordered mixed text and two image sources, input immutability, public/opaque reasoning separation, retained tool IDs/order, Messages image tool results, safe unsupported-media rejection and malformed input errors. The pre-existing accidental nesting of the final stream test inside the former image-rejection test was removed while changing that expectation, so both tests run independently.

## Independent-review repair round

The protocol reviewer identified that interleaved Messages assistant text/tool blocks, or Responses reasoning between parallel calls, produced separate Chat assistant messages before tool results. Added the reproductions first, plus target-role image and image-detail warning cases. The focused command below failed **5/5** before the fixes, with expected output-order, missing-error and missing-warning assertions:

`node --test --test-name-pattern='mixed assistant blocks|reasoning between parallel|Chat target rejects|image-detail degradation|Chat image detail' tests/runtime/protocol-media.test.mjs`

The Chat serializer now combines consecutive assistant fragments containing tool calls into a single assistant turn; text order, call order and call IDs survive, and tool results immediately follow. The intermediate normalized Responses history still retains public reasoning positions for Responses serialization. Non-user Chat media is rejected during targeted parse and guarded again during serialization. Detail degradation uses the explicit static warning above.

Reran all six scoped suites after these changes:

`node --test --test-reporter=spec tests/runtime/protocol-media.test.mjs tests/runtime/protocol-adapters.test.mjs tests/runtime/protocol-codex-compat.test.mjs tests/runtime/gateway-server.test.mjs tests/runtime/codex-route-integration.test.mjs tests/runtime/route-reasoning-gateway.test.mjs`

**PASS 200/200**, exit0, no skipped/cancelled tests (**104 protocol + 96 Gateway/route**). Independent re-review remains the reviewer's next action; this test result does not claim review acceptance.

## Reference and boundaries

Read the frozen CC Switch `transform_codex_chat.rs` / `transform_codex_anthropic.rs` in `.tmp/codex-route-management-20261125/revision7/` as comparison data. Their image URL/base64 mapping informed protocol boundary comparison. Their provider-specific signed-thinking envelope decode/restore behavior was not adopted: this contract explicitly forbids decoding or forwarding opaque ciphertext as thought text or signatures.

Implementation and local scoped regression: **PASS**. Independent review, installed Codex exercise, packaged application and complete project verification belong to the coordinator's subsequent stage. Real provider / actual user configuration / Owner acceptance: **NOT_RUN**.

Existing revisions2-6 and other workers' files were preserved. No commit, push, merge, release, user configuration access or provider call was performed. Changes remain local in the task worktree; target branch integration is unchanged. All writes here used terminal/apply_patch after manual contract/path verification; they were **not** validated by AWG MCP. Rollback must remove only this package's increment against the frozen revision7 `before.json`, preserving the earlier dirty state.

Next: coordinator runs independent review and the remaining acceptance chain; resolve any scoped review findings before delivery.
