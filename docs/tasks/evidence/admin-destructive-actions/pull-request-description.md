# Reliable Admin Actions and Local Desktop 1.1.4

## Changes

- Clear all retained request logs through the authenticated local-control API, with an explicit confirmation and the number of removed records.
- Add permanent client-key deletion as a separate operation while preserving the existing revoke behavior.
- Block upstream deletion while any enabled or disabled route references it, return dependent route details, and serialize reference checks with route/config writes.
- Preserve upstream dependency errors through Electron IPC and show accurate confirmation, success, and failure feedback in the admin pages.
- Remove the duplicate focus outline from the request-log search and credential-scope fields.
- Bump Desktop package, product, and build metadata to 1.1.4; deliver the verified Windows x64 Portable locally without replacing 1.1.3.

## Verification

- Runtime tests: 131/131 passed.
- Desktop tests: 154/154 passed across 23 files.
- Desktop production build passed.
- Release verifier validated 11 Windows x64 unpacked, NSIS, and Portable artifacts for version 1.1.4.
- Portable startup and local control/gateway health smoke passed; Desktop copy SHA-256 matches the verified source.
- Independent review found no Critical, Important, or Minor issues.

No GitHub Release or tag was published.
