---
name: awg-repo-map
description: Use the AWG project Repo MCP for bounded repository navigation, document search and freshness checks.
---

# AWG Repo Map

Use this skill when the current Codex session exposes the project tools awg_repo Repo Map tools. Use exact tool names shown by the live session.

1. Read `.codex/repo-map.json` for the registered `workspace_id`; never guess it. The MCP process receives this project's root at launch and rejects a different `project_root` before reading its configuration.
2. Call `repo_map_status` first. If the backend is unavailable, the map is missing, or freshness is stale, use source search/read and tests. Refresh only when the repository owner has authorized it in `.codex/repo-map.json`. Before delegation, the server verifies the launch-bound Aider package fingerprint and requires its cache to stay in this project's `.agent-workspace-governance/repo-map-awg-cache` directory.
3. Use `repo_map_get` to navigate, `repo_docs_search` and bounded `repo_docs_read` for supported text documents, and `repo_context_check` to validate previously used path/hash references.
4. Read authoritative source files and run tests before making important claims. The map omits unsupported files and is not complete impact analysis.

Do not use Repo MCP to access another repository. Do not claim a tool was available or used unless the live session confirms it.
