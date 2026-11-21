# Cx-Routing Gateway 1.1.4 Local Delivery

Date: 2026-11-22
Task: `CXRG-ADMIN-DESTRUCTIVE-ACTIONS-2026-11-22`
Build scope: local Windows x64 verification only; no GitHub Release was published.

## Verification

- Runtime tests: `npm test` passed 131/131.
- Desktop tests: `npm --prefix apps/desktop test` passed 154/154 across 23 files.
- Desktop production build: `npm --prefix apps/desktop run build` passed.
- Release metadata test: `node --test tests/runtime/release-manifest.test.mjs` passed 2/2.
- `scripts/verify-release.mjs` found all required x64 unpacked runtime, NSIS installer/blockmap, and Portable artifacts. Manifest metadata reports product/package version `1.1.4` and platform `win32`.
- Unpacked executable `--version` printed `1.1.4`.
- The task-worktree Portable passed `scripts/smoke-portable.mjs`; isolated control and gateway health checks both passed.
- The Desktop Portable copy passed the same isolated startup and health smoke.

## Desktop Artifact

- Source: `apps/desktop/release/1.1.4-local/Cx-Routing Gateway Portable 1.1.4.exe`
- Delivered copy: `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.4.exe`
- Size: 115,020,715 bytes
- SHA-256: `FD28C5A424EC775D517408E63C19E2FD9087E451EDEA13D90BB804BD6983A1D9`
- Source and Desktop copy hashes matched after copying.
- Existing `Cx-Routing Gateway Portable 1.1.3.exe` remains present and unchanged.

## Release Verifier Artifact Hashes

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `win-unpacked/Cx-Routing Gateway.exe` | 249,906,688 | `7cfe8fa5e4c9aaca290e2644ce69a772d7e26b163b0cf56e1d9bc29d11efb716` |
| `win-unpacked/resources/app.asar` | 13,842,978 | `3e3959849c3cd1c199ed8ed89a93ad61511d08e18efc57bd6f8c35f4ab1a61f1` |
| `win-unpacked/resources/runtime/services/local-control/src/server.mjs` | 25,831 | `cdf2f10553e79df12e296bb42e8f7627d11bed689fb74ffbc8a788571888355c` |
| `win-unpacked/resources/runtime/services/gateway/src/server.mjs` | 42,245 | `439a21758ab2668597f870551c98676d043690154013080b9ea1516c195877cc` |
| `win-unpacked/resources/runtime/services/gateway/src/request-metrics.mjs` | 5,406 | `fb59489d733bb2cf17b64c3a25e4403f1b3b813523572f2a7108200cb56c102b` |
| `win-unpacked/resources/runtime/packages/shared/src/config-store.mjs` | 2,964 | `943faf4105edb1244962a9b55369cb45739f8ea220ba844c2380d0e5805b744e` |
| `win-unpacked/resources/runtime/packages/shared/src/secret-vault.mjs` | 2,765 | `fcc710c47148918701a62983acd7bdf571c81b9e9dbd61839c0f5a1a67f9d6be` |
| `win-unpacked/resources/runtime/scripts/check-update.mjs` | 7,172 | `7d5ddbc0f6d2b649fd90e854cfbacee77e0c9a4c31cc3cf0a91cbdb8c09b0671` |
| `Cx-Routing Gateway Setup 1.1.4.exe` | 126,501,876 | `575e48b87d9fbea7b66e3363c355b45982c0b7950bcad8a775bf972701fbb6ad` |
| `Cx-Routing Gateway Setup 1.1.4.exe.blockmap` | 133,252 | `6811d865d4275da401ec96e3399ab3295f1a47db2fed8ebcf39ffda4c82028bd` |
| `Cx-Routing Gateway Portable 1.1.4.exe` | 115,020,715 | `fd28c5a424ec775d517408e63c19e2fd9087e451edea13d90bb804bd6983a1d9` |
