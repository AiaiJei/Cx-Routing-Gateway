# Version 1.1.5 Release Verification

Date: 2026-11-22

## Source and version

- PR #18 merged to `master` at `351693e61ee30ea52f590775a4c3d7fdceb27641`.
- GitHub `master` was at the merge commit before release metadata was committed.
- Latest published stable release before this task was v1.1.4. The v1.1.5 release and tag were absent at preflight; the Desktop 1.1.5 destination was absent while the Desktop 1.1.4 file existed.
- Package, product, lockfile root, and Electron build version are 1.1.5.

## Fresh checks

- `npm test` at repository root: PASS, 146/146.
- `npm test` in `apps/desktop`: PASS, 158/158 across 23 files.
- `npm run build` in `apps/desktop`: PASS, TypeScript and Vite production build.
- `node scripts/verify-release.mjs apps/desktop/release/1.1.5-final-reviewed --write`: PASS; generated a manifest for 11 required artifacts and recomputed each SHA-256.
- `node scripts/smoke-packaged.mjs "apps/desktop/release/1.1.5-final-reviewed/win-unpacked/Cx-Routing Gateway.exe"`: PASS, reports version 1.1.5.
- `node scripts/smoke-portable.mjs "apps/desktop/release/1.1.5-final-reviewed/Cx-Routing Gateway Portable 1.1.5.exe"`: PASS, isolated Local Control and Gateway health checks both returned `ok`.

## Artifact hashes

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `Cx-Routing Gateway Setup 1.1.5.exe` | 126502860 | `eaa0a9de899a91b125564f3d7cfa43b7e8658bc1ad1279dae1704b29e32ce86e` |
| `Cx-Routing Gateway Setup 1.1.5.exe.blockmap` | 133201 | `6e1fcad38322813feeb0a1b58f45acf5121cc7bc5595f3bdfd54e4b983dea30a` |
| `Cx-Routing Gateway Portable 1.1.5.exe` | 115021442 | `af57be5ab7c4810844b2ce911bc862fc0b4c1d97acdfd2b415a2b2775f21be00` |
| `win-unpacked/Cx-Routing Gateway.exe` | 249906688 | `1f592aaab23529a958d940d09223122c1fb8041a78d7e3ff0fcb842f367d9a25` |
| `win-unpacked/resources/app.asar` | 13847289 | `af0a2a6f8b72af608de9886d2a1029c3c85bc91fb37a93e774ae12c0ed55631c` |
| `win-unpacked/resources/runtime/services/local-control/src/server.mjs` | 28116 | `12e14272b93e8c040bd1854ff236cd9f389085679b0bafa0c70554de165c0680` |
| `win-unpacked/resources/runtime/services/gateway/src/server.mjs` | 43090 | `0ede9e7c186a59cfedf16b752b2b27bb19d1a9959905e82e3bed7a9e3208a1dc` |
| `win-unpacked/resources/runtime/services/gateway/src/request-metrics.mjs` | 5406 | `fb59489d733bb2cf17b64c3a25e4403f1b3b813523572f2a7108200cb56c102b` |
| `win-unpacked/resources/runtime/packages/shared/src/config-store.mjs` | 2964 | `943faf4105edb1244962a9b55369cb45739f8ea220ba844c2380d0e5805b744e` |
| `win-unpacked/resources/runtime/packages/shared/src/secret-vault.mjs` | 2765 | `fcc710c47148918701a62983acd7bdf571c81b9e9dbd61839c0f5a1a67f9d6be` |
| `win-unpacked/resources/runtime/scripts/check-update.mjs` | 7172 | `7d5ddbc0f6d2b649fd90e854cfbacee77e0c9a4c31cc3cf0a91cbdb8c09b0671` |

## Limitations and pending steps

- The generated manifest records `signed: false`; code signing was not configured or performed.
- No real upstream provider request was made.
- GitHub publication, Desktop copy hash/smoke, and task-worktree removal are pending.
- The repository-level `.codex/awg-task.json` still identifies an earlier timeout-metrics task. The current upstream task contract contains the explicit authorization and scoped release paths; the older project pointer was left unchanged to avoid modifying another task's contract.
