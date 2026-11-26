# Revision5 acceptance
2026-11-26. User asks remembered Gateway selections, working Codex reasoning options/request field, explicit config scope and existing credential selector.

| Requirement | Evidence required | State |
|---|---|---|
| Model/default/credential choices survive navigation/restart/direct mode | Native tests, UI race/remount tests, actual Electron restart and two-launch Desktop Portable smoke | PASS |
| Draft persistence never auto-applies or stores Key | Strict disk schema/redaction and visible save status tests; actual disk inspection | PASS |
| Codex reasoning selector/options | Installed Codex0.167 model/list: six choices, default medium | PASS |
| Effort is present in actual forwarded request | Actual isolated Codex→Gateway→SSE fixture: high/none/defaultmedium; all nine protocol pairs tested | PASS (local fixture) |
| Current-user scope clear at setup/confirmation | Actual Electron resolvedpath/confirmation; browser390/816/1440px | PASS |
| Select/reuse current/existing Key and retain legacy original | Encrypted control/native regressions; actual dropdown legacy retain and ID apply | PASS |
| Revoke/rotate/scope/legacy/concurrency/errors safe | Control/native/UI tests; independently rechecked mutation fencing and post-commit reconciliation | PASS |
| Full regression/build/reviews | Runtime377/377, Desktop271/271, build, audit0, diff, final independent review | PASS |
| Separate local candidate, original data retained | Desktop Memory Test, matching SHA256; two-launch persistence;6livefiles+3oldexes unchanged | PASS |
| Real login/provider support and Owner acceptance | Owner uses their own Codex/provider after delivery | NOT_RUN |

Baseline at revision4 uncommitted source; before snapshot stored in ignored .tmp/codex-memory-effort-20261126/before.json. No actual user Codex config/auth or provider calls during development. Real upstream acceptance remains NOT_RUN. Version1.1.10, PR25/main unchanged; local edits remain uncommitted/unpushed.

Implementation and local delivery complete. Overall acceptance remains PARTIAL until Owner retest. See integration.md and delivery.md for concrete evidence and boundaries.
