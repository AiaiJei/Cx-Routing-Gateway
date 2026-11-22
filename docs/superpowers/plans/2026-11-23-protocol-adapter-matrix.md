# Six-Direction Protocol Adapter Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the current cross-protocol preflight rejection with a shared normalized adapter layer that supports Res/Mes/Chat in all six directions for Codex text, tools, structured output where representable, streaming and errors.

**Architecture:** Move parsing and serialization out of gateway request handling into a protocol-adapter module. Each request becomes a normalized conversation with instructions, content parts, tools, tool choice, response format, token limits and feature use; target serializers then emit Res, Mes or Chat payloads. Unsupported semantics return field-specific errors before upstream I/O.

**Tech Stack:** Node.js ES modules, existing HTTP gateway, node:test fixtures, React/Vitest mapping tests.

**Spec:** docs/superpowers/specs/2026-11-23-protocol-adapter-matrix-design.md

## Global Constraints

- Implement all six off-diagonal directions: Res→Chat, Res→Mes, Mes→Res, Mes→Chat, Chat→Res, Chat→Mes.
- Preserve same-protocol Native-Forward behavior.
- Do not add dependencies, change credentials/failover/timeouts, bump versions, publish releases, or call real providers.
- Never silently discard a meaningful request field; return a stable field-specific unsupported error.
- Preserve request IDs, tool-call IDs/indexes, terminal events and sanitized usage logs.

## Review Focus

- Codex Responses tools with tool_choice and response format reach a supported Chat/Mes serializer instead of generic 400; Task 2.
- Tool results preserve call IDs and parallel indexes in all six directions; Tasks 2 and 3.
- Structured output maps only where the target profile can express it and otherwise reports the exact field/direction; Task 2.
- Stream parser handles text, tool arguments, terminal and error events without body leakage; Task 3.
- Native diagonal requests continue pass-through and existing unsupported-feature tests remain meaningful; Tasks 1 and 4.

### Task 1: Introduce normalized adapter contracts

Files: services/gateway/src/protocol-adapters.mjs, tests/runtime/protocol-adapters.test.mjs, services/gateway/src/server.mjs.

Interfaces: parseRequest(protocol, body, profile) returns NormalizedRequest; serializeRequest(protocol, normalized, model, profile) returns an object; parseResponse(protocol, body) returns NormalizedResponse; serializeResponse(protocol, normalized, requestId, profile) returns an object; adapterError(code, field, direction) returns a sanitized 400 Error.

- [ ] Write literal unit tests for Res/Mes/Chat text, system/developer instructions, token ceilings, tool definitions, tool results and tool choice normalization.
- [ ] Run the adapter test file and observe RED because the module does not exist.
- [ ] Implement normalized types and protocol-specific parsers/serializers without touching network code.
- [ ] Run adapter tests GREEN and verify malformed tool definitions and unsupported fields return field-specific errors.
- [ ] Wire server request/response paths to adapter functions while preserving Native-Forward for diagonal pairs.

### Task 2: Support Codex tools and representable structured output

Files: services/gateway/src/protocol-adapters.mjs, services/gateway/src/server.mjs, tests/runtime/gateway-server.test.mjs.

- [ ] Add RED integration fixtures for Res→Chat and Res→Mes carrying tools, tool_choice auto/required/specific, tool results, and supported JSON object/schema response format.
- [ ] Add symmetric Mes→Res, Mes→Chat, Chat→Res and Chat→Mes fixtures for the normalized tool contract.
- [ ] Run focused tests and confirm the current generic preflight rejects at least the Codex tool_choice/response-format cases.
- [ ] Implement target serializers for Chat function tools/tool_choice/response_format, Mes tools/tool_choice/output_config where representable, and Res tools/tool_choice/text.format where representable.
- [ ] Return stable unsupported_feature with field and direction for n>1, logprobs, multimodal parts, and target-inexpressible constraints; never silently omit them.
- [ ] Run all six non-stream integration directions and existing Gateway suite.

### Task 3: Complete streaming event conversion

Files: services/gateway/src/protocol-adapters.mjs, services/gateway/src/server.mjs, tests/runtime/gateway-server.test.mjs.

- [ ] Add RED fixtures for text deltas, tool-call starts/argument fragments, parallel indexes, terminal events and upstream stream errors for each direction family.
- [ ] Implement normalized stream events and six serializers preserving call IDs, indexes, finish reasons and request IDs.
- [ ] Ensure a mid-stream conversion error closes the client stream with a sanitized error event and records no body content.
- [ ] Run focused stream tests and the full Gateway suite.

### Task 4: Desktop/error mapping, verification and PR

Files: apps/desktop/src/data/workspace-client.ts, apps/desktop/src/data/workspace-client.test.ts, docs/tasks/2026-11-23-protocol-adapter-matrix.md, docs/tasks/evidence/protocol-adapter-matrix/verification.md, docs/tasks/2026-11-23-protocol-adapter-matrix-contract.json.

- [ ] Map field-specific adapter errors to readable Chinese status details without exposing provider bodies.
- [ ] Run the full Runtime suite, Desktop tests, Desktop production build, syntax checks, contract parse and git diff check.
- [ ] Record evidence and unavailable checks; request independent read-only review before claiming completion.
- [ ] Commit and push the branch, then create one dedicated PR against master. Keep merge/release/worktree deletion unauthorized.
