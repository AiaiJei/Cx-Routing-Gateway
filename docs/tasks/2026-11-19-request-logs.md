# CXRG-REQUEST-LOGS-2026-11-19

Project/repo: Cx-Routing Gateway / AiaiJei/Cx-Routing-Gateway. Contract: .codex/awg-task.json. Base: merged PR #6 6acebc9. Branch: codex/request-logs-1.0.2. Worktree: .worktree/request-logs-1.0.2.

Plan: docs/superpowers/plans/2026-11-19-request-logs-1.0.2.md. Design: docs/superpowers/specs/2026-11-19-request-logs-design.md.

## Progress
- Inspected live PR #6 MERGED, local and origin/master equal merge SHA; fresh branch/path did not exist. Existing untracked primary worktree contents preserved.
- User detailed change request authorizes implementation and dedicated PR; process approvals not re-requested. Inline implementation with one independent reviewer.
- Native create_worktree placed checkout outside requested repo. Before edits relocated this fresh checkout via git worktree move to required in-repo .worktree/request-logs-1.0.2 and attached it. Local Git exclude protects task scratch/worktree; no unrelated paths cleaned.
- Preserved PR #6 contract verbatim in docs/tasks/2026-11-19-pr6-contract.json; new task contract has no prior merge or cleanup authorization.
- Preflight: runtime observer → stored usage → adapter → typed UI; optional fields allow old records. Repository has no existing tooltip/popover; new shared Tooltip warranted.

## CAPABILITY
Skills read/invoked: using-superpowers, awg-workspace-governance, brainstorming (direct change request), using-git-worktrees, writing-plans, executing-plans, test-driven-development + writing-good-tests, design-taste-frontend app screens (existing PR #6 design retained). Will invoke verification-before-completion/requesting-code-review/finishing before their stages.
Repo MCP: live awg_repo tools enumerated. NOT_RUN: registered workspace identity unavailable in project config, bounded direct source reads more useful for this known entry. No runtime/plugin activation inferred from static files.
Tools: exec/gh/git available, native worktree create+attach exercised. Browser/independent review pending. Temporary evidence in .task-evidence; task records tracked.

## Verification
Pending. Owner acceptance pending; real provider/native installer/publish NOT_RUN.

### Implementation findings
- Runtime JSON/SSE tests first failed for missing stream metadata; observer and Gateway instrumentation now pass. Test teardown initially raced a final credential write; retain scoped temp evidence and await store.writeQueue after closing test servers.
- Ruling: cross-protocol requests previously dropped stream=true in outboundBody, proven by an upstream fixture honoring the flag. Forward it explicitly and request Chat stream_options.include_usage so providers can return usage. This is necessary to collect the requested real stream metrics; existing response conversions stay intact.
- Version-bound Settings/release fixtures still expected 1.0.1, causing full-suite failures after the bump; update both to 1.0.2 within the version scope.
- Implementation remains in this worktree; no user runtime/config/provider requests.

## Independent review and resolution
Reviewer: fresh-context gpt-6-astra/high, read-only whole branch (base 6acebc9). Initial verdict With fixes, no Critical finding or body persistence leak.

- P2: Tooltip closed when clicking request ID. Browser reproduced click falling through; regression `keeps selectable details open when pointer focus moves into the floating panel` failed, then passed with focus staying inside the portal and Escape restoring the trigger. Keyboard Tab/Enter/Escape test also passes.
- P2: Reported total stayed stale after component-only usage update. Regression 10+1=11 then output=3 first failed (11), then passed (13) after invalidating a total when its components change.
- P2: Mes total treated missing/invalid cache counts as zero. Regression first failed (16), then passed (unknown) after requiring known cache components for derived Mes totals.
- Release check note regraded as dependency-integrity risk: request-metrics.mjs is now an unconditional Gateway import; an incomplete package cannot start. Added it to required release artifacts and proved a missing module is rejected (RED→GREEN).
- No deferred actionable findings. Fixes verified by regression and full suites; no redundant second whole-branch review.

Rulings on reviewer boundaries:
- Real-provider compatibility of Chat include_usage remains NOT_RUN. Standard Chat streaming usage is requested to satisfy logged token counts; provider-specific compatibility is a remaining acceptance limit, and no automatic retry of a charged request is introduced.
- Existing cross-protocol SDK transformation scope is unchanged apart from forwarding stream=true. Existing full runtime regression passed; this is not proof of every SDK/provider.
- Deprecated Chat function_call and Responses custom-tool/audio-only generation events remain unmeasured for TTFT; UI displays —. Standard text/refusal/reasoning/function-tool streams are covered. Unknown events never get a fabricated time.
- Native installer was not requested; screenshot evidence is real-browser fixture mode, not a native runtime or real-provider acceptance claim.

## Final verification (2026-11-19)
- `npm test`: 72/72 passed, including bounded SSE, zero/invalid/missing counters, stale totals, Mes cache accounting, Gateway→Control JSON/SSE usage, same/cross-protocol stream forwarding, failure type, and release dependency validation.
- `npm test --prefix apps/desktop`: 61/61 passed (18 files), including adapter compatibility, search/filter/detail, accessible disclosures, pointer/keyboard behavior, shell navigation and version display.
- `npm run build --prefix apps/desktop`: PASS (TypeScript + production Vite build).
- `npm audit --prefix apps/desktop --omit=dev --ignore-scripts --allow-scripts=`: 0 vulnerabilities.
- `git -c core.whitespace=cr-at-eol diff --check`: PASS.
- Taste app lint: 0 FAIL / 2 WARN, both intentional: shadow on the floating tooltip; em dash is the requested truthful missing-data marker. Existing PR #6 style retained; no random redesign.
- Real browser via CUA: 1440×900, 768×1024, 390×844. Document widths exactly match viewport; at 1440 all columns fit; at 768/390 only table scrolls horizontally. At 390 token popup x32..382 remains in viewport, outside the table's clipping. Checked request ID, full protocol, token details, Escape, pointer focus and detail Modal. Viewport reset after verification.
- Browser screenshots tracked under `docs/tasks/evidence/request-logs-1.0.2/`. They contain clearly marked fixtures. The local preview remains at http://127.0.0.1:4182/#/logs.

## CAPABILITY final
Invoked requesting-code-review, verification-before-completion and finishing-a-development-branch; systematic-debugging used for observed failures. CUA browser capability exercised for DOM, viewport and screenshots; manual responsive inspection substituted for taste inspect.mjs to follow the available browser-control interface. Computer-use Windows instructions were read; native Windows automation NOT_RUN. No new dependencies. Development dependency advisories remain outside the production-only audit claim.

Task 1: complete. Task 2: complete. Verification and independent review: complete. Integration choice already supplied by user: commit/push dedicated branch and create PR against master. No merge, release, native installer, provider request or worktree cleanup authorized in this task. Owner acceptance remains pending.
