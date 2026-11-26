# Revision 5 integration evidence

2026-11-26, task worktree codex-route-management-20261125. All fixtures are isolated below the task's .tmp directory. No real Codex config/authentication was read or modified and no external model provider was called.

## Final source verification

- `npm test`: Runtime **377/377 PASS**, no skipped/cancelled tests.
- `npm test` in apps/desktop: **32 files, 271/271 PASS**.
- `npm run build` in apps/desktop: TypeScript/Vite **PASS**. Final assets index-DKVWHtM6.js and index-Dg81Ws1U.css.
- `npm audit --omit=dev --json`: **0 vulnerabilities**.
- `git -c core.whitespace=cr-at-eol diff --check`: **PASS**.
- Native/protocol/UI/credential and final cross-layer independent reviews: **PASS**, all findings closed; see reviews.md.
- Logs: .tmp/codex-memory-effort-20261126/{runtime-final.log,desktop-final.log,build-final.log,audit-final.json}.

## Actual Codex request chain

Reran installed-codex-reasoning-proof.mjs on final source. Installed Codex Desktop app-server **0.167.0** loaded the native-generated Gateway catalogue: none/minimal/low/medium/high/xhigh, default medium. Three actual local SSE turns completed with high, none and no override; the upstream request and Gateway log contained high, none and medium respectively. Fixture installed-cli-tGVpsx; result installed-codex-reasoning-result.json. Zero tool executions, zero external provider calls. Conversion tests also cover every pair of Res/Mes/Chat protocols.

## Actual Electron UI and restart

Fixture electron-smoke-4N82xD, with separate userData and CODEX_HOME, synthetic routes codex-alpha/codex-beta and a legacy hash-only Key. CUA selected two models/default beta, selected the legacy credential, entered its synthetic original and explicitly saved it. The hash was checked and ciphertext retained without rotating the Key. Overview→Codex navigation and process restart restored both models, default beta and credential ID mock-key.

After the final frontend build, the restarted UI restored the same selections. Saving/enabling Gateway using stored credential ID displayed confirmation with the resolved current-user path and success feedback; the dropdown refreshed its 当前使用 marker. Disk verification found model codex-beta, provider cx_routing_gateway, all six reasoning choices/default medium, no raw Key in the preferences file, and no model requests. Native smoke processes were stopped; the user's existing app remained running.

## Responsive browser inspection

Final source browser preview inspected at **390, 816 and 1440 px**. Scope text, reasoning help, credential area, buttons and keyboard focus remained readable; document and body widths equalled each viewport width without horizontal overflow. The 390 px viewport stacks controls and wraps the scope description. The viewport override was reset afterward. Browser preview intentionally lacks the native bridge; actual dropdown operations and persistence are proven by the separate Electron smoke above.

## Boundaries

The terminal/file/UI actions were not executed through AWG MCP enforcement: its binding is the primary repository, and worktree calls reject PROJECT_ROOT_MISMATCH. The active revision5 contract and scope were checked directly. This is not an operating-system sandbox claim.

Real account login, real provider support for each reasoning value, and Owner acceptance: **NOT_RUN**. No commits, push, merge or publication for revisions2–5. PR25 remains OPEN at d1fe810529ed59455bb1854da05fa21a39d2c671; master is not updated by this task's local work.
