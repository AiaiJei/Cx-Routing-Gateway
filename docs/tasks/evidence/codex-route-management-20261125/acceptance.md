# Acceptance — Codex route management
Date: 2026-11-25. Source reviewed through 6776c8f.
Development and local acceptance: PASS. Installed-client/Owner acceptance: NOT_RUN.

| Requirement | Current evidence | Result |
|---|---|---|
| Dedicated PR against master, own branch | PR #25, codex/codex-route-management-20261125 | PASS; remains open |
| Enabled Responses routes and local Key scope validation | codex-ipc.test.mjs, actual Control/Gateway fixtures | PASS |
| Existing Key and explicit scoped-Key creation | Native fixture + CodexPage and management hook tests | PASS |
| Redacted preview, source-preserving TOML edits, revision-bound apply | codex-config.test.mjs, including64-bit ints/floats/-0/high-precision date/time and quoted/dotted/inline tables | PASS |
| Original-byte backup/restore, absent-original restoration and restart recovery | Real temporary-file tests + actual Electron UI smoke | PASS |
| Stale config, tampered backups, malformed/oversized/nonregular files, symlink and failed IO | Native failure/security tests | PASS |
| Trusted IPC, fixed native target, no renderer path/URL input | Native IPC tests + isolated Electron composition | PASS |
| Stable safe error across actual Electron IPC | Message-only regression + actual final conflict displayed | PASS |
| Loading/empty/error/success, confirmations and fixture restrictions |23 scoped renderer tests;224 complete Desktop tests | PASS |
| Late refresh cannot lose committed result or generated Key scope | Hook/page async regressions and independent re-review | PASS |
| Wide/minimum/narrow and keyboard/focus, long paths | CUA1440x900,816x765,390x844; route keyboard; native long-path screens | PASS |
| Runtime/renderer/build/audit | runtime-final.txt282/282; desktop-final.txt224/224; build-final.txt; audit0 vulnerabilities | PASS |
| Independent native, UI and whole-branch reviews | review.md; all findings resolved and scoped re-reviews PASS | PASS |
| Windows x64 local package | electron-builder --dir, packaged smol/toml-eslint/visitor-keys verified | PASS; unsigned |
| Current-head CI | GitHub PR #25 latest checks are authoritative | Checked before marking PR ready; no old-head CI substituted |
| Actual installed Codex session/provider behavior | Owner retest after PR review | NOT_RUN |
| Merge/release/installed app replacement | Outside authorized delivery | NOT_RUN |

Final Electron flow on isolated home: preview; modify external comment; apply correctly rejected with specific conflict message; refresh/preview; apply; restore. Disk hashes exactly match the pre-apply source including external comment; Gateway model usage remains0.

Limits: direct Key and backups are plaintext local files (Windows inherited ACLs); no OS-wide lock/power-loss guarantee; source editor targets TOML1.0 and rejects unsafe unsupported shapes; project/startup configuration may override saved user config. Application is not updated/released by this PR.

AWG checked identity, map, worktree creation and selected scope paths. Terminal/file edits, test processes and GitHub CLI are outside AWG enforcement. No OS sandbox claim.

Next: Owner reviews PR #25 and chooses installation/real-client acceptance and merge. Implementation worker/coordinator follow-ups: none after current CI passes.
