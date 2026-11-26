# Codex direct management frontend — revision 4

Implemented locally on 2026-11-26 against docs/superpowers/specs/2026-11-26-codex-direct-management-design.md. No commits or pushes were performed by this worker.

## Final user flow

- The only top-level tabs are Codex 直连 and CX-RG 网关, above mode details and actual configuration status. They support arrow/Home/End keyboard navigation and browse only. 生效中 comes from saved native configuration, not the viewed tab or login state.
- Native current custom provider/name/endpoint/model/path is shown as direct, including the explicit current-config choice until imported. Unknown configuration displays 无法识别 and does not silently select official. Initial view follows native status unless the user already chose a view.
- Direct profiles include builtin 官方默认, imported native snapshots and editable Responses suppliers. Structured form validates name, HTTPS/loopback HTTP endpoint, one-per-line unique model list (1–100), selected default and credentials. Blank edit Key preserves native stored credentials. Saving updates the encrypted profile library only and explicitly reports 未启用.
- Explicit current-config import, new/edit/duplicate/delete operations use additive versioned native methods. Existing secrets never return from the library; raw input Keys stay in masked form fields and are omitted when blank. Snapshot profiles state read-only connection fields. Deletion has a confirmation and preserves live configuration; native active/last-direct safeguards remain authoritative.
- 启用所选直连方案 and 保存并启用网关 perform native preview then show a current-area confirmation containing provider, endpoint, default, model count and consequences, followed by apply and inline success/failure. No hidden configuration tab is mandatory. Missing selection/Key/workspace is reported at the visible action rather than silently ignored.
- Gateway retains multi-model search/select-all/clear/default/Key reuse/scoped creation. Config/recovery is a secondary expandable section. Existing reasoning fields remain absent from the UI and preserved by native configuration code.
- Official login is optional auxiliary UI under 官方默认. Login status probing, unknown/unavailable client state and profile CRUD do not block one another. An actual pending login shows a clear hint and prevents activation/restoration until completion/cancel; provider editing and tab viewing remain usable.
- Draft changes invalidate stale preview results. Mutation completion/error/finally uses an independent request identity. Profile list and config status load safely in StrictMode; a late read cannot overwrite user-selected profiles or a completed mutation. Profile save/delete errors appear inside their dialogs with inputs retained.

## Verification

1. Replaced revision-3 page expectations with 14 revision-4 flows, then ran `npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx` before production implementation: **RED 14/14 failed**, matching absent top-level direct semantics, profiles and inline activation.
2. Initial implementation run: **13/14 passed**. The remaining test found duplicate current-config radio choices after import; removed the pseudo-current row once the library reports the actual active imported profile.
3. Focused native-boundary/UI lifecycle coverage expanded to 19 page tests, 6 configuration-hook tests, 4 profile-library tests and 2 safe-client-boundary tests. `npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx src/data/codex-management.test.tsx src/data/codex-direct-profiles.test.tsx src/data/codex-client.test.ts`: **PASS 4 files / 31 tests**, zero failures.
4. Additional login hook checks owned by client worker: at the local combined run, `npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx src/data/codex-management.test.tsx src/data/codex-login.test.tsx`: **PASS 3 files / 25 tests**. Client module/hook revision-4 evidence is recorded separately by that worker.
5. `npm --prefix apps/desktop run build`: **PASS TypeScript and Vite**, 93 modules. Initial TypeScript checks identified an optional preview access and an inferred Promise<unknown> in a test double; corrected before this pass.
6. `npm --prefix apps/desktop test`: **PASS 28 files / 237 tests**, zero failures, no test warnings reported.
7. Owned frontend `git diff --check`: **PASS** after formatting the CSS and normalizing worker-added line endings. Formatter was invoked through npm exec from the public registry without modifying package manifests or adding a project dependency.
8. Final text-only cleanup changed the unavailable-model guidance from 官方直登 to Codex 直连 and the login-mode error to 官方默认直连方案. Coordinator owns the final build/browser/package pass after this cleanup.

## Scope and limits

