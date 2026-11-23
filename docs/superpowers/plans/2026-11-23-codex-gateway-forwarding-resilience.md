### Task 6: Full verification, independent review, and open PR

**Files:**
- Update: `docs/tasks/2026-11-23-codex-gateway-forwarding-resilience-contract.json`
- Update: `.codex/awg-task.json`
- Create/update: `docs/tasks/evidence/codex-gateway-forwarding-resilience/`
- Update: `docs/superpowers/specs/2026-11-23-codex-gateway-forwarding-resilience-design.md`
- Update: this plan

- [x] Run `node --check services/gateway/src/protocol-adapters.mjs`, `node --check services/gateway/src/server.mjs`, and `git diff --check`.
- [x] Run the complete Runtime suite with `npm test` (218/218, 0 failures).
- [x] Run the complete Desktop suite with `npm --prefix apps/desktop test` (196/196, 0 failures).
- [x] Run the Desktop production build with `npm --prefix apps/desktop run build` (TypeScript and Vite build pass).
- [x] Review the full diff for scope, safe logging, no retries, correct worktree, no version change, and no config/auth-file access; dependency manifests and lockfiles are unchanged.
- [x] Obtain independent review of adapter/history semantics, stream sequencing/status boundaries, and Desktop navigation/log UX; resolve backend boundary findings and rerun affected tests. The final backend re-review found no remaining Critical/Important issues; provider behavior remains outside its scope.
- [x] Save fresh command/output summaries and the completed checklist under `docs/tasks/evidence/codex-gateway-forwarding-resilience/`; label real provider validation and Owner in-product acceptance `NOT_RUN`.
- [ ] Commit only this task's authorized files, push the verified task branch `codex/codex-routing-forwarding`, and create one PR against `master` with a verification/limitations summary; leave it open and do not merge or release.

## Self-Check Acceptance Checklist

- [x] The concrete tool type in the historical `d586f573-528d-4904-a2fe-636462e82f5c` log is still described as unknown; no unsupported inference is presented as confirmed fact.
- [x] `tool_search` definitions are converted to client-executable Chat functions with the required query schema; returned call IDs, arguments, and client execution semantics survive responses and streams.
- [x] `tool_search_call`, `tool_search_output`, `additional_tools`, and dynamically loaded namespace/function/custom definitions are handled as structured tool history, not null-content or ordinary user text.
- [ ] Unsupported server-side built-ins remain explicit safe errors; diagnostics reveal no tool name, schema, prompt, argument, or credential.
- [x] A pre-header reset is a sanitized HTTP 502; a post-header Responses reset is a terminal SSE error with a monotonic sequence number and a clean stream end where possible.
- [x] Native Responses passthrough withholds completion until clean EOF; missing/failure terminal markers, invalid sequence progression, and sequence exhaustion cannot be logged as success.
- [x] If the first validated address cannot establish TCP but a later approved address is reachable, only the pre-send connection attempt advances to the later address; exactly one model request reaches the healthy local fixture.
- [x] Address attempts do not reuse pooled sockets outside the current approved DNS snapshot; malformed upstream HTTP statuses are sanitized safely.
- [x] Failure logs distinguish actual upstream HTTP status, actual downstream HTTP status, and a finite failure phase; partial output remains failed.
- [x] A reset never triggers an ambiguous automatic retry; local fixtures prove one upstream attempt and do not contact third-party providers.
- [x] Downstream cancellation is not counted as an upstream failure, and credential-use bookkeeping failures cannot replace a valid response or duplicate terminal logs.
- [x] Request logs do not contain request/response bodies, prompt markers, schemas, provider bodies, or credentials.
- [x] Desktop logs accurately explain interruption and status details; older log records still render.
- [x] The Codex placeholder is clearly non-operational, links to existing route/upstream/client-credential management, and does not read or write Codex config/auth files.
- [x] Runtime tests (218/218), Desktop tests (196/196), Desktop build, focused Gateway regressions (6/6), Gateway suite (68/68), syntax/diff checks, and independent reviews pass with evidence.
- [ ] Exactly one dedicated PR targets `master` and remains open; merge, release, real-provider validation, and Owner acceptance remain separately tracked.

## Rollback

Revert only this task's PR commits. Preserve PR #21 and release v1.1.7, primary `master`, the existing task worktree, and unrelated user files. Do not merge, release, or delete the branch/worktree as part of rollback.
