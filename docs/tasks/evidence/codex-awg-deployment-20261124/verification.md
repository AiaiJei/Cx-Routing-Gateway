# Codex-AWG deployment verification

Date: 2026-11-24. Task: CXRG-CODEX-AWG-DEPLOYMENT-2026-11-24.

## Result

Local deployment: **PASS**. Overall acceptance: **PARTIAL**. Independent review is **BLOCKED**; Desktop loading, Hook trust/delivery and Owner acceptance remain **NOT_RUN**.

- Repository: C:\Users\20142\Desktop\Cx-Routing Gateway, branch master.
- IDs: project_id=cx-routing-gateway; repo_id=aiaijei-cx-routing-gateway (Owner confirmed).
- Source: AiaiJei/Codex-AWG main, pinned commit d3f65d64223618626396f8f8944cc9a51d421fc4.
- Official project check: PASS for this root, IDs, task and managed files.
- Scoped plugin listing: PASS; codex-awg@codex-awg is installed/enabled at 0.1.6. The existing marketplace source is C:\Users\20142\Desktop\Codex-AWG; its origin and exact commit match the verified repository-local source. No global registration change was needed.
- Direct MCP integration: PASS (fresh final run). Official SDK, real stdio child process, version 0.1.6, 7 tools; project_status resolves the current task; map_get has 12 entries and 0 missing paths; context_get returns 3 untruncated files. scope_check accepts the task contract path and returns SCOPE_DENIED for services/gateway/src/server.mjs. See mcp-verification.json.
- Legacy removal: PASS. The roots .agent-workspace-governance, .agents/skills/ui-ux-pro-max and plugins/awg-codex are absent. Their 14 archived files match every preflight byte count and SHA-256 in preflight.json.
- Previous active task: PASS. The archived pointer SHA-256 is b998ee30958acfc5996626ee8070052b969b5fdca6b49b1d0783fa82537a9e58, identical to preflight.
- Git integration: master and origin/master remain at 49c9a389d58b2e5bdb02554d559989ed7fb07596. Changes remain local, uncommitted and unpushed. The modified preexisting .tmp-awg-source checkout and its reference directories are preserved.
- Whitespace: git -c core.whitespace=cr-at-eol diff --check PASS.
- Fresh final source test: npm test in .tmp-codex-awg-source PASS, 58/58, 0 failed, 0 skipped. The earlier npm ci --ignore-scripts also passed with zero reported vulnerabilities. Gateway application tests were not rerun because its source was not changed.
- Final self-review: PASS for alignment across repository identity, active task, pinned source, MCP binding, rollback instructions, evidence hashes and acceptance boundaries. This is the primary agent's review; it does not replace the separately blocked independent review.
- Independent final review: **BLOCKED**. The read-only reviewer agent failed before producing a verdict because the CC Switch proxy returned HTTP 400 unsupported_feature for /responses. See independent-review.json.

## Evidence boundaries and known limitations

The init command, file/archive changes and Git commands ran through the terminal. They were authorized by the Owner request and task contract; they were not confined or approved by AWG MCP/Hook enforcement. Only the recorded direct MCP calls exercised AWG tool validation. Skills, MCP and Hooks do not sandbox arbitrary terminal commands.

Desktop loading, Hook review/trust and real delivery, and Owner acceptance: **NOT_RUN**. The Owner's next step is to open a new session in this exact trusted repository, confirm AWG tools/Skills are present and review current Hook commands before deciding trust. Existing current-session tool availability is not evidence that the newly added project MCP has been loaded.

The preexisting cx-bootstrap-local marketplace points to a directory without a supported manifest and breaks unfiltered plugin listings. The scoped codex-awg listing passes. This unrelated registration is preserved. Source plugin.json reports 0.1.6 while .codex-plugin/plugin.json reports 0.1.4; upstream is preserved, and both the installed CLI entry and direct server handshake report 0.1.6.

.codex/config.toml and .awg/install.json contain host-specific paths and are locally ignored by the official installer through .git/info/exclude. The repository-local .tmp-codex-awg-source directory is retained because the project MCP config points into it. Do not move or remove it without rebinding the project.

## Rollback

Only if rollback is requested, run the pinned plugin's project.mjs rollback with the same root/IDs. It validates managed hashes before removing its unchanged blocks/config; modified project data is preserved. Restore .codex/awg-task.json byte-for-byte from previous-active-awg-task.json and, if required, move legacy-deployment contents back to the corresponding original paths. Leave the preexisting global codex-awg installation and both source checkouts intact.

## Revision 2 worktree verification

- Task branch/worktree: `codex/codex-awg-deployment-2026-11-24` at `.tmp/worktrees/codex-awg-deployment-2026-11-24`, based on current `origin/master` `49c9a389d58b2e5bdb02554d559989ed7fb07596`.
- Official project check: PASS for the exact task worktree root and IDs.
- Codex-AWG source tests: `npm test` PASS, 58/58.
- Direct official SDK MCP integration: PASS in the task worktree; 0 missing map paths; scope probe rejects Gateway source writes. See `worktree-mcp-verification.json`.
- Transfer: 26 task files verified by byte count and SHA-256. The base pointer matched the archived old pointer hash before the authorized replacement. See `worktree-transfer-manifest.json`.
- The first diagnostic probe returned `PROJECT_ROOT_MISMATCH` because the test passed a slash-form root string rather than the Windows canonical root. Re-running with the canonical root returned by `realpath()` passed; no plugin source change was needed.
- Commit, review, PR, merge and primary worktree sync: IN_PROGRESS. Desktop Hook trust/runtime remains NOT_RUN.
