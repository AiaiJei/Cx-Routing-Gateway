"""Project-bound adapter for the plugin-bundled AWG Repo MCP."""
import hmac
import json
from pathlib import Path
import re
import sys
import tomllib

from .backend import fingerprint_backend
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


def _resolve_project(arguments: dict, expected_root: Path) -> tuple[Path, str, dict, set[str]]:
    raw_root = arguments.get("project_root")
    if not isinstance(raw_root, str) or not raw_root.strip():
        raise RepoMapError("INVALID_INPUT", "project_root is required")
    try:
        root = Path(raw_root).expanduser().resolve()
    except (OSError, RuntimeError, ValueError):
        raise RepoMapError("PROJECT_ROOT_INVALID", "project_root could not be resolved") from None
    if root != expected_root:
        raise RepoMapError("PROJECT_ROOT_MISMATCH", "project_root does not match the MCP process binding")
    if not root.is_dir() or _git_root(root) != root:
        raise RepoMapError("PROJECT_ROOT_INVALID", "project_root must be an existing Git worktree root")
    repo_map, config = _read_project_config(root)
    workspaces = repo_map.get("workspaces")
    if not isinstance(workspaces, list) or len(workspaces) != 1 or not isinstance(workspaces[0], dict):
        raise RepoMapError("CONFIG_INVALID", "project Repo Map config must register exactly one workspace")
    workspace = workspaces[0]
    configured_root = workspace.get("root")
    if not isinstance(configured_root, str) or not configured_root.strip():
        raise RepoMapError("CONFIG_INVALID", "project Repo Map root is required")
    try:
        configured_path = Path(configured_root).expanduser()
        registered_root = (configured_path if configured_path.is_absolute()
                           else (root / ".codex" / configured_path)).resolve()
    except (OSError, RuntimeError, ValueError):
        raise RepoMapError("CONFIG_INVALID", "project Repo Map root is invalid") from None
    if registered_root != root:
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
    cache_value = repo_map.get("cache_dir", "../.agent-workspace-governance/repo-map-awg-cache")
    if not isinstance(cache_value, str) or not cache_value.strip():
        raise RepoMapError("CONFIG_INVALID", "Repo Map cache_dir must be a non-empty path")
    try:
        cache_path = Path(cache_value).expanduser()
        registered_cache = (cache_path if cache_path.is_absolute()
                            else (root / ".codex" / cache_path)).resolve()
        expected_cache = (root / ".agent-workspace-governance/repo-map-awg-cache").resolve()
    except (OSError, RuntimeError, ValueError):
        raise RepoMapError("CONFIG_INVALID", "Repo Map cache_dir is invalid") from None
    if registered_cache != expected_cache:
        raise RepoMapError("CACHE_PATH_NOT_REGISTERED", "Repo Map cache must stay in the project-local AWG cache")
    enabled_tools = policy.get("enabled_tools")
    if not isinstance(enabled_tools, list) or any(not isinstance(item, str) for item in enabled_tools):
        raise RepoMapError("CONFIG_INVALID", "plugin awg_repo enabled_tools must be a string array")
    return root, workspace_id, repo_map, set(enabled_tools)


