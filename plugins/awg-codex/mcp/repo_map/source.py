"""Git-bounded source discovery, hashing and document access."""
import hashlib
from pathlib import Path, PurePosixPath, PureWindowsPath
import subprocess

from .errors import RepoMapError

MAX_FILES = 10_000
MAX_FILE_BYTES = 1_048_576
MAX_TOTAL_BYTES = 104_857_600
DOC_SUFFIXES = {".md", ".txt"}
SECRET_SUFFIXES = {".key", ".pem", ".p12", ".pfx", ".kdbx"}
SECRET_NAMES = {"id_rsa", "id_ed25519", "credentials", "secrets", "secrets.json"}


def normalize_relative(value):
    if not isinstance(value, str) or not value or "\0" in value:
        raise RepoMapError("INVALID_INPUT", "path must be a non-empty relative string")
    if PureWindowsPath(value).drive or Path(value).is_absolute() or value.startswith(("/", "\\")):
        raise RepoMapError("INVALID_INPUT", "absolute paths are not accepted")
    normalized = value.replace("\\", "/")
    parts = PurePosixPath(normalized).parts
    if not parts or any(part in (".", "..") for part in parts):
        raise RepoMapError("INVALID_INPUT", "path traversal is not accepted")
    return "/".join(parts)


def is_excluded(relative):
    parts = PurePosixPath(relative).parts
    lowered = [part.casefold() for part in parts]
    name = lowered[-1]
    suffix = Path(name).suffix
    return (
        any(part in {".git", ".tmp", ".kimi-code", ".codex", ".agent-workspace-governance", "node_modules", "__pycache__"}
            for part in lowered)
        or lowered[:2] == ["records", "evidence"]
        or name.startswith(".env")
        or name in SECRET_NAMES
        or suffix in SECRET_SUFFIXES
    )


