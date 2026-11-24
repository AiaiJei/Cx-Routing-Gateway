# Codex-AWG Deployment Plan

- Task: `CXRG-CODEX-AWG-DEPLOYMENT-2026-11-24`, contract revision 2.
- Project/repository: `Cx-Routing Gateway` / `AiaiJei/Cx-Routing-Gateway`.
- Exact Git root: `C:\Users\20142\Desktop\Cx-Routing Gateway`; branch `master`, HEAD `49c9a389d58b2e5bdb02554d559989ed7fb07596`.
- Stable IDs confirmed by the Owner: `project_id=cx-routing-gateway`, `repo_id=aiaijei-cx-routing-gateway`.
- Source: `AiaiJei/Codex-AWG`, `main` at `d3f65d64223618626396f8f8944cc9a51d421fc4`. `plugins/codex-awg/plugin.json` says 0.1.6 while `.codex-plugin/plugin.json` says 0.1.4; leave upstream source unchanged and record the version reported by the installer.
- Source verification already completed: `npm ci --ignore-scripts` succeeded with 0 reported vulnerabilities; `npm test` passed 58/58.

## Scope and ownership

Install the local Codex-AWG plugin from the exact source checkout, initialize this repository with its project/repository identity, archive only the identified legacy deployment residue, and record verification. The primary agent owns all writes. A read-only final configuration review was requested per the staged repository workflow; the reviewer could not start because its CC Switch proxy returned HTTP 400. This remains BLOCKED and no independent verdict is claimed. Do not edit Gateway application code, credentials, unrelated Codex marketplaces/configuration, the modified `.tmp-awg-source` checkout, branches, worktrees, commits, pushes, merges, or releases. The repository-local source checkout remains available because the generated project MCP config references it. The preexisting global marketplace continues to reference the clean Desktop\Codex-AWG checkout at the same commit.

## Execution

- [x] Confirm repository root, branch, identity source, existing task pointer, legacy paths, and target-path collisions.
- [x] Clone the requested upstream repository to the previously absent `.tmp-codex-awg-source` path and pin the checkout at `d3f65d64223618626396f8f8944cc9a51d421fc4`.
- [x] Install source development dependencies without lifecycle scripts and run the upstream test suite: 58/58 passed.
- [x] Preserve the existing root task pointer in this evidence directory; create a new task contract and make it the active `.codex/awg-task.json` contract.
- [x] Verify that Codex already has `codex-awg` 0.1.6 enabled from a clean checkout of the same upstream remote and exact commit; reuse it and make no global marketplace changes. The scoped plugin listing passed; the unrelated `cx-bootstrap-local` error remains isolated.
- [x] Run the official `scripts/project.mjs init` from the freshly verified source checkout against the exact Git root and confirmed IDs.
- [x] Move the old Repo Map cache and orphaned legacy AWG bytecode directories into this evidence archive; preserve `.tmp-awg-source` and its dirty/reference content.
- [x] Run the official `check`, verify project config and install record, check the plugin listing, and confirm no legacy runtime paths remain active.
- [x] Record final Git state and distinguish CLI installation from Desktop hook trust/runtime acceptance.

## Acceptance

`project.mjs check` returns PASS for the exact root and IDs; `.codex/config.toml` binds the MCP server to that root, IDs, and retained local plugin source; the preinstalled plugin is verified at the pinned source commit; old runtime residue is absent from its active discovery paths and retained in the archive; the new task contract remains valid; and repository-local changes are limited to this task. Desktop hook trust and behavior remain `NOT_RUN` unless directly observed in the app.

## Rollback

Run the pinned plugin's `scripts/project.mjs rollback` with the same root and IDs; restore `.codex/awg-task.json` from `previous-active-awg-task.json`; move archived legacy paths back only if a rollback is requested. The already-installed global plugin predates this task, so leave it and all marketplace entries untouched. Preserve both source checkouts.

## Verified local result and host handoff

Local deployment: **PASS**. Official project check and the enabled-plugin listing pass. A real stdio process launched with the official MCP SDK reports version 0.1.6, lists 7 tools, resolves the correct active task, returns 12 project-map entries with no missing paths, and reads the 3 selected context files without truncation. The task scope accepts its deployment-contract path and rejects Gateway source changes. All 14 archived legacy files match the preflight size and SHA-256; the 3 old runtime roots are absent. The original task pointer hash matches its archive.

Overall acceptance: **PARTIAL**. Codex Desktop loading in a new trusted repository session, current Hook definition review/trust, real Hook delivery, and Owner acceptance remain **NOT_RUN**. The Owner should open a new session for this exact repository, confirm the Codex-AWG tools and Skills are available, and review Hook commands before deciding trust. Direct SDK verification does not establish any of these host outcomes. A fresh `npm test` run passed 58/58. Primary-agent final self-review passed for consistency of identity, binding, rollback and evidence records; the separately attempted independent review remains blocked.

The existing unrelated cx-bootstrap-local marketplace still makes unfiltered plugin listing fail; the scoped codex-awg listing passes. No unrelated marketplace changes are part of this task. Independent review was attempted but is BLOCKED: the reviewer agent failed at the CC Switch proxy with HTTP 400 unsupported_feature before producing a verdict. See independent-review.json; no independent review success is claimed.

The deployment is in the primary master working directory and remains uncommitted/unpushed. No application-source or release change is included. Full results and rollback details are recorded in docs/tasks/evidence/codex-awg-deployment-20261124/verification.md.

## Revision 2: dedicated PR and primary worktree integration

On 2026-11-24 the Owner directly authorized one dedicated commit/PR, push, merge into `master`, and synchronization of the primary worktree. Branch: `codex/codex-awg-deployment-2026-11-24`; task worktree: `.tmp/worktrees/codex-awg-deployment-2026-11-24`; base: current `origin/master` at `49c9a389d58b2e5bdb02554d559989ed7fb07596`. Only deployment identity, Rules, map/context, active task pointer, deployment plan/contract and evidence are in scope. Exclude `.tmp-codex-awg-source`, `.tmp-awg-source`, `.codex/config.toml`, `.awg/install.json`, credentials, unrelated worktrees, app code, releases and binaries. Keep the task branch/worktree after the PR; branch/worktree deletion is not authorized.

- [x] Update the repository-local ignore rule for `.tmp/worktrees/` and create the dedicated branch/worktree.
- [x] Transfer only the authorized task files and validate their content/hashes. The preexisting active pointer was replaced only after its bytes matched the archived previous pointer hash.
- [x] Run source tests (58/58), official project check and direct stdio MCP integration on the task worktree.
- [ ] Commit the reviewed scope and push the dedicated branch.
- [ ] Obtain a read-only independent review after commit and inspect PR checks.
- [ ] Merge the dedicated PR and fast-forward/synchronize the primary `master` worktree.
- [ ] Preserve the task worktree and branch; record final integration evidence.