class PluginRepoMapService:
    """Serve only the project and backend bound into this MCP process at launch."""

    def __init__(self, *, expected_root, workspace_id, backend_path, backend_sha256):
        try:
            raw_root = Path(expected_root).expanduser()
            raw_backend = Path(backend_path).expanduser()
            if not raw_root.is_absolute() or not raw_backend.is_absolute():
                raise ValueError("project and backend paths must be absolute")
            root = raw_root.resolve()
            backend = raw_backend.resolve()
        except (OSError, RuntimeError, TypeError, ValueError):
            raise RepoMapError("CONFIG_INVALID", "MCP project or backend binding is invalid") from None
        if not root.is_dir():
            raise RepoMapError("CONFIG_INVALID", "MCP project binding must identify an existing absolute directory")
        if not isinstance(workspace_id, str) or not workspace_id.strip():
            raise RepoMapError("CONFIG_INVALID", "MCP workspace ID binding is required")
        if not backend.is_absolute():
            raise RepoMapError("CONFIG_INVALID", "MCP backend binding must be an absolute path")
        if not isinstance(backend_sha256, str) or re.fullmatch(r"[0-9a-f]{64}", backend_sha256) is None:
            raise RepoMapError("CONFIG_INVALID", "MCP backend fingerprint binding is invalid")
        self.expected_root = root
        self.workspace_id = workspace_id
        self.backend_path = backend
        self.backend_sha256 = backend_sha256

    @classmethod
    def from_environment(cls, expected_root, environment=None):
        import os

        source = os.environ if environment is None else environment
        configured_root = source.get("AWG_PROJECT_ROOT")
        if not isinstance(configured_root, str) or not configured_root.strip():
            raise RepoMapError("CONFIG_INVALID", "MCP project root binding is missing")
        try:
            configured_root_path = Path(configured_root).expanduser()
            if not configured_root_path.is_absolute():
                raise ValueError("project root must be absolute")
            configured_root_path = configured_root_path.resolve()
            requested_root_path = Path(expected_root).expanduser()
            if not requested_root_path.is_absolute() or requested_root_path.resolve() != configured_root_path:
                raise ValueError("project root does not match the process binding")
        except (OSError, RuntimeError, TypeError, ValueError):
            raise RepoMapError("CONFIG_INVALID", "MCP project root binding is invalid") from None
        backend_path = source.get("AWG_BACKEND_PATH")
        backend_sha256 = source.get("AWG_BACKEND_SHA256")
        if not isinstance(backend_path, str) or not backend_path.strip():
            raise RepoMapError("CONFIG_INVALID", "MCP backend path binding is missing")
        if not isinstance(backend_sha256, str) or not backend_sha256.strip():
            raise RepoMapError("CONFIG_INVALID", "MCP backend fingerprint binding is missing")
        root = configured_root_path
        repo_map, _config = _read_project_config(root)
        workspaces = repo_map.get("workspaces")
        if not isinstance(workspaces, list) or len(workspaces) != 1 or not isinstance(workspaces[0], dict):
            raise RepoMapError("CONFIG_INVALID", "project Repo Map config must register exactly one workspace")
        registered = workspaces[0]
        configured_root = registered.get("root")
        if not isinstance(configured_root, str) or not configured_root.strip():
            raise RepoMapError("CONFIG_INVALID", "project Repo Map root is required")
        configured_path = Path(configured_root).expanduser()
        registered_root = (configured_path if configured_path.is_absolute()
                           else (root / ".codex" / configured_path)).resolve()
        if registered_root != root:
            raise RepoMapError("CONFIG_INVALID", "project Repo Map root does not match the installed plugin root")
        return cls(
            expected_root=root,
            workspace_id=registered.get("workspace_id"),
            backend_path=backend_path,
            backend_sha256=backend_sha256,
        )

    def call(self, name: str, arguments: dict) -> dict:
        if name not in PLUGIN_TOOL_NAMES:
            raise RepoMapError("INVALID_INPUT", f"unknown tool: {name}")
        if not isinstance(arguments, dict):
            raise RepoMapError("INVALID_INPUT", "tool arguments must be an object")
        # Never create mutable Python bytecode while loading the pinned backend.
        sys.dont_write_bytecode = True
        root, workspace_id, repo_map, enabled_tools = _resolve_project(arguments, self.expected_root)
        if arguments.get("workspace_id") != self.workspace_id or workspace_id != self.workspace_id:
            raise RepoMapError("WORKSPACE_NOT_REGISTERED", "workspace_id is not registered to this MCP process")
        if name not in enabled_tools:
            raise RepoMapError("TOOL_NOT_ENABLED", f"tool {name} is not enabled by project policy")
        configured_backend = repo_map.get("backend_path")
        configured_fingerprint = repo_map.get("backend_sha256")
        try:
            backend_path = Path(configured_backend).expanduser().resolve()
        except (OSError, RuntimeError, TypeError, ValueError):
            raise RepoMapError("BACKEND_NOT_REGISTERED", "configured Repo Map backend does not match this MCP process") from None
        if backend_path != self.backend_path or configured_fingerprint != self.backend_sha256:
            raise RepoMapError("BACKEND_NOT_REGISTERED", "configured Repo Map backend does not match this MCP process")
        try:
            actual_fingerprint = fingerprint_backend(self.backend_path)
        except (OSError, RuntimeError, ValueError):
            raise RepoMapError("BACKEND_INTEGRITY_FAILED", "bound Aider package could not be verified") from None
        if not hmac.compare_digest(actual_fingerprint, self.backend_sha256):
            raise RepoMapError("BACKEND_INTEGRITY_FAILED", "bound Aider package fingerprint has changed")
        delegate = RepoMapService(config_data=repo_map, config_dir=root / ".codex")
        delegated = {key: value for key, value in arguments.items() if key != "project_root"}
        return delegate.call(name, delegated)
