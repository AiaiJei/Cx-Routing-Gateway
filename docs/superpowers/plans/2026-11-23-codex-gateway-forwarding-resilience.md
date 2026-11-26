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
- [x] Commit only this task's authorized files, push `codex/codex-routing-forwarding`, and create dedicated PR #22 against `master` with verification/limitations; leave it open and do not merge or release.

## Self-Check Acceptance Checklist

- [x] The concrete tool type in the historical `d586f573-528d-4904-a2fe-636462e82f5c` log is still described as unknown; no unsupported inference is presented as confirmed fact.
- [x] `tool_search` definitions are converted to client-executable Chat functions with the required query schema; returned call IDs, arguments, and client execution semantics survive responses and streams.
- [x] `tool_search_call`, `tool_search_output`, `additional_tools`, and dynamically loaded namespace/function/custom definitions are handled as structured tool history, not null-content or ordinary user text.
- [x] Unsupported server-side built-ins remain explicit safe errors; diagnostics reveal no tool name, schema, prompt, argument, or credential.
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
- [x] Exactly one dedicated PR (#22) targets `master` and remains open; merge, release, real-provider validation, and Owner acceptance remain separately tracked.

## Rollback

Revert only this task's PR commits. Preserve PR #21 and release v1.1.7, primary `master`, the existing task worktree, and unrelated user files. Do not merge, release, or delete the branch/worktree as part of rollback.

## Follow-up plan: local 1.1.8 test build (2026-11-24)

### Scope and boundary

- Baseline: Desktop product/package/build version 1.1.7; increment the patch number once to 1.1.8.
- Work only in `.worktree/codex-codex-routing-forwarding` on `codex/codex-routing-forwarding`.
- Update package/lockfile, electron-builder metadata, release-verifier expectation, and version-bound Settings/release tests.
- Build a distinct Windows x64 Portable under `apps/desktop/release/1.1.8-codex-forwarding-local-test/`; run isolated smoke and copy it as `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.8.exe`.
- Preserve the existing 1.1.7 Portable and its currently running process. No provider requests by Codex, no commit/push of this revision, no public release, no PR merge, and no primary-worktree synchronization before Owner feedback.

### Sequence and acceptance checklist

- [x] Confirm active contract revision, clean PR worktree, version baseline, existing process, and both output destinations; stop on any path collision.
- [x] Bump only the product/package/build version 1.1.7 → 1.1.8; align lockfile, release verifier, and fixed-version test expectations.
- [x] Run focused Settings/release-manifest tests (13/13 and 2/2), full Runtime/Desktop suites (218/218 and 196/196), TypeScript/Vite build, and metadata consistency checks.
- [x] Produce an x64 unpacked app and local Portable in the isolated task output; packaged version smoke and isolated Local Control/Gateway health smoke pass.
- [x] Copy the verified Portable to the new versioned Desktop filename without overwriting 1.1.7; source/destination size and SHA-256 match.
- [x] Record commands, result counts, artifact path/hash, process-preservation state, and manual-test limitation in task evidence.
- [x] Leave changes uncommitted/unpushed and the existing PR open; wait for Owner's manual test and explicit integration decision.
- [ ] Owner manually tests the local 1.1.8 Desktop build, then decides whether to commit/push this revision, update PR #22, merge, and sync the primary worktree.

### Rollback

Preserve v1.1.7 and its running process. If Owner rejects the test artifact, remove only the new 1.1.8 Desktop copy and task-specific local build output after confirming their exact paths. Do not merge, release, or modify the primary `master` worktree.

## Follow-up plan — Responses round trips through Chat and Messages (2026-11-24)

The Owner reproduced a 400 with CC Switch using RG and reported an empty result in Zcode. The work covers the RG request adapter and return path for Res → Chat → Res and Res → Mes → Res. The two client observations are tracked separately. The CC Switch 400 origin is unresolved.

1. Gateway implementer reproduces conversion defects using local HTTP/SSE fixtures with the existing routing and client-key path. The fixture verifies outbound endpoint, instructions, messages, supported tool choice and schemas, plus return events and request logs.
2. Reuse the existing adapter and shared Responses encoder. Verify text and tool arguments assemble from indexed events, JSON replies preserve both text and tools, and error/empty/truncated outcomes cannot masquerade as completed output. Keep the existing explicit rejection for unmappable server tools.
3. Run focused tests, full Runtime/Desktop suites, production build and read-only independent review. Build a separate 1.1.8 Portable candidate, validate packaged bytes and isolated health, and retain the preceding binaries for rollback.
4. Owner reruns both routes on the candidate. Record local fixture results, native health and Owner acceptance separately. PR integration remains pending the Owner's decision.

Rollback uses the preceding Portable. Keep test data isolated and preserve all preceding executables and worktree changes.

## Follow-up plan — streaming latency diagnostics (2026-11-24)

### Scope and boundaries

- The Owner reports the previous 1.1.8 round-trip candidate passed manual testing. PR integration remains undecided.
- Investigate the four supplied streaming request logs without asserting that protocol conversion caused the delay.
- Add only numeric metadata to streamed request logs: `upstreamHeadersMs` (request start to response headers), `upstreamFirstByteMs` (request start to first body chunk), `upstreamBodyMs` (first body chunk to stream termination, including failure), `upstreamChunkCount` (body-reader chunks, not SSE events), and `gatewayProcessingMs` (cumulative synchronous stream parsing/conversion/write work).
- Preserve the existing `firstTokenMs` semantics. Never persist prompts, response text, SSE frames, tool data, or credentials.
- Surface these metrics in the existing request-details modal; missing fields on older records remain optional.
- Use local paced SSE fixtures only. No real provider calls, reasoning-parameter mapping, protocol behavior change, version bump, package build, or Desktop executable replacement is authorized by this revision.

### Files and responsibilities

- Modify `services/gateway/src/request-metrics.mjs` to track bounded numeric phase values and cumulative synchronous processing time.
- Modify `services/gateway/src/server.mjs` to mark response headers and measure existing native/converted stream handling without changing event order or backpressure behavior.
- Extend `tests/runtime/gateway-server.test.mjs` and `tests/runtime/request-logs.test.mjs` with a paced local SSE response, stage-boundary assertions, and a no-body-retention assertion.
- Extend `apps/desktop/src/domain/types.ts` and `apps/desktop/src/data/workspace-client.ts` to admit only finite numeric stage values.
- Extend `apps/desktop/src/pages/LogsPage.tsx` and `apps/desktop/src/pages/LogsPage.test.tsx` to display phase values in the existing details modal while preserving older-record rendering.
- Append fresh verification evidence here and in the task evidence file.

### Sequence, evidence, and acceptance

- [x] Update the task contract with Owner acceptance of the previous test and this bounded diagnostic revision.
- [x] Add a failing Gateway fixture that delays response headers, first body bytes, and later SSE chunks independently; confirm stage data is currently absent.
- [x] Add the minimal stage timer hooks; rerun the fixture and confirm the expected order, finite values, and that body timing captures the deliberately paced stream while synchronous Gateway processing remains separately measured.
- [x] Assert the stored usage record contains no prompt marker, response marker, raw frame, or credential.
- [x] Add a Desktop mapping/render test for present timing fields and backward compatibility when fields are absent.
- [x] Run focused tests, full Runtime and Desktop suites, Desktop build, syntax/JSON checks, and a whitespace-aware diff check. Review the final diff for changed timing semantics and accidental payload logging.
- [x] Record real-provider validation as NOT_RUN and Owner rerun as pending. Do not build/replace an executable, commit, push, merge, release, or synchronize `master`.
- [ ] Obtain independent read-only review of revision 3. Two review dispatches failed before review because the CC Switch local proxy returned HTTP 404 `route_not_found` and HTTP 400 `unsupported_feature` for their Codex `/responses` calls; neither produced a code verdict.

### Revision 3 verification outcome

- A local paced Res → Chat SSE fixture separately delays upstream response headers, the first body chunk, and later chunks. RED failed because timing fields were absent; GREEN records finite stage values and positive synchronous processing time without changing the converted event order.
- A final-EOF timing edit briefly put a stream metric reference in the non-stream JSON reader; Runtime tests caught it immediately. The reference was moved to the converted-stream reader, and both direct-route and full Runtime suites passed afterward.
- Request-log storage and the Desktop adapter retain only finite non-negative numeric values; safe integer validation is applied to the body chunk count. Legacy rows remain readable with `—` for absent measurements.
- The current Desktop executable was not rebuilt or replaced. Owner same-model/same-input A/B comparison against a new diagnostic-enabled local candidate remains pending and requires a separate build authorization.

### Roles and rollback

- Codex: implement the authorized local instrumentation and tests; no third-party model request.
- Owner: if desired after code review, run a same-model/same-input client comparison on the local build and report request IDs; that live comparison is separate from fixture evidence.
- Roll back only this revision's metric fields, mapping, modal rows, tests, and appended evidence. Preserve all pre-existing dirty changes, the running 1.1.8 Portable, its data, and all other worktrees.


### Revision 4: PR #22 integration and GitHub v1.1.8 publication

Date: 2026-11-24. The Owner explicitly authorized committing and pushing the already manually accepted 1.1.8 round-trip work and locally fixture-verified timing diagnostics, updating and merging PR #22, synchronizing the primary master worktree, and publishing the next GitHub release. The current GitHub latest release/tag was checked live as v1.1.7; the task worktree metadata is 1.1.8, so this release uses v1.1.8. Preserve the existing 1.1.7 and 1.1.8 Desktop executables/processes and all worktrees. No live provider calls are authorized.

- [x] Confirm the active task worktree is .worktree/codex-codex-routing-forwarding, its branch is codex/codex-routing-forwarding, and the primary tree is master at the PR base; preserve primary-tree untracked governance directories.
- [x] Refresh local verification before integration: Runtime 232/232, Desktop 197/197, and Desktop production build pass.
- [x] Commit 8b75677 and push the task-scoped changes to PR #22; updated-head Runtime and Desktop checks passed for push and pull_request runs (package jobs are skipped for branch events).
- [ ] Merge PR #22 without deleting the branch; fast-forward the primary master worktree and verify its state.
- [x] Build NSIS and x64 Portable assets in a new, unique release-output directory; verify manifest hashes, unpacked version 1.1.8, and isolated packaged/Portable health smokes.
- [ ] Publish GitHub v1.1.8 only after verification; preserve prior releases and local Desktop files.
- Independent review for revision 2 and revision 3 remains BLOCKED by the CC Switch proxy (HTTP 400 and HTTP 404/400 before review); no verdict was returned for either revision. Earlier independent reviews cover the original forwarding changes only. At the Owner's explicit direction, integration proceeds with this limitation disclosed; it is not represented as a PASS.
