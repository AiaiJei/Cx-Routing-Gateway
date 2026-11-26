# Codex Gateway draft memory and credential selection UI — revision 5

Implemented locally on 2026-11-26 against the revision-5 approved specification. This worker changed only Codex frontend/domain/window/styles and tests, plus this report. Native/control/protocol files and package/version settings remain owned by the other workers/coordinator.

## Delivered behavior

- Nonsecret Gateway draft persists selected route IDs, selected default and credential source/ID. It does not auto-apply Codex configuration. Existing draft takes priority over active config; initial managed catalogue is only a fallback when no draft exists. Direct mode changes and restore do not erase remembered Gateway choices.
- A dedicated preferences hook reads through the fixed native API, debounces local edits for 400 ms and serializes revision-checked writes. A bridge-owned operation queue orders a page's pending unmount flush before the next page instance reads. If navigation happens before the first revision read completes, the queued read also flushes its latest edit before the next instance proceeds. StrictMode cleanup/read replay and late hydration do not overwrite user edits.
- Only route/default/source/ID values are constructed for persistence. Manual Key plaintext never enters preference calls or browser storage. Manual source is remembered, but its password input is empty after remount and must be entered again.
- Draft status distinguishes reading, changed/waiting, saving, remembered-but-unapplied and failed. Corrupt/invalid memory is reported safely and never overwritten. Save conflicts stop optimistic writes until a fresh read; retry retains current edited choices. Invalid/deleted/disabled route IDs stay visible for repair rather than silently selecting another model.
- The credential dropdown lists native metadata only: name, scope, current marker, enabled/revoked and whether encrypted raw material is available. Sources are current Codex Gateway token, stored credential ID, and manual Key. Stored selection sends only credentialId; manual sends only clientKey; current omits both. Native code resolves and validates all selected aliases.
- Legacy hash-only credentials are labelled unavailable and require the explicit masked 补录原 Key / 保存原 Key action. Explicit 读取当前配置凭证 retains a natively matched managed token without returning its plaintext. Wrong/revoked/missing/scope-limited records yield safe repair guidance; there is no automatic rotation.
- Newly created Keys use the existing client-key API, refresh the native metadata list and select the returned encrypted credential ID; the transient raw string is cleared. If list refresh fails after creation, the UI truthfully reports creation succeeded but metadata still needs refresh, keeping configuration activation blocked until the selected ID is validated.
- Gateway scope is prominent in the panel and repeated in activation confirmation: current user, actual resolved config path, only Codex CLI/Desktop using this CODEX_HOME, not system-wide or project configuration. Existing sessions/restart and profile/startup override caveats remain visible.
- No independent RG reasoning selector was added. Help explains choosing reasoning in Codex and forwarding the value to the upstream, whose support is not assumed. Native catalogue/protocol effort changes are separate worker evidence.
- Direct profiles/mode browsing and the prior form submission/preview/restore protections remain intact. Added only the configScope fixture field to codex-login.test.tsx, with no login hook behavior edit.

## Verification

1. Wrote preferences lifecycle tests before its module existed. First run reported the missing module (expected scaffold failure, not counted as a passing behavioral gate). Then revision-5 page tests ran against the old operational page: **RED 7/7 failed**, matching absent remembered choices and credential dropdown/scope flow.
2. Initial implementation passed 12 focused memory/page checks. Extended race/error tests cover serialized in-flight saves, optimistic revision conflicts, corruption, manual-source redaction, StrictMode, page remount, direct/Gateway view changes and invalid route retention.
3. A new early-edit/navigation regression was **RED 1 failed / 7 passed**: edits made before the initial revision read were lost when the page unmounted. Fixed by completing the old instance's pending edit inside its bridge-queued initial read before the next instance reads. Preferences suite then **PASS 8/8**.
4. Final memory-specific covering run before the last added stale-flush scenario: **PASS 3 files / 19 tests**. Added a model-edit-during-memory-flush scenario verifying the stale activation preview is cancelled, with no native preview/apply call.
5. Final `npm --prefix apps/desktop test`: **PASS 32 files / 265 tests**, zero failures and no reported test warnings. Existing revision-4 page/config/login regressions also passed in a focused 36-test run during implementation.
6. `npm --prefix apps/desktop run build`: **PASS TypeScript and Vite**, 96 modules. `git diff --check` scoped to owned Codex frontend files: **PASS**.
7. Final display-only credential label adds 当前使用 to the matched native row after the build; coordinator owns the final production build/browser/package verification.

