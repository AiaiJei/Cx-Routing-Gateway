# Desktop workspace UI

This package contains the runnable React renderer and Electron Desktop shell for the Cx-Routing Gateway workspace. When the Electron app is ready it starts the local-control and Gateway runtime through `runtime-supervisor.cjs`; the renderer reads masked runtime state through preload IPC. Route editing, credential lifecycle, settings persistence, streaming, tool conversion, and Windows packaging are implemented in the current worktree.

## Development

```powershell
npm install
npm run dev
```

In a second terminal, with the Vite server running:

```powershell
$env:CXRG_DEV_SERVER_URL = "http://127.0.0.1:4173"
npm run desktop:dev
```

For the built renderer:

```powershell
npm run desktop:prod
```

To generate a Windows unpacked distribution directory:

```powershell
npm run desktop:dist
```

The output is `release/win-unpacked`. The runtime bundle is copied to `resources/runtime` and is verified with the release manifest.

`npm run desktop:installer` additionally produces an NSIS installer in `release/`. The installer is unsigned and has not been exercised on a clean machine. Settings can download and launch a newer installer only after its manifest signature and artifact hash pass verification.

## Verification

```powershell
npm test
npm run build
npm audit
```

Browser mode uses fixtures. Electron mode uses the local control API through preload IPC; upstream checks, CRUD, credential lifecycle, route editing, metrics, and retention settings persist in the local runtime data directory.
