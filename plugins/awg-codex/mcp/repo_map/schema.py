"""Single source of truth for the AWG Repo MCP tool surface."""

WORKSPACE = {"type": "string", "minLength": 1, "maxLength": 200}
PATH = {"type": "string", "minLength": 1, "maxLength": 400}

TOOL_SCHEMAS = {
    "repo_map_status": {
        "type": "object", "additionalProperties": False, "required": ["workspace_id"],
        "properties": {"workspace_id": WORKSPACE},
    },
    "repo_map_get": {
        "type": "object", "additionalProperties": False, "required": ["workspace_id"],
        "properties": {
            "workspace_id": WORKSPACE,
            "focus_files": {"type": "array", "maxItems": 50, "items": PATH},
            "mentioned_identifiers": {"type": "array", "maxItems": 100,
                                      "items": {"type": "string", "minLength": 1, "maxLength": 200}},
            "token_budget": {"type": "integer", "minimum": 256, "maximum": 4000},
        },
    },
    "repo_map_refresh": {
        "type": "object", "additionalProperties": False,
        "required": ["workspace_id", "mode", "request_id"],
        "properties": {
            "workspace_id": WORKSPACE,
            "mode": {"type": "string", "enum": ["incremental", "full"]},
            "request_id": {"type": "string", "minLength": 1, "maxLength": 128},
            "expected_generation": {"type": "integer", "minimum": 1},
        },
    },
    "repo_docs_search": {
        "type": "object", "additionalProperties": False, "required": ["workspace_id", "query"],
        "properties": {
            "workspace_id": WORKSPACE,
            "query": {"type": "string", "minLength": 1, "maxLength": 256},
            "limit": {"type": "integer", "minimum": 1, "maximum": 10},
        },
    },
    "repo_docs_read": {
        "type": "object", "additionalProperties": False, "required": ["workspace_id", "document_id"],
        "properties": {
            "workspace_id": WORKSPACE,
            "document_id": PATH,
            "section_id": {"type": "string", "minLength": 1, "maxLength": 400},
            "expected_source_hash": {"type": "string", "minLength": 64, "maxLength": 128},
            "max_chars": {"type": "integer", "minimum": 1, "maximum": 12000},
            "offset": {"type": "integer", "minimum": 0},
        },
    },
    "repo_context_check": {
        "type": "object", "additionalProperties": False,
        "required": ["workspace_id", "context_refs"],
        "properties": {
            "workspace_id": WORKSPACE,
            "context_refs": {
                "type": "array", "minItems": 1, "maxItems": 50,
                "items": {
                    "type": "object", "additionalProperties": False, "required": ["path"],
                    "properties": {
                        "ref_id": {"type": "string", "maxLength": 200},
                        "path": PATH,
                        "location": {"type": "string", "maxLength": 400},
                        "hash": {"type": "string", "maxLength": 128},
                        "revision": {"type": "string", "maxLength": 128},
                        "purpose": {"type": "string", "maxLength": 400},
                    },
                },
            },
        },
    },
}

TOOL_DESCRIPTIONS = {
    "repo_map_status": "Read-only readiness, backend version, map generation, freshness and coverage for this registered workspace.",
    "repo_map_get": "Read the published bounded Aider RepoMap. Focus files and identifiers rerank the map; a missing/stale map is reported instead of silently refreshed.",
    "repo_map_refresh": "Explicitly refresh this workspace's local RepoMap cache. Repository-scoped server config controls authorization; request IDs are idempotent and expected_generation provides compare-and-swap.",
    "repo_docs_search": "Search bounded UTF-8 Markdown/plain-text documents in the registered workspace. Returns paths, headings, line numbers, short snippets and source hashes.",
    "repo_docs_read": "Read a bounded excerpt of a registered UTF-8 Markdown/plain-text document or heading. This is not an arbitrary file reader.",
    "repo_context_check": "Compare supplied path/hash references with live workspace sources without returning file contents.",
}