def git_files(root):
    result = subprocess.run(
        ["git", "-c", f"safe.directory={root}", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        capture_output=True, timeout=10, check=False,
    )
    if result.returncode:
        raise RepoMapError("NOT_GIT_WORKTREE", "cannot enumerate the registered Git worktree",
                           next_action="check the workspace root and local Git installation")
    try:
        values = result.stdout.decode("utf-8", errors="strict").split("\0")
    except UnicodeDecodeError as exc:
        raise RepoMapError("INVALID_PATH_ENCODING", "Git returned a path that is not valid UTF-8",
                           details={"byte_offset": exc.start}) from None
    unique = sorted(set(value for value in values if value))
    if len(unique) > MAX_FILES:
        raise RepoMapError("FILE_LIMIT_EXCEEDED", "eligible file count exceeds the configured limit",
                           details={"limit": MAX_FILES, "count": len(unique)})
    return unique


def resolve_repo_file(root, relative):
    relative = normalize_relative(relative)
    if is_excluded(relative):
        raise RepoMapError("PATH_EXCLUDED", "the requested path is excluded")
    candidate = root
    for part in PurePosixPath(relative).parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise RepoMapError("SYMLINK_EXCLUDED", "symbolic-link paths are not read by Repo MCP")
    path = candidate.resolve()
    if not path.is_relative_to(root):
        raise RepoMapError("PATH_OUTSIDE_WORKSPACE", "the requested path resolves outside the workspace")
    if not path.is_file():
        raise RepoMapError("DOCUMENT_NOT_FOUND", "the requested workspace file does not exist")
    return relative, path


def snapshot(root, language_for):
    code_files = []
    doc_files = []
    manifest = {}
    metadata = []
    unsupported = 0
    excluded = 0
    total = 0
    for relative in git_files(root):
        if is_excluded(relative):
            excluded += 1
            continue
        try:
            relative, path = resolve_repo_file(root, relative)
            stat = path.stat()
        except RepoMapError:
            excluded += 1
            continue
        if stat.st_size > MAX_FILE_BYTES:
            excluded += 1
            continue
        total += stat.st_size
        if total > MAX_TOTAL_BYTES:
            raise RepoMapError("BYTE_LIMIT_EXCEEDED", "eligible text size exceeds the configured limit",
                               details={"limit": MAX_TOTAL_BYTES})
        suffix = path.suffix.casefold()
        is_doc = suffix in DOC_SUFFIXES
        language = language_for(str(path)) if not is_doc else None
        if not is_doc and language is None:
            unsupported += 1
            continue
        try:
            content = path.read_bytes()
        except OSError:
            continue
        manifest[relative] = hashlib.sha256(content).hexdigest()
        metadata.append((relative, stat.st_size, stat.st_mtime_ns))
        (doc_files if is_doc else code_files).append(relative)
    head = subprocess.run(["git", "-c", f"safe.directory={root}", "-C", str(root), "rev-parse", "HEAD"], capture_output=True,
                          text=True, encoding="utf-8", timeout=5, check=False)
    revision = head.stdout.strip() if head.returncode == 0 else "UNBORN"
    metadata.sort()
    stat_fingerprint = hashlib.sha256(
        repr((revision, metadata)).encode("utf-8")
    ).hexdigest()
    manifest_fingerprint = hashlib.sha256(_json_bytes(manifest)).hexdigest()
    return {
        "head": revision,
        "manifest": manifest,
        "manifest_fingerprint": manifest_fingerprint,
        "stat_fingerprint": stat_fingerprint,
        "code_files": code_files,
        "doc_files": doc_files,
        "coverage": {"indexed": len(code_files), "unsupported": unsupported, "failed": 0,
                     "eligible": len(code_files) + unsupported, "excluded": excluded, "truncated": False},
    }


def _json_bytes(value):
    import json
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def read_document(root, relative, *, section_id=None, expected_source_hash=None, max_chars=4000, offset=0):
    if isinstance(max_chars, bool) or not isinstance(max_chars, int) or not 1 <= max_chars <= 12000:
        raise RepoMapError("INVALID_INPUT", "max_chars must be between 1 and 12000")
    if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
        raise RepoMapError("INVALID_INPUT", "offset must be a non-negative integer")
    relative, path = resolve_repo_file(root, relative)
    if path.suffix.casefold() not in DOC_SUFFIXES:
        raise RepoMapError("UNSUPPORTED_DOCUMENT", "only Markdown and plain-text documents are supported")
    if path.stat().st_size > MAX_FILE_BYTES:
        raise RepoMapError("FILE_LIMIT_EXCEEDED", "document exceeds the configured size limit")
    raw = path.read_bytes()
    source_hash = hashlib.sha256(raw).hexdigest()
    if expected_source_hash and expected_source_hash != source_hash:
        raise RepoMapError("SOURCE_CHANGED", "document hash does not match the expected source hash",
                           retryable=True, next_action="search the current source and update the reference")
    try:
        text = raw.decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError:
        raise RepoMapError("UNSUPPORTED_ENCODING", "document is not valid UTF-8") from None
    if section_id:
        text = section_text(relative, text, section_id)
    excerpt = text[offset:offset + max_chars]
    return {"document_id": relative, "section_id": section_id, "source_hash": source_hash,
            "content": excerpt, "truncated": offset + len(excerpt) < len(text),
            "next_offset": offset + len(excerpt) if offset + len(excerpt) < len(text) else None,
            "total_chars": len(text)}


def section_text(relative, text, requested):
    lines = text.splitlines(keepends=True)
    headings = []
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("#"):
            title = stripped.lstrip("#").strip()
            slug = "-".join("".join(ch.lower() if ch.isalnum() else " " for ch in title).split())
            headings.append((index, slug, title))
    for pos, (start, slug, _title) in enumerate(headings):
        section_id = f"{relative}#{slug}"
        if requested in (slug, section_id):
            end = headings[pos + 1][0] if pos + 1 < len(headings) else len(lines)
            return "".join(lines[start:end])
    raise RepoMapError("SECTION_NOT_FOUND", "requested document section was not found")


def search_documents(root, docs, query, limit=5):
    if not isinstance(query, str) or not query.strip() or len(query) > 256:
        raise RepoMapError("INVALID_INPUT", "query must contain 1 to 256 characters")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 10:
        raise RepoMapError("INVALID_INPUT", "limit must be between 1 and 10")
    terms = [term.casefold() for term in query.split()[:20]]
    results = []
    for relative in docs:
        _, path = resolve_repo_file(root, relative)
        try:
            content = path.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeError):
            continue
        lines = content.splitlines()
        source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        for index, line in enumerate(lines):
            if all(term in line.casefold() for term in terms):
                title = next((candidate.lstrip("#").strip() for candidate in reversed(lines[:index + 1])
                              if candidate.lstrip().startswith("#")), Path(relative).name)
                section = "-".join("".join(ch.lower() if ch.isalnum() else " " for ch in title).split())
                results.append({"document_id": relative, "section_id": f"{relative}#{section}",
                                "title": title, "line": index + 1, "snippet": line[:320],
                                "source_hash": source_hash})
                if len(results) >= limit:
                    return results
    return results
