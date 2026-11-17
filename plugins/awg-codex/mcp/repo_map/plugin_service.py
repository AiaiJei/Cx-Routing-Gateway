"""Project-bound adapter for the plugin-bundled AWG Repo MCP."""
import json
from pathlib import Path
import tomllib

from .errors import RepoMapError
from .schema import TOOL_SCHEMAS
from .service import RepoMapService, _git_root


PLUGIN_TOOL_NAMES = tuple(TOOL_SCHEMAS)
PROJECT_ROOT = {
    "type": "string", "minLength": 1, "maxLength": 400,
}


def plugin_tool_schemas() -> dict:
    """Return copies of the existing schemas with an explicit project root."""
    schemas = {}
    for name, schema in TOOL_SCHEMAS.items():
        value = json.loads(json.dumps(schema))
        properties = value.setdefault("properties", {})
        properties["project_root"] = PROJECT_ROOT
        value["required"] = ["project_root", *value.get("required", [])]
        schemas[name] = value
    return schemas


def _read_project_config(root: Path) -> tuple[dict, dict]:
    repo_map_path = root / ".codex/repo-map.json"
    config_path = root / ".codex/config.toml"
    for path in (repo_map_path, config_path):
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 65_536:
            raise RepoMapError("CONFIG_INVALID", f"project configuration is missing, symlinked, or oversized: {path.name}")
    try:
        repo_map = json.loads(repo_map_path.read_text(encoding="utf-8-sig"))
        config = tomllib.loads(config_path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError, tomllib.TOMLDecodeError):
        raise RepoMapError("CONFIG_INVALID", "project Repo Map or Codex config is invalid") from None
    return repo_map, config


def _resolve_project(arguments: dict) -> tuple[Path, str, dict, set[str]]:
    raw_root = arguments.get("project_root")
    if not isinstance(raw_root, str) or not raw_root.strip():
        raise RepoMapError("INVALID_INPUT", "project_root is required")
    root = Path(raw_root).expanduser().resolve()
    if not root.is_dir() or _git_root(root) != root:
        raise RepoMapError("PROJECT_ROOT_INVALID", "project_root must be an existing Git worktree root")
    repo_map, config = _read_project_config(root)
    workspaces = repo_map.get("workspaces")
    if not isinstance(workspaces, list) or len(workspaces) != 1 or not isinstance(workspaces[0], dict):
        raise RepoMapError("CONFIG_INVALID", "project Repo Map config must register exactly one workspace")
    workspace = workspaces[0]
    if workspace.get("root") != str(root):
        raise RepoMapError("CONFIG_INVALID", "project Repo Map root does not match project_root")
    workspace_id = workspace.get("workspace_id")
    if not isinstance(workspace_id, str) or not workspace_id.strip():
        raise RepoMapError("CONFIG_INVALID", "project Repo Map workspace_id is required")
    plugins = config.get("plugins", {})
    if not isinstance(plugins, dict):
        raise RepoMapError("CONFIG_INVALID", "Codex plugins config must be a table")
    plugin = plugins.get("awg-governance@awg-local", {})
    if not isinstance(plugin, dict):
        raise RepoMapError("CONFIG_INVALID", "AWG plugin config must be a table")
    mcp_servers = plugin.get("mcp_servers", {})
    if not isinstance(mcp_servers, dict):
        raise RepoMapError("CONFIG_INVALID", "plugin mcp_servers config must be a table")
    policy = mcp_servers.get("awg_repo", {})
    if not isinstance(policy, dict):
        raise RepoMapError("CONFIG_INVALID", "plugin awg_repo config must be a table")
    if plugin.get("enabled") is not True or policy.get("enabled") is not True:
        raise RepoMapError("PLUGIN_MCP_DISABLED", "AWG plugin Repo MCP is disabled in project policy")
    enabled_tools = policy.get("enabled_tools")
    if not isinstance(enabled_tools, list) or any(not isinstance(item, str) for item in enabled_tools):
        raise RepoMapError("CONFIG_INVALID", "plugin awg_repo enabled_tools must be a string array")
    return root, workspace_id, repo_map, set(enabled_tools)


class PluginRepoMapService:
    """Resolve a project on every call, then delegate to the bounded service."""

    def call(self, name: str, arguments: dict) -> dict:
        if name not in PLUGIN_TOOL_NAMES:
            raise RepoMapError("INVALID_INPUT", f"unknown tool: {name}")
        if not isinstance(arguments, dict):
            raise RepoMapError("INVALID_INPUT", "tool arguments must be an object")
        root, workspace_id, repo_map, enabled_tools = _resolve_project(arguments)
        supplied_id = arguments.get("workspace_id")
        if supplied_id != workspace_id:
            raise RepoMapError("WORKSPACE_NOT_REGISTERED", "workspace_id is not registered for project_root")
        if name not in enabled_tools:
            raise RepoMapError("TOOL_NOT_ENABLED", f"tool {name} is not enabled by project policy")
        delegate_config = root / ".codex/repo-map.json"
        delegate = RepoMapService(str(delegate_config))
        delegated = {key: value for key, value in arguments.items() if key != "project_root"}
        return delegate.call(name, delegated)
