# Desktop workspace UI

This package contains the runnable React renderer and Electron Desktop shell for the Cx-Routing Gateway workspace. Gateway lifecycle control and the local API are not implemented.

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

## Verification

```powershell
npm test
npm run build
npm audit
```

All displayed upstreams, routes, calls, credentials and settings are local fixtures. Upstream checks and create actions are page-session demonstrations; they do not make network requests or persist data.
