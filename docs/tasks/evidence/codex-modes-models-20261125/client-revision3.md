# Revision3 official Codex client adapter

Date: 2026-11-26 (Asia/Shanghai). Task: `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`, contract revision3, project `cx-routing-gateway`, repository `aiaijei-cx-routing-gateway`.

## Scope and current state

Task2 implementation is ready for independent review. Only the new `apps/desktop/electron/codex-client-manager.cjs`, `tests/runtime/codex-client-manager.test.mjs` and this evidence file are owned by this worker. Native IPC/main/preload integration belongs to the native worker. No existing changes were reverted. Worktree: `C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125`, branch `codex/codex-route-management-20261125`. These changes are uncommitted/unpushed; primary branch and PR25 are not updated by this worker.

The adapter uses the approved design and plan. It does not read/write authentication files, implement OAuth, store multiple accounts or perform logout. Official Codex owns its sign-in when an end user confirms the action. End-user login may update Codex's existing account, as disclosed in the UI confirmation owned by Task3. Browser launch itself is not observed or claimed: starting the CLI returns `auth: unknown, login: pending`; account classification requires a separate parsed `login status` result. If the official client chooses a different flow or cannot open a browser, the app must retain honest pending/failure/unknown states and the user can sign in manually in official Codex.

## Interface

`createCodexClientManager({codexHome,resolveExecutable?,spawnImpl?,getConfigStatus})` returns async `getStatus()`, `startLogin({expectedRevision})`, `cancelLogin()` and synchronous idempotent `dispose()`.

Returned status is limited to `{available:boolean,version?:string,auth:'chatgpt'|'api'|'signed_out'|'unknown',login:'idle'|'pending'|'succeeded'|'failed'}`. A successful login process exit records `succeeded`; it does not invent account state. Subsequent status classification can still be `signed_out` or `unknown`.

Safe error codes: `CODEX_INPUT_INVALID`, `CODEX_CONFIG_CHANGED`, `CODEX_LOGIN_MODE_REQUIRED`, `CODEX_CLI_NOT_FOUND`, `CODEX_LOGIN_PENDING`, `CODEX_LOGIN_FAILED`, `CODEX_CLIENT_DISPOSED`. Existing typed config errors from `getConfigStatus` remain typed; unknown errors are replaced with a safe failure. Messages/IPC transport are maintained by the native worker.

Discovery tries `%LOCALAPPDATA%/Programs/OpenAI/Codex/bin/codex.exe`, then at most64 absolute local PATH directories from a PATH no larger than32KiB. Only ordinary `codex.exe` files qualify. Relative paths, UNC paths, `.cmd` wrappers and shell/PATHEXT discovery are excluded. `discoverCodexExecutable({env?})` is exported for isolated filesystem tests; it is not exposed to the renderer.

All child launches use fixed argument arrays, `shell:false`, hidden windows and the same absolute `CODEX_HOME` as the native config service. Inherited case variants of `CODEX_HOME` are removed before setting the fixed value. Status/version probes have a5s timeout and16KiB combined stdout/stderr limit. Only recognized enums and strict version strings escape the module. Login uses `['login']` with all stdio ignored, a5min lifetime and a1s owned-child kill escalation. Login is reserved before asynchronous preflight; mode/revision is re-read after discovery immediately before spawn. Cancellation retains the reservation until the old child closes, preventing retry overlap. Only children created by this manager are terminated.

## Verification

Test-first observations:

- Initial missing adapter: RED1/1, expected missing factory behavior.
- Status/discovery implementation: RED5/6, then GREEN6/6.
- Login implementation: RED7/13, then GREEN13/13.
- Unlaunchable executable, Windows home casing and stale status race: RED3/17, then GREEN17/17.
- Cancel/retry overlap regression: RED1/18, then GREEN18/18.

Fresh final commands:

- `node --test tests/runtime/codex-client-manager.test.mjs`: PASS18/18, zero failures/cancelled/skipped.
- `node --check apps/desktop/electron/codex-client-manager.cjs`: PASS, exit0.
- `git diff --check -- apps/desktop/electron/codex-client-manager.cjs tests/runtime/codex-client-manager.test.mjs`: PASS, exit0 (new files are untracked; syntax and behavior checks above are the direct checks).

Tests use fake EventEmitter/stream child processes only. Discovery tests create inert fake executable files under worktree `.tmp/codex-modes-models-20261125/`; they never execute those files. No actual Codex CLI process, real `login status`, login flow, user config/auth access or provider/model request was invoked by this worker. Real installed-client login/browser behavior: `NOT_RUN`. Full revision integration/build/browser checks and independent review: coordinator responsibility, `NOT_RUN` in this Task2 record. Owner acceptance: `NOT_RUN`.

Freeze SHA-256:

- `apps/desktop/electron/codex-client-manager.cjs`: `F338CA9609D732D05FA06EE73CAEB982BB8C628171ACACD2488480DAA8446105`
- `tests/runtime/codex-client-manager.test.mjs`: `DAAC742AE1CA27567CE6E5A69C76B5F5B059B7E2E7C1F42846BC4C09BCA9F26C`

## Governance and next step

`git rev-parse --show-toplevel` confirmed the exact task worktree. Local AGENTS, project identity and both revision3 contract files were read and matched the three allowed paths. AWG `scope_check` was attempted for all three paths, but its host binding is the primary repository and returned `PROJECT_ROOT_MISMATCH`. Consequently reads/writes/tests used terminal/apply_patch under the explicit task contract, without AWG tool validation; this is not represented as an AWG PASS.

Next: coordinator obtains independent review, integrates this factory through native IPC and verifies the whole revision. Rollback is to stop wiring/use of these new files and restore only task-owned changes in a separately authorized operation; no backup, branch, worktree or user data was deleted here.
