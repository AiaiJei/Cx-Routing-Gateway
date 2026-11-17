# AWG-MCP-BOUNDARY-2026-11-18

- Project: Cx-Routing Gateway
- Repository: `AiaiJei/Cx-Routing-Gateway`
- Task: bind the AWG Repo MCP process to its installed project and verify its configured Aider package before dispatch.
- Contract: `.codex/awg-task.json`, revision 4; state `implementing` until PR review and merge complete.
- Authorized scope: project contract and instructions, Repo MCP configuration/runtime files, Repo Map guidance, README security claims, AWG batch evidence, this record, and focused regression tests.
- Owner authorization: user said “执行” in response to the proposal to add backend trust and project-boundary hardening to PR #1, then re-review and merge.

## Plan

1. Add failing tests for rejecting a second Git repository before reading its configuration, rejecting a changed backend package, and rejecting an external cache path.
2. Generate a per-project plugin MCP binding containing the exact project root, workspace ID, backend path, and backend fingerprint; resolve Repo Map root and cache paths relative to `.codex` so the install remains relocatable.
3. Verify those values before reading project configuration or importing the backend, then delegate using the validated parsed configuration.
4. Regenerate the Codex projection with the guarded AWG updater, run focused and full regression checks, and compare installed hashes and rollback batches.
5. Obtain an independent review, update PR #1, verify GitHub merge readiness, and merge only after the review is clean.

## Acceptance

- Foreign `project_root` is rejected before opening that repository’s config.
- Backend path and content must match the startup-bound values.
- Existing Repo MCP operations and refresh policy remain covered by regression tests.
- Native Codex Desktop loading, Hook delivery, and Owner acceptance remain separate runtime checks and must retain `NOT_RUN` if not observed.

## Rollback

The final update check batch is `20261118-052846-76b77647` (zero file operations); rollback it first, then `20261118-052524-d3d02697` (four final runtime replacements), then `20261118-042539-eaf05845`, to restore the original deployment state. Batch `20261118-041936-e3470359` was a temporary staging-root test; the subsequent batch preimage hashes match its recorded previous hashes, confirming it was rolled back before the final-root update. Preserve the original deployment batch `20261118-032407-94037da0` and task contract. No user-level Codex settings or unrelated workspace changes are in scope.

## Verification Evidence

- `python -m unittest discover -s tests -p "*_tests.py" -v`: 62 passed, 1 skipped because the isolated Aider 0.86.2 test backend is not provisioned in the upstream checkout.
- `python -m unittest tests/test_awg_mcp_project_binding.py -v`: 5 passed, covering foreign-root rejection before foreign config reads, backend path and content binding, external cache rejection, and process-root configuration.
- `pwsh -NoProfile -File tests/projection.tests.ps1`: passed.
- `pwsh -NoProfile -File tests/verification.tests.ps1`: passed.
- AWG installer update dry-run: passed with zero conflicts; post-update `-Check`: all 160 manifest entries kept; independent SHA-256 comparison: 160 matched, 0 missing, 0 mismatched.
- `python tools/codex_host.py --smoke-repo <disposable project>`: direct subprocess MCP checks passed, including `foreign_project_root_rejected`; native Desktop activation remains `NOT_RUN`.
- `git diff --check` uses `core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol` because installer batch JSON preserves Windows CRLF bytes covered by its hashes.

## CAPABILITY

- Invoked: `using-superpowers`, `awg-workspace-governance`, `awg-repo-map` (reviewed its invocation rules; live AWG Repo MCP tools were unavailable), `receiving-code-review`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `verification-before-completion`, and `requesting-code-review`.
- Relevant but not invoked: `dispatching-parallel-agents` (single cohesive security boundary; independent review is requested separately), `executing-plans` (no existing plan was being executed), `finishing-a-development-branch` (applied after review), `writing-plans` (bounded fix and acceptance were recorded in this task record), and `openai-docs` (no Codex product behavior claim is used as implementation evidence).
- Not relevant: frontend/design, document, PDF, presentation, spreadsheet, image-generation, visualization, skill-creation/installation, and computer-use skills; this change has no UI or document artifact.
- MCP calls: none; the `awg_repo` MCP namespace is unavailable in this continuation. Validation used repository source, tests, installer evidence, and direct subprocess MCP smoke.
- Runtime evidence limits: native Codex Desktop plugin load, Skill invocation, GUI MCP connection, hook delivery, project-agent dispatch, and Owner acceptance are `NOT_RUN`.

## Capability

- Skills read/applied: `using-superpowers`, `awg-workspace-governance`, `receiving-code-review`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `verification-before-completion`, and `requesting-code-review`.
- Repo MCP: not available in the current tool catalog; used source/tests and the upstream test suite instead.
- Current-session hash binding: `NOT_RUN`; no session ID is exposed to this task. The project hook remains a partial guardrail.
- Native Codex Desktop plugin/Skill/MCP/Hook/agent delivery: `NOT_RUN`.
