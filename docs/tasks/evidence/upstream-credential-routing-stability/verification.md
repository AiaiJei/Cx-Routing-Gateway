# Verification Evidence

Date: 2026-11-23
Task: `CXRG-UPSTREAM-CREDENTIAL-ROUTING-STABILITY-2026-11-23`
Branch: `codex/upstream-credential-routing-stability`

## Commands

| Command | Result |
| --- | --- |
| `node --test tests/runtime/runtime-master-key.test.mjs tests/runtime/supervisor.test.mjs tests/runtime/gateway-server.test.mjs` | PASS: 47/47 |
| `npm run build` from `apps/desktop` | PASS: TypeScript and Vite |
| `npm test` from repository root | PASS: 153/153 |
| `npm test` from `apps/desktop` | PASS: 158/158 across 23 files |
| `node --check apps/desktop/electron/main.cjs` | PASS |
| `node --check apps/desktop/electron/runtime-master-key.cjs` | PASS |
| `node --check apps/desktop/electron/upstream-edit-ipc.cjs` | PASS |
| Parse task contract with `JSON.parse` | PASS |
| `git diff --check` | PASS |

## Behavioral Evidence

- Master-key tests cover versioned encrypted writes, stable reuse, legacy encrypted/plaintext reads, and corrupt-file preservation without silent regeneration.
- Supervisor restart test creates an upstream through authenticated Local Control, stops both services, starts them again with the same data directory/master key, and sends a Gateway request. The local upstream receives `Bearer persisted-upstream-key` after restart.
- Gateway failover tests cover three preferred failures, failed cooldown probe staying on backup, authenticated successful probe restoring preferred priority, one in-flight probe shared by concurrent post-cooldown requests, late failure isolation, route/target isolation and routing-change health reset.
- The vault file did not contain the test credential as plaintext and the persisted config exposed only an opaque `credentialRef`.

## Boundaries

- All upstream servers were local HTTP fixtures; no third-party provider request was made.
- Native packaged Electron quit/relaunch UI interaction is `NOT_RUN`; the supervisor integration covers the persisted runtime lifecycle and the same data directory/master key boundary.
- `npm install` reported six moderate audit findings and pending install-script approvals; no dependency version changes were introduced.
- Independent review: UNAVAILABLE. Two reviewer dispatches failed because the local a6api proxy returned HTTP 404 for `/v1/responses`; author self-review completed and found no Critical or Important findings.
- Follow-up reset parsing: local upstream reset regression PASS; Runtime 154/154; Desktop 158/158; Desktop build PASS. Raw internal connection codes are no longer exposed in the request-log status detail.
- Merge/release: PR #19 merged as ce77ce4733967afc71e6f8973cc5d8bc13e90c08; primary master synchronized; v1.1.5 tag moved to that commit without changing the version; four GitHub assets were replaced and remote digests matched locally verified artifacts.
- Release artifact verification: 11 artifact hashes generated; unpacked 1.1.5 smoke PASS; explicit absolute-path Portable smoke PASS for Local Control and Gateway health.

- Desktop delivery: replaced the existing Desktop Portable 1.1.5 after confirming its old hash; source/target hash matched 6cb872606c45947876230fdfab710a6573e52ff13e75befacda3d2b415a2b2775f21be00, size 115022385 bytes, and Desktop-path Portable smoke passed both services.
