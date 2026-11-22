# Upstream Credential and Routing Stability

- Task: `CXRG-UPSTREAM-CREDENTIAL-ROUTING-STABILITY-2026-11-23`
- Repository: `AiaiJei/Cx-Routing-Gateway`
- Base: `master` at `167d81cf8f1d9249c35b3cd827315ee4c7a6ef41`
- Branch/worktree: `codex/upstream-credential-routing-stability` / `.worktree/upstream-credential-routing-stability`
- Scope: persist the Desktop runtime master key across exits/restarts; keep request-level target binding; require an authenticated health probe before circuit cooldown failback.
- Status: implementation and verification complete; dedicated PR creation pending.

## Delivered

- Added `runtime-master-key.cjs` with versioned atomic writes, safeStorage encryption, legacy encrypted/plaintext reads, and fail-closed handling for corrupt existing files. `main.cjs` now uses the helper while retaining the stable `userData/runtime` data directory.
- Added a real supervisor stop/start regression. The same data directory and master key recover the encrypted upstream credential; the local fixture receives the original `Authorization` header after restart. The config contains only `credentialRef`; the vault file contains no plaintext key.
- Added Gateway health probing for cooled targets. Probes use approved DNS addresses, the configured upstream credential and a bounded timeout; probe promises are deduplicated per route target. Probe failure keeps traffic on backup and extends cooldown; only a successful probe restores preferred priority.
- Preserved the existing failure threshold, status classes, 60-second cooldown, route/target health isolation and no retry for the current failed request.

## Verification

- Focused master-key, supervisor and Gateway tests: 47/47 passed.
- Full Runtime suite: 153/153 passed.
- Full Desktop suite: 158/158 passed across 23 files.
- Desktop production build: TypeScript and Vite passed.
- `node --check apps/desktop/electron/main.cjs` and `node --check apps/desktop/electron/runtime-master-key.cjs` passed.
- Contract JSON parse and `git diff --check` passed.
- No real provider request was made; all upstream behavior used local HTTP fixtures.
- npm install reported 6 moderate audit findings and pending install-script approvals; no dependency version changes were introduced.

## Limits

- Native packaged Desktop quit/relaunch UI interaction was not run; the runtime supervisor integration exercises the same data directory, master key and service lifecycle boundary.
- GitHub CI and PR review are pending until the branch is pushed and the dedicated PR is created.
- Independent reviewer dispatch was unavailable twice: the local a6api proxy returned HTTP 404 for /v1/responses. Author self-review found no Critical or Important findings; this is recorded as unavailable independent review, not as an independent pass.

## Follow-up: reset error parsing

- Normalized low-level upstream connection resets (ECONNRESET, EPIPE, UND_ERR_SOCKET, and related causes) to the stable sanitized code upstream_connection_reset with HTTP 502.
- Desktop request-log mapping now renders 上游连接被重置，请检查上游服务或网络 instead of exposing a raw internal code such as ECONNRESET.
- Runtime suite after this follow-up: 154/154. Desktop suite: 158/158. Desktop build: PASS.

## Merge and same-version release

- PR #19 merged into master as ce77ce4733967afc71e6f8973cc5d8bc13e90c08; the primary worktree was synchronized to that commit. The task worktree and branch remain preserved.
- Package, product and build versions remain 1.1.5.
- GitHub v1.1.5 was refreshed in place. Its tag now points to ce77ce4 and the Setup, blockmap, Portable and manifest assets were replaced with artifacts built from the merged code.
- Release verifier, unpacked version smoke and explicit absolute-path Portable health smoke passed. The first Portable invocation used an unquoted multi-word path and failed with Windows code -4058; the explicit rerun passed Local Control and Gateway health checks.
- Final remote asset digests: Portable 6cb872606c45947876230fdfab710a6573e52ff13e75befac0aaebc7b1694ded; Setup deb3d162c546c8ce8be455d54425e4e0da0cf4f504cfe1ae20af28f8800223b9; blockmap 0e4f0b643d6d3fbf0a4aab5a2ad84d378e3b9fde25e3a79de973c7797d7841fa; manifest 0f41c198e1945fcc3391b3cdef755b39ed2289fcf761b0e83406b6c10d8532e5.
