# Verification Evidence

Task: `CXRG-UPSTREAM-EDIT-FAILOVER-2026-11-22`
Date: 2026-11-22
Branch: `codex/upstream-service-edit`
Base: `75716847b8e308f53ae0a3284f74241373ea2aa4`

## Commands and Results

| Command | Result |
| --- | --- |
| `node --test --test-name-pattern="restores primary priority" tests/runtime/gateway-server.test.mjs` repeated 5 times | 5/5 runs passed |
| `npm test` from repository root, after review fixes | 146 tests passed, 0 failed |
| `npm test` from `apps/desktop` | 23 test files passed; 158 tests passed |
| `npm run build` from `apps/desktop` | TypeScript and Vite production build passed |
| `node --check apps/desktop/electron/main.cjs` | Passed |
| `node --check apps/desktop/electron/preload.cjs` | Passed |
| `node --check apps/desktop/electron/upstream-edit-ipc.cjs` | Passed |
| Parse `docs/tasks/2026-11-22-upstream-edit-failover-contract.json` with `JSON.parse` | Passed |
| `git diff --check` | Passed |
| `node --test --test-name-pattern='merges a delayed blank-key edit' tests/runtime/control-server.test.mjs` repeated 5 times | 5/5 runs passed |

The fresh full test runs and build completed on 2026-11-22 in the task worktree after the review-driven fixes. The runtime suite passed 146/146 and the Desktop suite passed 158/158. The failover regression checks that three primary failures open the circuit, a held primary success restores primary selection, and the next request reaches primary with zero backup calls.

## Independent Review Fixes

Review found that an edit delayed in DNS validation could apply an old upstream snapshot after a concurrent key rotation, and then remove the newly active credential. The update now merges into the latest record inside the serialized store update and removes the credential reference captured from that exact latest record. The dedicated delayed-edit regression passed five consecutive runs. Review also identified empty Base URL acceptance and missing destination validation when revoking private-network trust; both now have focused regression coverage in the full runtime suite.

## Independent Review

- Reviewed range: `75716847b8e308f53ae0a3284f74241373ea2aa4..f7041b9`.
- Result: PASS; the reviewer confirmed all prior findings resolved and reported no Critical, Important, or Minor findings.
- The review was read-only and did not rerun tests. Test/build results above are from the fresh verification run in this worktree.

## Regression-Test Fixture Finding

The first complete runtime run exposed a timeout in the new concurrent regression test. The test numbered upstream handlers by arrival order but waited on client request promises by creation order; network scheduling can make those orders differ, causing the held success to be awaited with the three failures. The test now gives each request a unique body marker and releases responders by that marker. Five consecutive focused runs and the complete runtime suite passed after this correction. This was test synchronization only; no production behavior was changed to mask the timeout.

## Visual and External Checks

- Local Vite preview started on `http://127.0.0.1:4182/upstreams` after confirming port `4182` was free. The already-listening port `5173` belonged to an unrelated Cx-Agent worktree and was left untouched.
- A Chrome guest tab navigated to the local preview URL. Computer Use then stopped because it could not verify that the browser URL was allowed. Page contents and the edit dialog were therefore not visually inspected; this remains `NOT_RUN`.
- No real provider endpoint was contacted (`NOT_RUN`).
