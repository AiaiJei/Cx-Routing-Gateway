# Independent reviews

## Native Task 1 — 28f849c
- Verdict: needs fixes. Important: default TOML full reserialization changes unrelated float/negative-zero/time values and rejects 64-bit integers. Minor: explicit loopback port 80 is normalized away by URL and rejected.
- Reviewer inspected the task diff, spec and report, then ran only read-only parser/URL probes. Coordinator independently reproduced the integer/float issue.
- Fix round 1 assigned to native implementer: preserve unrelated source spans through a maintained TOML AST, cover numeric/date/dotted/quoted/inline-table cases and port 80.

## Renderer Task 2 — 6a8b3d9
- Verdict: needs fixes. Important: a late workspace refresh invalidates the shared operation sequence while apply/create/restore is pending, suppressing its result and busy-state cleanup.
- Reviewer reproduced with an in-memory React hook harness. No user files or provider calls.
- Fix round 1 assigned to renderer implementer: gate native actions through both refreshes, separate mutation lifecycle from preview invalidation, and retain newly created Key scope/result through route changes.

## Scope revision
Ruling: source-span TOML editing replaces whole-file serialization to honor unrelated configuration preservation, including numeric types and timestamp precision. A maintained AST parser is an added runtime dependency; the cost is a focused editor module and dependency footprint. Managed fields are rewritten; unrelated source is retained. This remains the original task boundary.

## Task re-reviews — 2070197 / e9a639e
- Native: PASS. Both original findings addressed; source-range probes cover root/standard/dotted/inline tables and comments. No new blocking findings.
- Renderer: PASS. Original in-memory reproduction now returns committed revision, clears Key/busy/confirmation and shows success. No new Critical/Important/Minor findings in fix.

## Whole-branch review — 2070197
- One P2: Electron only serializes Error.message, while stable native codes were custom properties. The renderer therefore displayed generic retry text for config conflicts. Actual isolated Electron reproduced this with a harmless external edit after preview; file preserved.
- No further blocking findings in source preservation, backups/restart state, path/auth boundaries, local Key validation or packaging dependency wiring.
- Final fix assigned: sanitized IPC message includes stable code; test message-only reconstruction and unknown error sanitization. Re-review pending.
- Final re-review6776c8f: PASS. Sanitization precedes stable-code serialization; known codes survive, unknown raw text is hidden. No new findings. Actual final Electron smoke then confirmed specific conflict message.
- Minor documentation corrected: new parser dependency requires Node22.13+, matching README; CI uses24 and Electron45 unaffected.