## Boundaries

- Tests use native-method fixtures for persistence and credentials. Actual disk binding/restart/CAS/vault integrity, Control API key retention and protocol forwarding are established by the native/control/protocol workers and coordinator, not UI mocks.
- No actual user Codex config/authentication files, live provider calls, account login or user runtime secret values were accessed by this worker. No secrets were written to source/evidence.
- Browser widths/keyboard, actual Electron remembered choices and existing-Key dropdown, local restart and independent UI review remain coordinator checks. This report does not infer those results from component tests.
- No commits, pushes, merges, releases, installed executable replacement or subagent dispatch. Terminal/apply_patch operations are outside AWG enforcement; the parent established task contract/scope.

## Independent UI review fix — complete queue drain, first-use seed and current credential refresh

- Important queue finding reproduced: save A was in flight, edit B became pending, then the old page unmounted and a new page mounted. Enqueuing each individual write let the new read run between A and B, so its draft/revision were stale and a later C conflicted. The complete flush/drain loop now owns one bridge queue reservation, including every latest edit arriving during that drain. The next mount reads only after the old drain finishes.
- Important first-use finding reproduced: an active Gateway catalogue seeded only rendered draft state, so switching to direct and remounting without editing lost it. Missing-memory active Gateway fallback is now persisted once inside the queued load. If native status arrives later, that first-use seed becomes pending and flushes immediately. Direct activation also awaits pending draft flush before changing configuration; this writes only nonsecret preferences and never auto-applies Codex config.
- Minor metadata finding reproduced: apply/restore and header refresh did not update current credential matching. Successful apply/restore now refresh profiles and credential metadata; the header refresh does likewise. A failed credential refresh clears stale current metadata and exposes a safe error, so a previous currentCredentialId cannot drive the explicit retain-current action.
- Added four regressions before the fixes. `npm --prefix apps/desktop test -- src/data/codex-gateway-preferences.test.tsx src/pages/CodexPage.memory.test.tsx`: **RED 4 failed / 18 passed**, matching stale A hydration, missing untouched fallback persistence and missing apply/restore credential refresh.
- After fixes the same covering run was **PASS 22/22**. Added one late-status first-use seed test, proving exactly one preference write and direct-mode remount recovery. The A/B/remount test also performs a later C and asserts its expected revision is B's completed revision, with no conflict.
- Final full `npm --prefix apps/desktop test`: **PASS 32 files / 270 tests**, zero failures. `./node_modules/.bin/tsc -b`: **PASS** after correcting the nullable initial prop type in the late-status test. Scoped frontend `git diff --check`: **PASS**.
- Changed only preferences/credential hooks, the configuration hook's pre-switch flush, page refresh callbacks, their tests and this report. No Vite build/dist or native/control/protocol/package changes were made for this fix batch. Source frozen for scoped re-review; no commit/push.

## Scoped re-review — repeated flush awaits active write

- Added a regression starting a deferred native save with no later pending edit, then calling flush again. Before the fix it was **RED 1 failed / 11 passed** because the second flush resolved before the active save.
- Moved the existing-writing promise check before the no-pending/revision guards. Every caller now awaits the active drain even after it has consumed pending.current.
- `npm --prefix apps/desktop test -- src/data/codex-gateway-preferences.test.tsx`: **PASS 12/12**. `./node_modules/.bin/tsc -b` and scoped `git diff --check`: **PASS**.
- Only this two-line guard ordering, its focused regression and this report changed. No Vite/dist rebuild or unrelated writes; source frozen for the small scoped recheck.
