---
name: awg-workspace-governance
description: Required for repository work and deployment in an AWG-governed Codex project. Apply project scope, capability, verification, evidence and rollback rules.
---

# AWG Workspace Governance

Use this Skill before inspecting or changing repository files, running project commands, or preparing a deployment in an AWG-governed Codex project.

1. Read the applicable project `AGENTS.md` and inspect `.codex/awg-task.json`. Confirm the task identity, state and authorized paths before writing. An idle or missing contract does not grant write scope.
2. Inspect the current session's complete Skill catalog and relevant MCP/tool catalog. Invoke every relevant Skill before its workflow stage. Record the exact invocation or mark it `NOT_RUN`/`UNAVAILABLE` with a reason; do not infer live availability from project files. If duplicate Superpowers entries cannot be distinguished by provider, report `BLOCKED: AMBIGUOUS_SUPERPOWERS_PROVIDER` before repository writes.
3. Before an MCP workflow, inspect the connected server and tool names. Use `awg_repo` only for this registered project and only when its live tools materially help. Read source files and run tests for important claims; the Repo Map is an index, not complete impact analysis.
4. Before deployment, verify the target repository, project trust, generated manifest, conflicts, target hashes and rollback batch. Run dry-run, install, post-install check and rollback only where authorized. Never infer Desktop plugin, MCP, hook or agent activation from static files or CLI checks.
5. Return a `CAPABILITY` record covering Skill triage and invocations, MCP decisions/calls, unavailable capabilities, verification results and remaining runtime gaps.

If this Skill is not available in the current session, report `BLOCKED: AWG_PLUGIN_UNAVAILABLE` before repository writes or deployment. State that project instructions remain available as context, but do not claim the plugin was invoked or loaded.

Hooks are partial guardrails, not a process sandbox. Do not claim they govern arbitrary shell writes or MCP side effects. Preserve `NOT_RUN`, `PARTIAL`, `BLOCKED` and `DEGRADED` where evidence is incomplete.