- Files changed are Codex frontend components/page/hooks/domain/window declarations/styles. The separate codex-login.ts/tests remained exclusively owned by the client worker. No backend, package/version or unrelated local revision-2 source was edited by this worker.
- Unit tests use native-method doubles; actual encrypted storage, current-config capture/return projection, CLI catalogue/config parsing and real Electron UI are native/coordinator evidence, not established by these tests.
- Browser widths, real native supplier CRUD/activation roundtrip and independent UI review remain coordinator checks. Owner account login, provider traffic and actual user config/auth access are NOT_RUN by this worker.
- No global workspace changes, user-data access, Git integration, installed executable replacement or subagent dispatch was performed. All reads/edits/tests used terminal/apply_patch outside AWG enforcement; coordinator established the active contract.

## Native visual / independent UI review fixes

- Native 1224×765 observation found the activation action below long paths and several provider rows. Moved each mode's single primary action above its provider/model list, keeping selected-scheme/model-count context beside it. The action is not duplicated or overlaid on content.
- Important modal lifecycle finding: while native preview was pending, provider CRUD remained available and could open an editor before the preview confirmation returned. Provider CRUD is now disabled specifically during pending preview. Profile radio selection and mode-tab browsing remain available to invalidate/cancel that preview; no global login-probe lock was added.
- Important restored-status finding: successful restore updated native configuration status but did not reload profiles. A stale library active flag could then add a false second 生效中 and retain a stale delete lock. Configuration mutation now returns an explicit boolean success result. The confirmation invokes a profile refresh only after successful apply or restore, never after a failed/cancelled mutation.
- Profile row activity and active deletion lock now derive exclusively from the actual configuration status profile ID/official kind, not cached library active flags. Profile library changes also reread native configuration status so explicit import/edit can resolve the current projection to its new profile ID. A failed library refresh cannot make stale metadata override the current configuration header.
- Added four regressions before production fixes. `npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx`: **RED 4 failed / 19 passed** for primary action order, preview/editor overlap, missing restore refresh and stale activity after failed refresh.
- Added Gateway→direct restore coverage, confirmed failed activation does not refresh profile metadata, and updated the import test double to return the fresh native profile ID on its explicit status reread. Adjusted the initial-view assertion to wait for the status-derived tab effect instead of an earlier header paint.
- Final covering run `npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx src/data/codex-management.test.tsx src/data/codex-direct-profiles.test.tsx`: **PASS 3 files / 34 tests**, zero failures.
- Final full Desktop suite: **PASS 28 files / 242 tests**, zero failures. `./node_modules/.bin/tsc -b`: **PASS**. Owned scoped `git diff --check`: **PASS**.
- Added the allowlisted native CODEX_DIRECT_AUTH_UNSAFE explanation; arbitrary error text remains hidden.
- No Vite build was run for this final fix batch, preserving the coordinator's running native smoke dist. Coordinator owns the final production rebuild, native/screenshot recheck and package verification. Source is frozen for scoped review; no commit/push performed.

## Scoped re-review round 2 — duplicate profile submission

- Reproduced the Important finding: native library save completed before its awaited configuration-status reread. Parent library busy became false while the editor remained mounted and the original onSave promise remained pending, allowing a second create.
- Added two form regressions (same-turn repeated submit; false/rejected-save retry) and one actual-page deferred post-save status-read regression. Before the fix, the focused run was **RED 3 failed / 24 passed**, with one unhandled rejected-save error. The synchronous test observed two save calls; the page showed the Save control re-enabled while its status reread was pending.
- CodexDirectProfileForm now owns a synchronous submission ref and rendered submission state for the entire onSave promise, covering native save plus the caller's status refresh. Duplicate submit events return immediately. Inputs, model/default controls, Cancel, modal close/Escape and Save remain locked throughout. Finally releases the lock on success, false results and thrown errors; an unexpected thrown error produces a fixed safe message and retains the draft.
- The page regression verifies one created profile while the post-save status read is deferred and still one after repeated clicks; if that status read fails, the already-saved profile remains in the list, 未启用 save feedback remains accurate, and the separate configuration-read failure is shown safely.
- Final `npm --prefix apps/desktop test -- src/components/CodexDirectProfileForm.test.tsx src/pages/CodexPage.test.tsx`: **PASS 2 files / 27 tests**, zero failures or unhandled errors.
- Full `npm --prefix apps/desktop test`: **PASS 29 files / 245 tests**, zero failures. `./node_modules/.bin/tsc -b`: **PASS**. Scoped `git diff --check`: **PASS**.
- Changed only the profile form, its new focused test, the page regression and this report. No Vite build/dist or native/package/login-module changes were made. Source frozen for scoped re-review; no commit/push.
