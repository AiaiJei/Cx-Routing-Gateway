# Revision4 client diagnostics and official login compatibility

Date: 2026-11-26 (Asia/Shanghai). Project `cx-routing-gateway`, repo `aiaijei-cx-routing-gateway`, task `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`, contract revision4.

## Scope

Task3 changes only `apps/desktop/electron/codex-client-manager.cjs`, `tests/runtime/codex-client-manager.test.mjs`, `apps/desktop/src/data/codex-login.ts`, `apps/desktop/src/data/codex-login.test.tsx` and this evidence. Hook/test ownership was confirmed with the UI worker before edits. Other workers' changes are preserved. Source and fixtures remain in `C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125`, branch `codex/codex-route-management-20261125`; no commit/push/merge/release.

The Owner screenshot's unknown-version symptom was reproduced with a fake warning prefix before the exact version line: previous whole-output matching returned no version. The parser now accepts exactly one complete `codex-cli <bounded semantic version>` line among bounded output lines. Arbitrary embedded tokens, suffixed private text, nonzero exit and two version declarations (same or different versions) remain unknown. Original stdout/stderr is never returned or logged. Existing output/time limits and availability/auth semantics remain unchanged.

Native login and the React login hook now require saved `mode: direct` and `direct.kind: official`. Gateway, unknown, custom and snapshot selections do not start official login. Native code still validates the exact expected config revision before discovery and rechecks revision/kind immediately before spawning. A regression test also rejects a changed direct kind when a faulty adapter reused the revision. Authentication does not determine provider mode; this hook is auxiliary and does not own profile creation/import/save/apply actions.

Public API/error codes remain unchanged: `createCodexClientManager({codexHome,resolveExecutable?,spawnImpl?,getConfigStatus})`, async `getStatus/startLogin/cancelLogin` and synchronous `dispose`. Returned status remains `{available,version?,auth,login}` with approved enums. Safe errors remain `CODEX_INPUT_INVALID`, `CODEX_CONFIG_CHANGED`, `CODEX_LOGIN_MODE_REQUIRED`, `CODEX_CLI_NOT_FOUND`, `CODEX_LOGIN_PENDING`, `CODEX_LOGIN_FAILED`, `CODEX_CLIENT_DISPOSED`. Native/UI workers were notified.

## Test-first evidence and current checks

- RED: native focused suite after revision4 fixture/tests migration failed13/20; exact warning-prefix test observed `undefined` instead of `0.167.0`, and old official-only gate rejected newly approved direct official mode. GREEN after minimal parser/gate change20/20.
- RED: hook suite5/5 failed against the migrated direct official fixture because old hook checked `mode: official`. GREEN after hook gate change5/5.
- Added direct-kind recheck regression; final native focused21/21 PASS, no failures/cancelled/skipped.
- `node --test tests/runtime/codex-client-manager.test.mjs`: PASS21/21.
- `npm test -- src/data/codex-login.test.tsx` from `apps/desktop`: PASS5/5.
- `node --check apps/desktop/electron/codex-client-manager.cjs`: PASS, exit0.

All child processes are fake test doubles. Filesystem discovery creates inert files only beneath `.tmp/codex-direct-management-20261126/`; none is executed. No actual CLI/version/status/login, real account/auth/config access or provider/model request was performed by this worker. Installed-client login/provider acceptance: `NOT_RUN`. Full revision build/runtime/UI validation and independent review are coordinator-owned and not claimed by these focused results.

## Freeze

SHA-256:

- `apps/desktop/electron/codex-client-manager.cjs`: `42C73972D3A59256BEDCB41A94822EC37316F73D0BFBD61C5135510454115C4B`
- `tests/runtime/codex-client-manager.test.mjs`: `F52724BCE413ABBFA400E913D1D8675B6D2FFEF81B87068E79120D66B8B9BDDA`
- `apps/desktop/src/data/codex-login.ts`: `E85B4BCB5EB78CF4B35737B72650D13DF2E98F41988F4DF20F8B9A95EFA4E43E`
- `apps/desktop/src/data/codex-login.test.tsx`: `861E376897D7955EA0F65864D88D51CFA53505C77F148AFE10B966B8DC0EABA4`

Current stage: implementation/focused verification complete, frozen for independent review. Availability: simulated local contract behavior PASS; real installed-client behavior not verified. Next: coordinator integrates the new direct status types and completes independent whole-revision validation; Owner later verifies actual account/provider behavior.

`git rev-parse --show-toplevel`, AGENTS, project identity and active revision4 task were checked. All five paths are within explicit contract scope. AWG `scope_check` again returned `PROJECT_ROOT_MISMATCH` because the host MCP binds the primary repository, not this authorized task worktree. Actual edits/tests used apply_patch/terminal and are not represented as AWG-validated. Rollback remains limited to these task-owned source changes under a separately authorized integration operation; no user data or old binaries were changed.

## Native integration addendum

Coordinator requested a native-private synchronous `getLoginState(): 'idle'|'pending'|'succeeded'|'failed'` accessor so config apply/restore can reject while login is pending without running a status probe or awaiting its timeout. Added only this cached accessor and assertions in the existing fake-child lifecycle test: idle before start, pending after start, idle after cancel, with no extra process calls. No new IPC/renderer API or error code. Native worker notified of `isLoginPending: () => codexClientManager?.getLoginState() === 'pending'` composition.

Test-first: targeted lifecycle test RED with missing accessor; full focused suite GREEN21/21 after the one-line implementation. `node --check apps/desktop/electron/codex-client-manager.cjs` PASS. No actual CLI/status/login/auth/provider operation, no Git integration. Scope remains unchanged and frozen for independent review.

Updated native freeze SHA-256 (supersedes the first two hashes above; hook hashes unchanged):

- `apps/desktop/electron/codex-client-manager.cjs`: `7747EBE80C1612C767283B21EE38E45DD538DCD16DEE777601ADAB4E7853D9D8`
- `tests/runtime/codex-client-manager.test.mjs`: `541524DF8AAD99C24495CB46CAC51BE76F33321683F88F3A8815B7A8F07B9A88`
