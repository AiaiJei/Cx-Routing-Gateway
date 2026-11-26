# Codex modes/models frontend — revision 3

Implementation completed locally on 2026-11-26 Asia/Shanghai against the Owner-approved revision-3 specification dated 2026-11-25.

## Delivered behavior

- Navigation now reads Codex, under 工作区 immediately after 总览; /codex remains the route.
- Three real tab/tabpanel pairs: 接入设置, 模型, 配置与恢复. Roving tab focus and ArrowLeft/Right/Home/End switching retain mode, selected models, default, search and Key drafts.
- Native configuration status loads whenever the four native methods exist, independently of Gateway workspace data. The saved mode stays distinct from the draft. Official preview/apply, client status/login and native backup recovery remain usable when Gateway workspace fails.
- Official models are selected inside Codex according to its signed-in account. No official model names, account identity or login success are invented by this UI. Browser preview queries neither local configuration nor account state, offers no writes and shows no fixture model/account list.
- Gateway model checkbox list uses enabled Responses routes, alias/upstream/protocol details, search, search-result select-all, clear, a bounded 100-model selection and a default constrained to that selection. Missing or disabled saved selections are visibly unavailable. Legacy single-model aliases resolve only when a unique eligible actual route arrives; user-edited drafts are not overwritten by late status/route loads.
- Key creation uses the existing client-key API and all selected aliases. Blank Key input reuses the stored managed Key inside native code; it never returns to the renderer. A newly created Key retains its original scope if the draft changes, and cannot apply to a model outside that scope. Typed replacement Keys are sent only in the Gateway apply input and cleared after successful mutation.
- Official login shows actual native available/version/auth/login enums, requires saved official mode and an explicit confirmation, describes possible sign-in replacement and user-completed browser flow, supports pending polling/cancel, and provides manual official-client fallback. Process completion and authenticated account state remain separate.
- Configuration confirmation describes the actual mode change. Official mode explains removal of custom built-in endpoint/model/catalogue overrides. Gateway mode explains model/default and Key storage/reuse. Model catalogue output is labelled 摘要, not the complete generated descriptor file.
- Removed the independent reasoning control and reasoning status from the page and frontend IPC types. Existing source reasoning settings are owned/preserved by native code.
- Reused existing Button, TextField, CustomSelect, Modal, PageHeader, SearchField and workspace API. Separate tabs/access/models/config/confirmation components and configuration/login hooks keep responsibilities bounded. Styling keeps the established white/gray Gateway shell and shared tokens; scoped disabled states remain legible.

## Verification evidence

1. Before production changes, replaced the old single-route page tests with revision-3 behavior and navigation assertions. `npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx src/components/AppShell.test.tsx`: **RED, 14 failed / 4 passed**, matching absent new navigation/tabs/models/modes/login behavior.
2. Initial implementation passed 17 of 18 checks; the remaining test accidentally sent End to a checkbox, unsupported by the jsdom user-event selection helper. Corrected the keyboard test to focus the tab before Home/End.
3. Added configuration-hook regressions. A restore result test failed because synchronizing the restored draft triggered a selection-derived source fingerprint and cleared the success message. Switched invalidation to actual route-source changes. Focused run: **PASS 4 files / 27 tests**.
4. Added official-login lifecycle tests: saved-mode gate, pending versus auth status, successful poll, cancellation, safe login error and temporary status-read failure. Temporary read failure was **RED, 1 failed / 3 passed**, revealing that polling stopped after a failed read. Added an explicit poll cycle; focused login run **PASS 4/4**.
5. Added replacement-Key/no-Key behavior, unavailable/missing catalogue recovery, Gateway-refresh gating and draft-official login gating. `npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx src/components/AppShell.test.tsx src/data/codex-management.test.tsx src/data/codex-login.test.tsx src/data/codex-client.test.ts`: **PASS 5 files / 35 tests**, zero failures.
6. `npm --prefix apps/desktop test`: **PASS 27 files / 231 tests**, zero failures, no test warnings reported.
7. `npm --prefix apps/desktop run build`: **PASS TypeScript and Vite**, 89 modules. Final isolated header/path wrapping CSS adjustment follows this build; coordinator owns the final build/browser/package pass.
8. `git diff --check` scoped to the frontend files: **PASS**. Existing SettingsPage.test.tsx revision-2 whitespace belongs to the prior local version edits and was preserved by this worker.

## Limits and integration

- UI unit tests use native-method test doubles. Actual immutable catalogue activation/model-list parsing, filesystem roundtrip and official CLI process safety are established by native/coordinator evidence, not these mocks.
- Browser screenshots, real tab/checkbox focus behavior, widths 1440/816/390 and independent UI review: coordinator owns the final checks; this report does not claim them from unit tests.
- No actual user Codex config/authentication files, real account sign-in or provider generation requests were accessed by this worker.
- No package/version/global workspace changes, commits, pushes, merges, releases or subagents were performed. Prior local revision-2 edits remain in place.
- Reads, edits and tests used terminal/apply_patch and were outside AWG tool enforcement; the coordinator established the active contract.

## Independent UI review fix — StrictMode and navigation focus

- Important finding reproduced: the application root uses React StrictMode. Its initial effect cleanup invalidated the first login-status request but retained a boolean in-flight flag, so the second effect skipped its read and left busy true/status null.
- Added a StrictMode deferred-read test and changed the navigation test to require an explicitly named navigation action plus focus transfer. Before production fix, `npm --prefix apps/desktop test -- src/data/codex-login.test.tsx src/pages/CodexPage.test.tsx`: **RED, 5 failed / 18 passed**. One failure reproduced the single-read StrictMode lock; four reflected the old ambiguous navigation label/absent focus transfer.
- Replaced the boolean flag with a request-owned in-flight ID. Cleanup invalidates and releases that lifecycle's ID; the next StrictMode setup can start a current read. A stale read can neither overwrite status nor release a newer request's in-flight state. The regression resolves the stale first read before the current second read and asserts busy remains true until the current result arrives; official login remains usable afterward.
- Renamed the navigation-only action to 查看配置 in settings and model panels. It selects 配置与恢复 and transfers focus to that tab, without implying that preview or apply has run. Actual 预览配置 and 应用配置 remain explicit actions in the destination panel.
- Final focused run: **PASS 2 files / 23 tests**, zero failures. `./node_modules/.bin/tsc -b` from apps/desktop: **PASS**. No Vite build was run for this fix, preserving the coordinator's currently running native smoke dist snapshot; coordinator owns the final production build and full verification.
