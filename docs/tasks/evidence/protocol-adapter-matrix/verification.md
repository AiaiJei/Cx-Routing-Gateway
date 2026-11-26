# Verification Evidence

Date: 2026-11-23
Task: CXRG-PROTOCOL-ADAPTER-MATRIX-2026-11-23
Branch: codex/protocol-adapter-matrix

## Commands

| Command | Result |
| --- | --- |
| node --test tests/runtime/protocol-adapters.test.mjs | PASS: 10/10 |
| node --test tests/runtime/gateway-server.test.mjs | PASS: 43/43 |
| npm test from repository root | PASS: 165/165 |
| npm test from apps/desktop | PASS: 158/158 across 23 files |
| npm run build from apps/desktop | PASS: TypeScript and Vite |
| node --check services/gateway/src/server.mjs | PASS |
| node --check services/gateway/src/protocol-adapters.mjs | PASS |
| git diff --check | PASS |

## Behavioral Evidence

- Res→Chat and Res→Mes Codex-style requests carry tools, tool_choice and structured-output format to the target serializer.
- Mes→Res, Mes→Chat, Chat→Res and Chat→Mes text directions pass symmetric local fixture checks; the matrix also retains Res/Mes/Chat native forwarding checks.
- Multiple tool calls and result blocks preserve call IDs and indexes; stream tests cover text, single and parallel tool argument deltas, terminal events and native passthrough.
- n>1 returns multiple_candidates_unsupported with field n and direction Res→Chat. Non-text Responses content returns unsupported_feature with input.content and direction.
- Desktop mapping renders field-specific errors in Chinese while excluding provider bodies.

## Boundaries

- No real third-party provider request was made.
- Version metadata and published releases were not changed.
- Independent reviewer dispatch is pending; the task remains unmerged and the worktree is preserved.

## Final implementation verification

- Runtime full suite: 165/165.
- Desktop full suite: 158/158 across 23 files.
- Desktop TypeScript/Vite build: PASS.
- Gateway full suite: 43/43; adapter unit matrix: 10/10; stream-focused Gateway cases: 17/17.
- Syntax checks and git diff --check: PASS.
- Independent review: UNAVAILABLE; reviewer dispatch failed with local a6api HTTP 404 for /v1/responses. Author self-review found no Critical or Important findings.

## Version 1.1.6 delivery evidence

- PR #20 merged as 4e77c8a; primary master synchronized.
- Version metadata 1.1.6; Runtime 165/165, Desktop 158/158 and build passed before packaging.
- GitHub v1.1.6 tag/assets verified; remote digests match the local release manifest.
- Desktop Portable 1.1.6 source/target hash matched 4ad3574f3240d5cb8a25fac4c4f62569a7bc34e4b0ebdbe5acdee44e88a4a8f6, size 115024111 bytes, and isolated Desktop-path smoke returned Local Control/Gateway health ok.
