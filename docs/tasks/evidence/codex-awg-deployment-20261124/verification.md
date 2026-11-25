# Codex-AWG deployment verification

Date: 2026-11-24. Task: CXRG-CODEX-AWG-DEPLOYMENT-2026-11-24.

## Current result

Local deployment: **PASS**. Overall runtime acceptance: **PARTIAL**. PR #24 remains open; final-content checks pass and independent review is READY for squash merge. Merge and primary-worktree sync are pending. Desktop loading, Hook review/trust/delivery and Owner runtime acceptance remain **NOT_RUN**.

- Repository: AiaiJei/Cx-Routing-Gateway. Primary worktree is identified as `<primary-worktree>` in tracked evidence; task worktree is `.tmp/worktrees/codex-awg-deployment-2026-11-24`.
- Owner-confirmed IDs: project_id=cx-routing-gateway; repo_id=aiaijei-cx-routing-gateway.
- Source: AiaiJei/Codex-AWG main, pinned at d3f65d64223618626396f8f8944cc9a51d421fc4.
- Official project check: PASS for both bound roots, IDs, active task and managed files. A fresh task-worktree check passed after the review corrections.
- Pinned source tests: fresh `npm test` PASS, 58/58, 0 failed, 0 skipped. Initial `npm ci --ignore-scripts` also passed.
- Plugin listing: scoped listing PASS; codex-awg@codex-awg is enabled at 0.1.6 from the existing verified local source checkout. Its remote and pinned commit match the repository-local source. No global marketplace change was needed.
- Direct MCP: official SDK over real stdio PASS, version 0.1.6, 7 tools; correct task, 12 map entries/0 missing, 3 untruncated context files. In-scope contract accepted; Gateway source rejected with SCOPE_DENIED. See mcp-verification.json and worktree-mcp-verification.json. This is direct process evidence, not Desktop loading evidence.
- Legacy cleanup: the three old runtime roots are absent. All 14 local rollback payloads match preflight sizes/SHA-256. The final PR tree contains only a README under legacy-deployment; generated SQLite/bytecode payloads are omitted from that tree.
- Previous active pointer: the byte-for-byte archive matches SHA-256 b998ee30958acfc5996626ee8070052b969b5fdca6b49b1d0783fa82537a9e58.
- Transfer hashes: copied_files in worktree-transfer-manifest.json describe the initial transfer, before corrections. final_files is a separate current snapshot and excludes the manifest itself to avoid self-reference.
- Review corrections: final tree removes generated payloads and absolute workstation paths; plan explicitly states Owner revision 2 supersedes the original integration restriction. Independent review of content head cb4ae5e is READY for squash merge. The active delete grant is disabled, final-head CI evidence is refreshed, and the final PR tree is sanitized; see independent-review.json.

## CI investigation and regression checks

The push CI run 45375009198 on cecd2d9 initially failed 1 of 232 runtime tests: `Responses round trip through Messages preserves stream text, tools, and usage`, in waitForUsage (100 reads with 5 ms waits). Stream output assertions had succeeded; the request-log wait timed out. Server inspection confirms the streaming response ends before credential bookkeeping and appendUsage finish; Windows config replacement retries can also delay persistence. This identifies the failing boundary but does not establish the exact timing/storage cause of that CI occurrence.

The same-head pull_request run 45375017141 passed runtime and desktop. Rerunning only the failed job of 45375009198 passed on attempt 2, without a source change. A focused local run of the originally failing test passed. The failure was not reproduced; no Gateway application fix or root-cause completion is claimed. Earlier final-head checks at 5db5882 passed: runtime and desktop succeeded for both push run 45377363835 and pull_request run 45377370947. On content head cb4ae5e, push run 45378607297 passed runtime/desktop; pull_request run 45378616009 passed desktop and runtime on retry attempt 2. Package jobs are skipped by the existing workflow for ordinary PR/push runs.

The first full local `npm test` attempt passed 231/232 and failed because apps/desktop/dist/index.html had not been built in the fresh task worktree. After `npm ci --prefix apps/desktop` and `npm run build --prefix apps/desktop`, a fresh full `npm test` passed 232/232, 0 failed, 0 skipped. The dependency install reported 6 moderate npm audit findings; desktop CI separately runs its configured production dependency audit. This documentation-only deployment change does not modify Gateway application code.

## Integration and history boundary

Use squash merge for PR #24, then verify the merge result has the clean final tree and does not have 9692cc0 or cecd2d9 as ancestors. Earlier generated payloads remain accessible through the retained task branch and PR references; no remote erasure is claimed. Squash method was independently accepted as sufficient to avoid contaminating master history. Do not force push or delete task branches/worktrees.

Before primary master fast-forward, preserve and verify all overlapping uncommitted deployment files. Preserve unrelated preexisting work, both source checkouts, local config/install records and local rollback payloads. Record sync results separately after the merge; current master remains at base 49c9a389d58b2e5bdb02554d559989ed7fb07596 until then.

## Evidence boundaries and known limitations

Init, file/archive changes and Git operations ran through the terminal under Owner authorization and the task contract. They were not confined or approved by AWG MCP/Hook enforcement. Only the recorded direct MCP calls exercised AWG tool validation. Skills, MCP and Hooks do not sandbox arbitrary terminal commands.

Desktop loading, Hook definition review/trust, actual delivery and Owner acceptance: **NOT_RUN**. The Owner needs a new trusted session in this exact repository, confirmation of the AWG tools/Skills, and review of current Hook commands before deciding trust. Current-session availability is not evidence of loading the newly configured project MCP.

The preexisting cx-bootstrap-local marketplace lacks a supported manifest and breaks unfiltered plugin listings; scoped codex-awg listing passes. Preserve this unrelated registration. Upstream plugin.json says 0.1.6 while .codex-plugin/plugin.json says 0.1.4; source is unchanged, and the installed listing/direct handshake report 0.1.6.

Host-specific .codex/config.toml and .awg/install.json remain local and ignored through .git/info/exclude. The primary .tmp-codex-awg-source checkout is retained because local MCP config points into it. Moving it requires rebinding.

## Rollback

Only if requested, run the pinned project.mjs rollback with the same root/IDs. It validates managed hashes and preserves modified project data. Restore the previous task pointer byte-for-byte from previous-active-awg-task.json and, if needed, restore generated cache/bytecode from the primary local archive. Leave the preexisting global codex-awg installation, marketplaces and both source checkouts intact.
