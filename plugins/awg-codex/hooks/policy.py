"""Bound-session path checks for structured Codex file edits."""
import hashlib
import json
from pathlib import Path, PureWindowsPath
import re
import sys

ACTIVE_STATES = {"implementing", "review", "repair", "acceptance"}
WRITE_TOOLS = {"Write", "Edit", "apply_patch"}
PATH_FIELDS = ("path", "file_path", "absolute_path")
PATCH_PATH = re.compile(r"^\*\*\* (?:Add|Update|Delete) File:\s*(.+?)\s*$")
PATCH_MOVE = re.compile(r"^\*\*\* Move to:\s*(.+?)\s*$")
GIT_DIFF_PATH = re.compile(r"^(?:\+\+\+ b/|--- a/)(.+?)\s*$")


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _validate_contract(value: object) -> dict:
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("invalid task contract")
    for key in ("project_id", "repo_id", "task_id"):
        if not isinstance(value.get(key), str) or not value[key].strip():
            raise ValueError("invalid task identity")
    state = value.get("state")
    if state not in ACTIVE_STATES | {"idle", "complete"}:
        raise ValueError("invalid task state")
    scopes = value.get("scope_paths")
    if not isinstance(scopes, list) or len(scopes) > 50:
        raise ValueError("invalid task scopes")
    if state in ACTIVE_STATES and not scopes:
        raise ValueError("active task requires a write scope")
    for scope in scopes:
        if not isinstance(scope, str) or not scope or ".." in scope.replace("\\", "/").split("/"):
            raise ValueError("invalid scope path")
        if Path(scope).is_absolute() or PureWindowsPath(scope).drive or scope.startswith(("/", "\\")):
            raise ValueError("scope must be repository-relative")
    sessions = value.get("session_hashes", [])
    if not isinstance(sessions, list) or len(sessions) > 50 or any(
        not isinstance(item, str) or re.fullmatch(r"[0-9a-f]{20}", item) is None for item in sessions
    ):
        raise ValueError("invalid session bindings")
    return value


def _patch_paths(command: object) -> list[str]:
    if not isinstance(command, str):
        raise ValueError("apply_patch command is missing")
    paths = []
    for line in command.splitlines():
        match = PATCH_PATH.match(line) or PATCH_MOVE.match(line) or GIT_DIFF_PATH.match(line)
        if match and match.group(1) != "/dev/null":
            paths.append(match.group(1).strip('"'))
    if not paths:
        raise ValueError("no patch paths found")
    return paths


def _tool_paths(event: dict) -> list[str]:
    name = event.get("tool_name")
    args = event.get("tool_input")
    if not isinstance(args, dict):
        raise ValueError("structured tool input is missing")
    if name == "apply_patch":
        return _patch_paths(args.get("command"))
    paths = [args[key] for key in PATH_FIELDS if key in args]
    if not paths or any(not isinstance(path, str) or not path.strip() for path in paths):
        raise ValueError("structured file path is missing")
    return paths


def evaluate(event: dict, contract: object, root: Path) -> tuple[str, str]:
    value = _validate_contract(contract)
    if value["state"] not in ACTIVE_STATES:
        return "allow", "INACTIVE_TASK"
    session_id = event.get("session_id")
    binding = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:20] \
        if isinstance(session_id, str) and session_id else None
    if binding is None or binding not in value.get("session_hashes", []):
        return "allow", "UNBOUND_SESSION"
    if event.get("hook_event_name") != "PreToolUse" or event.get("tool_name") not in WRITE_TOOLS:
        return "allow", "NOT_A_SCOPED_FILE_EDIT"

    root = root.resolve()
    cwd_value = event.get("cwd")
    cwd = Path(cwd_value).resolve() if isinstance(cwd_value, str) and cwd_value else root
    if not _inside(cwd, root):
        return "deny", "CWD_OUTSIDE_WORKTREE"
    scopes = [(root / scope).resolve() for scope in value["scope_paths"]]
    if any(not _inside(scope, root) for scope in scopes):
        return "deny", "INVALID_SCOPE"
    for raw_path in _tool_paths(event):
        windows_path = PureWindowsPath(raw_path)
        candidate = Path(raw_path)
        if windows_path.drive and not candidate.is_absolute():
            return "deny", "INVALID_PATH"
        target = (candidate if candidate.is_absolute() else cwd / candidate).resolve()
        if not _inside(target, root) or not any(target == scope or _inside(target, scope) for scope in scopes):
            return "deny", "OUT_OF_SCOPE"
    return "allow", "IN_SCOPE"


def _root(cwd: object) -> Path:
    if not isinstance(cwd, str) or not cwd:
        raise ValueError("hook cwd is missing")
    import subprocess

    result = subprocess.run(["git", "-C", cwd, "rev-parse", "--show-toplevel"],
                            capture_output=True, text=True, encoding="utf-8", timeout=3, check=True)
    return Path(result.stdout.strip()).resolve()


def _is_bound_active(event: dict, contract: object) -> bool:
    if not isinstance(contract, dict) or contract.get("state") not in ACTIVE_STATES:
        return False
    session_id = event.get("session_id")
    sessions = contract.get("session_hashes")
    if not isinstance(session_id, str) or not isinstance(sessions, list):
        return False
    binding = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:20]
    return binding in sessions


def _deny(reason: str) -> None:
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": f"AWG task scope check: {reason}.",
    }}))


def main() -> int:
    try:
        event = json.load(sys.stdin)
        if not isinstance(event, dict) or event.get("hook_event_name") != "PreToolUse":
            return 0
        root = _root(event.get("cwd"))
        contract_path = root / ".codex/awg-task.json"
        if contract_path.is_symlink() or not contract_path.is_file() or contract_path.stat().st_size > 65_536:
            return 0
        contract = json.loads(contract_path.read_text(encoding="utf-8-sig"))
        try:
            decision, reason = evaluate(event, contract, root)
        except Exception:
            if _is_bound_active(event, contract):
                _deny("INVALID_REQUEST")
            return 0
        if decision == "deny":
            _deny(reason)
        return 0
    except Exception as error:
        print(f"AWG scope hook could not evaluate request: {type(error).__name__}", file=sys.stderr)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
