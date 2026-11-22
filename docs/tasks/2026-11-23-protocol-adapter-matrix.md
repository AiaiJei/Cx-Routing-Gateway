# Six-Direction Protocol Adapter Matrix

- Task: CXRG-PROTOCOL-ADAPTER-MATRIX-2026-11-23
- Repository: AiaiJei/Cx-Routing-Gateway
- Base: master at 5c24c114deb09fb4602f5f98bda9ea48299d44cb
- Branch/worktree: codex/protocol-adapter-matrix / .worktree/protocol-adapter-matrix
- Status: implementation and local verification complete; dedicated PR pending.

## Delivered

- Added a normalized Res/Mes/Chat adapter module for request parsing, target serialization, response parsing, response serialization and stream event conversion.
- Completed all six off-diagonal directions: Res→Chat, Res→Mes, Mes→Res, Mes→Chat, Chat→Res and Chat→Mes.
- Codex-style tool definitions, tool_choice auto/required/specific, tool results, JSON schema/object output where representable, token ceilings and refusal text are preserved.
- Unsupported n>1, logprobs, multimodal content and target-inexpressible fields return safe field/direction metadata instead of a generic or silent drop.
- Streaming text, tool starts, argument deltas, parallel indexes and terminal events use the same normalized event contract; Native-Forward diagonal paths remain unchanged.
- Removed the duplicated legacy conversion helpers from Gateway request/response paths; route tests now use the shared response adapter.

## Verification

- Adapter unit matrix: 10/10 passed.
- Gateway focused six-direction and Codex structured/tool tests passed.
- Gateway full suite: 43/43 passed.
- Runtime full suite: 165/165 passed.
- Desktop full suite: 158/158 across 23 files.
- Desktop production build: TypeScript and Vite passed.
- Syntax checks for changed ES/CommonJS files and git diff --check passed.
- No real provider request was made; all upstreams were local HTTP fixtures.

## Limits

- Native provider-specific semantics beyond the declared profile are not inferred; unsupported fields return an explicit field/direction error.
- Independent review and GitHub CI are pending until the branch is pushed and the dedicated PR is created.

## Implementation result

- Added protocol-adapters.mjs and moved Gateway request/response conversion to a normalized Res/Mes/Chat contract.
- Six off-diagonal directions and Native-Forward diagonal behavior pass local fixtures. Codex tool_choice, function tools, tool results, JSON schema/object format and field-specific unsupported errors are covered.
- Stream adapter preserves text, tool starts, argument fragments, parallel indexes and terminal finish reasons across existing direction tests.
- Independent reviewer dispatch was unavailable because the local a6api proxy returned HTTP 404 for the reviewer /v1/responses endpoint; author self-review found no Critical or Important findings.
