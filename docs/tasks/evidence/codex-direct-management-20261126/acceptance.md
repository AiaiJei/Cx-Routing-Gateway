# Revision 4 acceptance — 2026-11-26

The Owner confirmed that Codex direct mode includes official and third-party Responses suppliers, importing current configuration, and saving/editing/switching schemes. Development and local delivery are complete. Real account/provider acceptance remains NOT_RUN.

| Requirement | Evidence | Result |
|---|---|---|
| Top-level direct and Gateway modes; browsing does not activate | Page tests and browser/native observations | PASS |
| Visible save/confirm/feedback and actual active state | Native UI activation; asynchronous UI regressions | PASS |
| Official default without forced ChatGPT configuration | Native tests, CLI config read and disk verification | PASS |
| Encrypted supplier CRUD/import/duplicate and redaction | Store/service/UI tests; actual Electron secure storage | PASS |
| Current third-party routing identified accurately | Legacy fixtures and native current-provider screen | PASS |
| Last direct route survives Gateway edits | Routing-only snapshot roundtrip, preserving newer MCP | PASS |
| Data, authentication and concurrency boundaries | Corrupt-library/path/link/stale-revision/failure tests and reviews | PASS |
| Multiple models and selected default | Actual Codex 0.167 model/list and native UI | PASS |
| Warning-prefixed CLI version | Fake-process regression; bounded exact-line parser | PASS |
| Complete regression and independent review | Runtime 342/342; Desktop 245/245; build; audit 0; all review findings resolved | PASS |
| Separate local program and old data preservation | Package/hash checks and two isolated launches | PASS |
| Real account login and real provider traffic | Owner retest | NOT_RUN |

## Runtime and screen evidence
- Actual official CLI 0.167 ran in an isolated home. Generated direct catalogue returned exactly direct-alpha/direct-beta, with beta as default and provider cx_codex_direct. Direct → Gateway → last direct → official preserved newer MCP entries and original reasoning. No login or generation request was issued.
- Actual Electron identified the initial third-party config as direct. Import saved an encrypted profile without switching. Editing with a blank Key preserved it, added a model and changed the default; save reported 未启用. Explicit activation preview/confirmation then updated the actual active status.
- Final Electron flow switched the original third-party config to Gateway with two models, returned to the automatically retained direct supplier, then selected official default. Disk checks confirmed official provider selector/forced-login settings absent, original MCP/reasoning preserved, model requests 0 and no fixture auth.json created.
- Browser widths 1440/816/390 and keyboard tab switching were inspected. At 390 px the page width stayed 390 and the Gateway primary action was visible at y=539 within the 844 px viewport. Native 1224×765 showed the direct primary action above the supplier list.
- Taste source lint flagged only the editable URL example placeholder https://api.example.com/v1. This is instructional placeholder text, not a claimed supplier or mock product data; it was retained for that reason.

## Desktop internal program
- Output: C:/Users/20142/Desktop/Cx-Routing Gateway Portable 1.1.10 - Codex Direct Test.exe
- Size: 115066258 bytes.
- SHA-256: 61FC56E3C013E00E2BFBD88F37E4F385F93E474AB762D09561FD03038CCA9556.
- Source and Desktop copy hashes match. Windows x64 unpacked/Portable builds passed; packaged version is 1.1.10 and 10 key native modules match source bytes. Builder directory-rename EPERM used its copy fallback successfully. The executable is unsigned.
- The Desktop copy launched twice against the same isolated seeded data. Route, client Key, encrypted upstream credential and master key were reused; logs grew from 1 to 2. Two local mock requests, zero real provider requests.
- Six live Gateway data files and their opaque backup retained matching hashes; all three pre-existing Desktop program hashes and all five original processes remained unchanged. Backup stays in ignored .tmp/codex-direct-management-20261126/data-backup.
- Pre-existing unrelated old plan/progress edits and ci.md deletion were preserved against the before snapshot.

## Boundaries and handoff
No actual user Codex config/auth files, real login or real provider traffic were accessed during development. Scheme secrets use OS encryption; enabled Codex config and existing original-byte backups remain plaintext local files. Advanced unsupported/unsafe authentication projections fail before writes. Generic Codex model metadata does not prove provider capabilities.

Source remains uncommitted/unpushed in codex/codex-route-management-20261125; PR #25 remains open at d1fe810 and master is unchanged. No merge/release. AWG's fixed server binds the primary checkout; worktree changes, tests, UI and builds used terminal/file tools rather than AWG write enforcement.

Next: Owner exits the old app through the tray, opens the new candidate and tests real direct/Gateway usage. Agent follow-up: none.
