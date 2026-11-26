# Isolated Desktop smoke

2026-11-25, first implementation (native28f849c/UI6a8b3d9); review fixes pending.

- Official Electron package binary installed into task worktree; separate userData and CODEX_HOME under .tmp/codex-route-management-20261125/electron-smoke-ukQGnx.
- Startup used dynamic loopback ports, one local fixture route, synthetic scoped Key and an unreachable fixture upstream. Original config contained previous-local-model plus an unrelated MCP stanza.
- Used CUA Windows window selection by exact isolated title. Opened Codex page, selected codex-local-check, entered synthetic Key, requested preview, inspected explicit apply dialog, applied, observed success and redacted configured status/backup.
- Clicked restore, inspected confirmation and restored. UI returned previous-local-model and unconfigured state.
- Direct disk check: restoredExactBytes=true, Gateway usage/modelRequests=0, backupCount=1. No model/provider request occurred. Only isolated test process was terminated; fixture files retained.
- Long test path wrapped inside the native configuration panel; preview did not display Key. Installed Owner app and actual Codex configuration were untouched.
- First launch with windowsHide:true produced a live hidden test window; identified exact process, terminated only that isolated process tree, restarted with visible UI for verification.
- Current final-code Electron smoke still pending review fixes; this record is not substituted for final validation.

## Final source6776c8f validation
- Isolated home electron-smoke-Zr0BOt, loopback Control63186/Gateway63187; final built renderer and main/preload/service source.
- Preview then harmless external comment added to fixture config. Apply was rejected with specific message: 配置已被其他程序修改，请刷新状态并重新预览. Key remained masked and entered value retained.
- Refresh/preview/apply succeeded; status showed configured model/credential and backup. Restore succeeded and returned previous-local-model.
- Disk check: restoredExactBytes=true, externalEditPreserved=true, modelRequests=0, backupCount=1. Only isolated process tree stopped; user app untouched.
- Windows x64 unpacked build completed at .tmp/codex-route-management-20261125/package/win-unpacked. app.asar contains smol-toml, toml-eslint-parser and eslint-visitor-keys. Initial archive lookup used wrong slash escaping; normalized listing verified all dependencies. No package content was missing.
- Test package is unsigned, version remains1.1.9; no installer/Portable/release published and no installed app replaced.

## Browser checks
- CUA inspected1440x900,816x765,390x844; nav collapses, fields stack, paths wrap.390px document width390/no overflowing main elements.
- Keyboard ArrowDown/Enter chooses route; native confirmations and browser help disclosure observed. Disabled native actions are legible and unavailable in fixture mode.
- During live source edits Vite HMR encountered a hook-order mismatch; full reload recovered. Final source frozen/reloaded and production build/native view verified. No production hook-order defect was reproduced.
- Taste source lint for Codex page/status/CSS:0 FAIL,0 WARN. Browser inspection used CUA per active computer-use instructions, not the skill's independent browser driver.
