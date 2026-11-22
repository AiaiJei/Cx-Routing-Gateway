# Cx-Routing Gateway 1.1.5

This patch release includes the upstream editing and failover stability improvements from PR #18.

## Updates

- Edit an existing upstream from a prefilled dialog. Leaving the API Key blank preserves the current credential.
- Recover primary priority after a late successful response and ignore stale failures that finish after recovery.
- Preserve private-network trust when editing other upstream fields, and keep the active credential intact if key rotation or configuration persistence fails.

## Verification

- Runtime tests: 146/146 passed.
- Desktop tests: 158/158 passed across 23 files.
- Desktop TypeScript/Vite production build passed.
- Release manifest verification passed for 11 Windows x64 artifacts; unpacked-app and Portable health smoke checks passed.

## Windows x64 assets

- `Cx-Routing Gateway Setup 1.1.5.exe`
- `Cx-Routing Gateway Setup 1.1.5.exe.blockmap`
- `Cx-Routing Gateway Portable 1.1.5.exe`
- `manifest.json`

The Setup, blockmap, Portable, and manifest SHA-256 values are recorded in the attached manifest. The binaries are unsigned because no code-signing certificate was configured for this build.
