# Gateway Timeout and Request Timing Design

## Intent

Create a dedicated PR to let long generations complete and make request-log timing easier to interpret. The supplied Gateway screenshot shows repeated failures near 30 seconds, while the implementation keeps a 30-second upstream timer active through the response body despite having a separate 120-second stream reader limit.

## Goals

- Allow up to 5 minutes for upstream response headers.
- Bound the complete Gateway request lifecycle to 10 minutes, including upstream response-body reads and streamed output.
- Use the same absolute request deadline for native streams, converted streams, and non-stream JSON responses.
- Keep incoming request-body receipt limited to 30 seconds.
- Measure elapsed durations with a monotonic clock while retaining wall-clock `createdAt` timestamps.
- Explain in the request-log UI that `首字` means first meaningful generated content observed by the Gateway, and `总耗时` spans Gateway request receipt through completion or failure.
- Raise the Desktop route-test caller deadline to 10 minutes plus a small response-processing margin.

## Non-goals and constraints

- Do not change protocol conversion, routing, retry/failover, authentication, request-body size, or usage-retention behavior.
- Do not persist request/response bodies, credentials, or additional provider data.
- Do not make real provider calls, publish a release, or merge the PR.
- Do not bump package/product versions for this focused fix.
- A provider SDK or downstream client can still impose its own timeout; this PR only controls Gateway and Desktop route-test limits.

## Approaches

1. **Selected: separate response-header and end-to-end limits.** Keep a finite 5-minute limit for waiting on upstream response headers, then enforce a 10-minute absolute deadline from Gateway request receipt across all response body paths. This preserves a bound for nonresponsive upstreams and prevents the existing 30-second timer from truncating streams.
2. Raise the current single upstream timeout to 10 minutes. This is smaller but makes the distinction between waiting for response headers and consuming a long response unclear, and allows a silent upstream to occupy a request slot for the full 10 minutes.
3. Keep timeouts unchanged and only document metric semantics. This addresses comparisons between different measurement boundaries but leaves the reproduced 30-second response cutoff.

## Design

`createGatewayServer` will own two explicit values: `upstreamHeaderTimeoutMs` (default 300,000) and `maxRequestDurationMs` (default 600,000). The request's absolute monotonic deadline begins when the Gateway accepts the HTTP request. `fetchWithTimeout` will clear its header timer once response headers arrive while retaining cancellation on client disconnect. The response body readers will stop at the shared request deadline, cancel upstream reads, and report the existing sanitized `upstream_timeout` / HTTP 504 failure contract. Native and converted stream readers will no longer enforce an independent 120-second deadline. Non-stream JSON reads will use the same deadline.

`durationMs` and stream `firstTokenMs` will use `performance.now()` deltas. `createdAt` remains a wall-clock ISO timestamp. The first-content detector keeps its existing protocol-aware rules: it excludes SSE control/lifecycle and usage frames, and can count text, refusal, reasoning, or tool-generation content. UI helper text or a tooltip will expose these definitions without changing stored data.

The route-test request uses the same non-stream Gateway path, so its local `AbortSignal.timeout` and timeout message will be aligned with the 10-minute Gateway bound. Incoming body parsing continues to have its separate 30-second timeout.

## Work ownership and dependencies

- Primary agent: Gateway runtime, request metrics, Desktop timing disclosure, focused regression tests, task evidence, branch verification, and dedicated PR.
- No new dependencies or schema migration.
- The inline executor runs a separate whole-branch review before PR creation, following the executing-plans skill. No per-task delegation is used.

## Evidence and acceptance

- Regression tests demonstrate that response headers are still bounded independently, a response body may outlive the former 30-second timer, and the shared 10-minute deadline stops native streams, converted streams, and JSON responses with a sanitized timeout record.
- Tests cover first-token and total-duration deltas under a wall-clock adjustment and verify UI timing definitions are accessible.
- Focused Runtime and Desktop tests, full Runtime and Desktop suites, TypeScript/Vite production build, and `git diff --check` pass.
- GitHub CI is inspected after pushing; provider, installer, release, Owner acceptance, and PR merge remain `NOT_RUN`/pending.
- PR targets `master` and remains open and unmerged.

## Baseline and screenshot interpretation

- In the supplied Gateway capture, one successful row shows 8,876 ms first content and 20,679 ms total; several failures show totals from 30,014–30,023 ms.
- The other timing capture shows first-content values around 1.27–1.66 seconds and totals around 7.80–50.27 seconds. No shared request ID is visible, so row-to-row correlation is unproven.
- Gateway `firstTokenMs` is measured from Gateway request receipt to a parsed meaningful generation event, not the first network byte or necessarily the first user-visible text token. Gateway `durationMs` includes Gateway work through the completed response or failure; other clients can use different start/stop boundaries.
- Focused baseline Runtime tests: 44/44 pass. Full baseline Runtime: 118/119; the only failure requires `apps/desktop/dist/index.html`, which is absent in a fresh worktree. Desktop dependencies are absent in this worktree, so its build/test baseline is `NOT_RUN` pending approved setup.

## Rollback

Revert only this task's PR commits. No stored-data migration is required because persisted timing fields retain their names and units. Keep the task branch and worktree; do not alter unrelated local branches or worktrees.
