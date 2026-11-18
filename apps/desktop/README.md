# Desktop workspace UI

This package contains the runnable React renderer for the Cx-Routing Gateway workspace. It is a frontend preview, not a native Desktop package; Gateway lifecycle control and the local API are not implemented.

## Development

```powershell
npm install
npm run dev
```

## Verification

```powershell
npm test
npm run build
npm audit
```

All displayed upstreams, routes, calls, credentials and settings are local fixtures. Upstream checks and create actions are page-session demonstrations; they do not make network requests or persist data.
