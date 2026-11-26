# 1.1.10 local internal test — revision2

Owner request2026-11-25: increment version by1, preserve data and generate an internal-test executable on the local Desktop.

## Plan and boundary
- Reuse task worktree codex-route-management-20261125 at d1fe810; preserve pre-existing uncommitted plan/progress edits and ci.md deletion.
- Increment package/product/lock/builder version and version-bound assertions1.1.9→1.1.10. No runtime behavior or application identity/path changes.
- Coordinator owns version, build and delivery. Independent reviewer checks metadata consistency, stable data identity and preservation strategy after tests.
- Back up Gateway config/log state, encrypted secrets and runtime master key as opaque bytes in ignored local storage; never print/decrypt secrets. Do not read Codex authentication/settings.
- Build a new Windows x64 Portable under apps/desktop/release/1.1.10-codex-internal-20261125. Copy to C:/Users/20142/Desktop/Cx-Routing Gateway Portable 1.1.10 - Codex Internal Test.exe.
- Verify existing restart/persistence tests, Desktop version display, release metadata, production build, packaged version and isolated Portable health/restart. Compare preservation hashes before/after.
- Rollback: exit internal build via tray and reopen existing1.1.9. Existing app, data and backup remain. No merge, public release, automatic user-app shutdown, or live-provider request.

## Current status
Local delivery: PASS. Revision2 changes remain uncommitted/unpushed in codex/codex-route-management-20261125; PR25 stays at d1fe810 and remains open/unmerged. Owner real-client/provider testing is NOT_RUN.

## Evidence
- Metadata version/package/product/lock/builder:1.1.10. Existing Settings assertions updated, original CRLF retained; CRLF-aware diff check PASS.
- Existing release-manifest, master-key and supervisor/restart tests:8/8 PASS. SettingsPage:13/13 PASS. TypeScript/Vite production build PASS.
- Independent review: PASS; version aligned; app name/productName/appId/userData/schema/credential behavior unchanged. Reviewer did not inspect live secrets or claim package runtime validation.
- Windows x64 unpacked and Portable builds: PASS. Packaged --version returned1.1.10. Native Codex management module bytes match source. New/old package names both @cx-routing-gateway/desktop-ui.
- Source Portable and Desktop copy each passed two isolated launches. Each reused the same fixture route/client-Key/encrypted upstream key/master key; saved request logs grew1→2. Each made2 calls to a local mock and0 real-provider calls. Empty isolated CODEX_HOME stayed empty.
- Desktop output: C:/Users/20142/Desktop/Cx-Routing Gateway Portable 1.1.10 - Codex Internal Test.exe;115039990 bytes;SHA256 D593759FB8BDF926F7B4923BC4146E2A0A1E511D8CEFBDD44A7C89095C094361. Source/copy hashes equal. Unsigned; no signing certificate configured.
- Opaque live Gateway backup: .tmp/codex-route-management-20261125/local-beta-1110/data-backup. Six files,1700671 bytes: runtime/config.json, config.json.bak, secrets.json, runtime-master.key, Local State, Preferences. Backup/source stable hashes matched before build and after all smoke checks. Backup excluded from Git; no credential bytes printed/decrypted.
- Two pre-existing Desktop executables retain their original hashes. All5 pre-existing launcher/app processes remain running. No installed/user data or real Codex config/auth changes were made.
- Pre-existing document edits/deletion remain unchanged. No commit, push, merge, release or worktree deletion.

## Owner handoff
Exit1.1.9 from its system-tray menu, then open the new Desktop internal executable. It retains the same default userData directory. Confirm actual provider/Codex use manually; no live-provider success is claimed. Rollback by exiting the internal build and opening the preserved1.1.9. Coordinator next action: none.

AWG project_status checked primary repository/worktree identity. This task's active revision is checked through terminal/file tools in its worktree; the fixed-root AWG server still binds the primary checkout, so these edits/build/copy operations are not claimed as AWG-enforced.
