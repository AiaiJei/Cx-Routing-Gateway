"""Workspace registration, bounded tool behavior and RepoMap publication."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess

from .backend import AiderBackend
from .cache import GenerationStore
from .errors import RepoMapError
from .schema import TOOL_SCHEMAS
from .source import normalize_relative, read_document, resolve_repo_file, search_documents, snapshot

SERVICE_NAME = "awg-repo-map"
SERVICE_VERSION = "0.2.0"
HARD_LIMITS = {
    "max_file_bytes": 1_048_576,
    "max_index_files": 10_000,
    "max_total_text_bytes": 104_857_600,
    "map_token_min": 256,
    "map_token_max": 4_000,
    "map_token_default": 1_500,
    "response_char_limit": 24_000,
    "docs_search_max": 10,
    "docs_read_max_chars": 12_000,
}


def _git_root(path):
    result = subprocess.run(["git", "-c", f"safe.directory={path}", "-C", str(path), "rev-parse", "--show-toplevel"],
                            capture_output=True, text=True, encoding="utf-8", timeout=5, check=False)
    if result.returncode:
        raise RepoMapError("NOT_GIT_WORKTREE", "registered workspace root is not a Git worktree")
    return Path(result.stdout.strip()).resolve()


def _validate_schema(value, schema, label):
    kind = schema.get("type")
    valid = {
        "object": lambda item: isinstance(item, dict),
        "array": lambda item: isinstance(item, list),
        "string": lambda item: isinstance(item, str),
        "integer": lambda item: isinstance(item, int) and not isinstance(item, bool),
    }
    if kind in valid and not valid[kind](value):
        raise RepoMapError("INVALID_INPUT", f"{label} must be {kind}")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0) or len(value) > schema.get("maxLength", 2**31):
            raise RepoMapError("INVALID_INPUT", f"{label} length is outside the supported range")
        if "enum" in schema and value not in schema["enum"]:
            raise RepoMapError("INVALID_INPUT", f"{label} is not an allowed value")
    if kind == "integer":
        if value < schema.get("minimum", -(2**63)) or value > schema.get("maximum", 2**63 - 1):
            raise RepoMapError("INVALID_INPUT", f"{label} is outside the supported range")
    if kind == "array":
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", 2**31):
            raise RepoMapError("INVALID_INPUT", f"{label} item count is outside the supported range")
        for index, item in enumerate(value):
            _validate_schema(item, schema.get("items", {}), f"{label}[{index}]")
    if kind == "object":
        properties = schema.get("properties", {})
        unknown = sorted(set(value) - set(properties))
        if schema.get("additionalProperties") is False and unknown:
            raise RepoMapError("INVALID_INPUT", f"{label} contains unsupported fields", details={"fields": unknown})
        missing = [key for key in schema.get("required", []) if key not in value]
        if missing:
            raise RepoMapError("INVALID_INPUT", f"{label} is missing required fields", details={"fields": missing})
        for key, item in value.items():
            if key in properties:
                _validate_schema(item, properties[key], f"{label}.{key}")


class RepoMapService:
    def __init__(self, config_path=None):
        raw_path = config_path or os.environ.get("AWG_REPO_MAP_CONFIG")
        if not raw_path:
            raise RepoMapError("CONFIG_MISSING", "AWG_REPO_MAP_CONFIG is not set")
        path = Path(raw_path).resolve()
        if not path.is_file() or path.stat().st_size > 65_536:
            raise RepoMapError("CONFIG_INVALID", "Repo Map config is missing or exceeds 64 KiB")
        try:
            config = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            raise RepoMapError("CONFIG_INVALID", "Repo Map config is not valid UTF-8 JSON") from None
        workspaces = config.get("workspaces")
        if not isinstance(workspaces, list) or len(workspaces) != 1 or not isinstance(workspaces[0], dict):
            raise RepoMapError("CONFIG_INVALID", "AWG Repo MCP requires exactly one registered workspace")
        workspace = workspaces[0]
        for field in ("workspace_id", "root", "project_id", "repo_id"):
            if not isinstance(workspace.get(field), str) or not workspace[field].strip():
                raise RepoMapError("CONFIG_INVALID", f"workspace.{field} is required")
        self.workspace_id = workspace["workspace_id"]
        registered_root = Path(workspace["root"]).expanduser()
        self.root = (registered_root if registered_root.is_absolute()
                     else (path.parent / registered_root)).resolve()
        if _git_root(self.root) != self.root:
            raise RepoMapError("CONFIG_INVALID", "registered root must be the Git worktree root")
        self.project_id = workspace["project_id"]
        self.repo_id = workspace["repo_id"]
        self.allow_refresh = workspace.get("allow_refresh") is True
        cache_dir = Path(config.get("cache_dir", self.root / ".agent-workspace-governance/repo-map-awg-cache")).expanduser()
        if not cache_dir.is_absolute():
            cache_dir = path.parent / cache_dir
        cache_dir = cache_dir.resolve()
        if not cache_dir.is_relative_to(self.root):
            raise RepoMapError("CONFIG_INVALID", "Repo Map cache must remain inside the registered workspace")
        self.store = GenerationStore(cache_dir)
        self.backend = None
        self.backend_error = None
        backend_path = config.get("backend_path")
        if backend_path:
            try:
                self.backend = AiderBackend(backend_path, cache_dir / "aider")
            except RepoMapError as exc:
                self.backend_error = exc.as_dict()

    def _workspace(self, arguments):
        if arguments.get("workspace_id") != self.workspace_id:
            raise RepoMapError("WORKSPACE_NOT_REGISTERED", "workspace_id is not registered with this Repo MCP",
                               next_action="read the workspace_id from the registered project's Repo Map configuration")

    def _snapshot(self):
        language_for = self.backend.language_for if self.backend else (lambda _path: None)
        return snapshot(self.root, language_for)

    def _freshness(self, current, latest):
        if latest is None:
            return "missing"
        return "current" if current["manifest_fingerprint"] == latest["manifest_fingerprint"] else "stale"

    def call(self, name, arguments):
        if name not in TOOL_SCHEMAS:
            raise RepoMapError("INVALID_INPUT", f"unknown tool: {name}",
                               next_action="call tools/list for registered tool names")
        _validate_schema(arguments, TOOL_SCHEMAS[name], name)
        self._workspace(arguments)
        try:
            return getattr(self, name)(arguments)
        except RepoMapError:
            raise
        except (OSError, ValueError, TypeError, sqlite3.Error) as exc:
            raise RepoMapError("INTERNAL_ERROR", "Repo MCP operation failed",
                               retryable=False, details={"exception": type(exc).__name__}) from None

    def repo_map_status(self, _arguments):
        current = self._snapshot()
        latest = self.store.latest()
        backend_state = "READY" if self.backend else "UNAVAILABLE"
        freshness = self._freshness(current, latest)
        return {
            "schema_version": "1", "workspace_id": self.workspace_id,
            "project_id": self.project_id, "repo_id": self.repo_id,
            "generation": latest["generation"] if latest else None,
            "snapshot": {"head": current["head"], "manifest_fingerprint": current["manifest_fingerprint"],
                         "changed_files_checked": True},
            "freshness": freshness,
            "coverage": latest["coverage"] if latest else None,
            "limitations": ["Repo Map is navigation only; verify important conclusions with source reads/search/tests."]
                          + (["map is stale; no automatic refresh was performed"] if freshness == "stale" else []),
            "backend": {"state": backend_state, "version": self.backend.version if self.backend else None,
                        "registered": self.backend is not None, "error": self.backend_error},
            "cache": {"generation": latest["generation"] if latest else None,
                      "freshness": freshness, "published_at": latest["published_at"] if latest else None},
            "workspace": {"workspace_id": self.workspace_id, "root": str(self.root),
                          "project_id": self.project_id, "repo_id": self.repo_id,
                          "allow_refresh": self.allow_refresh, "refresh_available": self.allow_refresh},
            "limits": HARD_LIMITS,
            "tools": list(TOOL_SCHEMAS),
        }

    def repo_map_refresh(self, arguments):
        if not self.allow_refresh and os.environ.get("AWG_REPO_MAP_MAINTENANCE") not in ("1", "true", "True"):
            raise RepoMapError("REFRESH_NOT_AUTHORIZED", "Repo Map refresh is disabled by workspace configuration",
                               next_action="set allow_refresh in the trusted workspace config for a maintainer session")
        if self.backend is None:
            raise RepoMapError("BACKEND_UNAVAILABLE", "pinned Aider RepoMap backend is not configured",
                               retryable=False, next_action="configure an isolated Aider 0.86.2 package path")
        request_id = arguments["request_id"]
        prior = self.store.find_request(request_id)
        if prior is not None:
            return prior
        mode = arguments["mode"]
        if mode not in ("incremental", "full"):
            raise RepoMapError("INVALID_INPUT", "mode must be incremental or full")
        expected_generation = arguments.get("expected_generation")
        if expected_generation is not None and (
            isinstance(expected_generation, bool) or not isinstance(expected_generation, int)
            or expected_generation < 1
        ):
            raise RepoMapError("INVALID_INPUT", "expected_generation must be a positive integer")
        before = self._snapshot()
        latest = self.store.latest()
        previous_manifest = latest.get("manifest", {}) if latest else {}
        current_manifest = before["manifest"]
        changed = sorted(path for path, digest in current_manifest.items()
                         if previous_manifest.get(path) != digest)
        changed.extend(sorted(set(previous_manifest) - set(current_manifest)))
        changed_code = set(changed).intersection(before["code_files"])
        self.backend.invalidate(self.root, changed, full=(mode == "full"))
        map_text = self.backend.build(self.root, before["code_files"], token_budget=1500)
        after = self._snapshot()
        if after["manifest_fingerprint"] != before["manifest_fingerprint"]:
            raise RepoMapError("SOURCE_CHANGED", "workspace changed during Repo Map build",
                               retryable=True, next_action="retry refresh against a stable worktree")
        payload = {
            "schema_version": "1", "workspace_id": self.workspace_id,
            "project_id": self.project_id, "repo_id": self.repo_id,
            "manifest_fingerprint": after["manifest_fingerprint"],
            "snapshot": {"head": after["head"], "manifest_fingerprint": after["manifest_fingerprint"],
                         "changed_files_checked": True},
            "freshness": "current", "coverage": after["coverage"],
            "map_text": map_text[:HARD_LIMITS["response_char_limit"]],
            "manifest": after["manifest"],
            "limitations": ["Aider RepoMap omits unsupported files and is not complete change-impact coverage."],
            "mode": mode,
            "counts": {"added": sum(path not in previous_manifest for path in current_manifest),
                       "updated": sum(path in previous_manifest and previous_manifest[path] != digest
                                      for path, digest in current_manifest.items()),
                       "deleted": len(set(previous_manifest) - set(current_manifest)),
                       "skipped": max(0, len(after["code_files"]) - len(changed_code))},
            "backend": {"name": "aider-repomap", "version": self.backend.version},
        }
        return self.store.publish(request_id, arguments.get("expected_generation"), payload)

    def repo_map_get(self, arguments):
        latest = self.store.latest()
        if latest is None:
            raise RepoMapError("CACHE_STALE", "no published Repo Map generation exists",
                               retryable=True, next_action="call repo_map_refresh")
        current = self._snapshot()
        freshness = self._freshness(current, latest)
        if freshness != "current":
            raise RepoMapError("CACHE_STALE", "published Repo Map is stale",
                               retryable=True, next_action="call repo_map_refresh")
        text = latest.get("map_text", "")
        if self.backend and (arguments.get("focus_files") or arguments.get("mentioned_identifiers")):
            focus_files = [normalize_relative(path) for path in arguments.get("focus_files", [])]
            missing = sorted(set(focus_files) - set(current["code_files"]))
            if missing:
                raise RepoMapError("INVALID_INPUT", "focus_files must refer to supported workspace source files",
                                   details={"paths": missing[:10]})
            text = self.backend.build(self.root, current["code_files"], token_budget=arguments.get(
                "token_budget", HARD_LIMITS["map_token_default"]),
                focus_files=focus_files,
                mentioned_identifiers=arguments.get("mentioned_identifiers", []))
        elif "token_budget" in arguments and arguments["token_budget"] < HARD_LIMITS["map_token_default"]:
            text = text[: max(1, arguments["token_budget"] * 4)]
        return {key: latest[key] for key in ("schema_version", "workspace_id", "project_id", "repo_id",
                                             "generation", "snapshot", "freshness", "coverage", "limitations")} | {
            "map_text": text[:HARD_LIMITS["response_char_limit"]], "backend": latest.get("backend")}

    def repo_docs_search(self, arguments):
        current = self._snapshot()
        results = search_documents(self.root, current["doc_files"], arguments["query"],
                                   arguments.get("limit", 5))
        latest = self.store.latest()
        return {"schema_version": "1", "workspace_id": self.workspace_id,
                "project_id": self.project_id, "repo_id": self.repo_id,
                "generation": latest["generation"] if latest else None,
                "snapshot": {"head": current["head"], "manifest_fingerprint": current["manifest_fingerprint"],
                             "changed_files_checked": True},
                "freshness": self._freshness(current, latest), "coverage": None,
                "limitations": ["Search is limited to bounded UTF-8 Markdown and plain-text files."],
                "results": results, "total": len(results), "truncated": False}

    def repo_docs_read(self, arguments):
        current = self._snapshot()
        result = read_document(self.root, arguments["document_id"],
                               section_id=arguments.get("section_id"),
                               expected_source_hash=arguments.get("expected_source_hash"),
                               max_chars=arguments.get("max_chars", 4000),
                               offset=arguments.get("offset", 0))
        latest = self.store.latest()
        return {"schema_version": "1", "workspace_id": self.workspace_id,
                "project_id": self.project_id, "repo_id": self.repo_id,
                "generation": latest["generation"] if latest else None,
                "snapshot": {"head": current["head"], "manifest_fingerprint": current["manifest_fingerprint"],
                             "changed_files_checked": True},
                "freshness": self._freshness(current, latest), "coverage": None,
                "limitations": ["Source file is authoritative; this excerpt does not replace reading it in full."],
                **result}

    def repo_context_check(self, arguments):
        current = self._snapshot()
        refs = []
        for item in arguments["context_refs"]:
            relative = normalize_relative(item["path"])
            expected = item.get("hash")
            try:
                _, path = resolve_repo_file(self.root, relative)
                if path.stat().st_size > HARD_LIMITS["max_file_bytes"]:
                    refs.append({"ref_id": item.get("ref_id", relative), "path": relative, "status": "excluded"})
                    continue
                actual = hashlib.sha256(path.read_bytes()).hexdigest()
                status = "unknown" if not expected else ("current" if expected == actual else "stale")
            except RepoMapError as exc:
                actual = None
                status = "excluded" if exc.code == "PATH_EXCLUDED" else "missing"
            refs.append({"ref_id": item.get("ref_id", relative), "path": relative,
                         "status": status, "current_hash": actual})
        latest = self.store.latest()
        return {"schema_version": "1", "workspace_id": self.workspace_id,
                "project_id": self.project_id, "repo_id": self.repo_id,
                "generation": latest["generation"] if latest else None,
                "snapshot": {"head": current["head"], "manifest_fingerprint": current["manifest_fingerprint"],
                             "changed_files_checked": True},
                "freshness": self._freshness(current, latest), "coverage": None,
                "limitations": ["Context comparison hashes only the referenced files."], "refs": refs}
