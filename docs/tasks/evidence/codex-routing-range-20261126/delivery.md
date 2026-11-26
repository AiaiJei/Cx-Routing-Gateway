# Revision6 Desktop local delivery — 2026-11-26

- File: `C:/Users/20142/Desktop/Cx-Routing Gateway Portable 1.1.10 - Codex Routing Test.exe`
- Version: **1.1.10** Windows x64 portable, unsigned local candidate.
- Size: **115,085,335 bytes**.
- SHA256: `D2FD045E2B078EA0E9756C5A1A2D42764B797A3A7B025907DA6F3410E47D92DC`.
- Build folder: apps/desktop/release/1.1.10-codex-routing-20261126.
- Desktop destination was absent, copied with overwrite=false and hash-matched. Packaged executable version smoke PASS1.1.10. All **49** checked native/UI/affected runtime source files match build sources. Package/app identity unchanged.

## Desktop executable runtime

Ran the actual Desktop copy twice using one isolated synthetic userData/CODEX_HOME and local loopback upstream. Both launches reported healthy services, retained saved route range low→high, retained route/default/credential draft, encrypted client/upstream keys and master key bytes, and kept the route unchanged. Each request asked for xhigh and reached the local upstream as high. Logs persisted1→2. Real provider calls0; no real user configuration touched. Fixture .tmp/codex-routing-range-20261126/portable-preservation-bQr0wO; log portable-final-smoke.log.

## Preservation

Six original Gateway files match pre-revision hashes: runtime/config.json, config.json.bak, secrets.json, runtime-master.key, Local State and Preferences. The opaque backup contains71,012bytes and hash-verifies; it was never decrypted or printed. Four Desktop originals (Direct Test1.1.10, Memory Test1.1.10, Modes Test1.1.10 and GitHub Release1.1.9) remain unchanged. Original user PIDs2632/17280/11952/17384/15892 remain running. Only owned isolated smoke processes and the Vite preview were stopped. Three pre-existing original-task document edits/deletion match the revision6 snapshot unchanged.

Result manifest: .tmp/codex-routing-range-20261126/delivery-result.json. No existing executable was replaced and no user process was stopped.

## Retest steps and remaining boundary

1. Exit the older Gateway from its tray menu, then open Codex Routing Test.
2. In 模型路由, select upstreams horizontally and the unified model once; set the allowed minimum/maximum interval (highest actual API level max), then save.
3. In Codex→CX-RG网关, save/enable again so the native model list and cross-protocol search setting update; read the user-scope/search notice, then restart Codex or create a new session.

The default hosted web_search caused the reported tools.type failure. Converted Chat/Messages mode explicitly disables that unavailable hosted feature while retaining local tools/MCP/custom tools. Independent--profile files and startup overrides are not changed. Encrypted/compacted history that cannot be represented safely requires a fresh session; no fake search or tool success is emitted. Actual provider-specific model/effort support and Owner acceptance remain NOT_RUN.

Implementation, local verification and local delivery: PASS. Overall provider/Owner acceptance: PARTIAL. Task worktree `.tmp/worktrees/codex-route-management-20261125`, branch `codex/codex-route-management-20261125`, HEADd1fe810529ed59455bb1854da05fa21a39d2c671. Revisions2–6 are uncommitted/unpushed; PR25 remains OPEN/unchanged. No merge/public release. Terminal/UI/file checks are not AWGMCP-enforced; exact-root mismatch is recorded in integration.md.

Next action: Owner retests their actual Codex/provider. No remaining developer action for this local delivery.
