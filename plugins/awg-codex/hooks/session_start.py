"""Emit static, non-sensitive project guidance for Codex SessionStart."""
import json
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile


ACTIVE_STATES = {"implementing", "review", "repair", "acceptance"}


def bind_active_task(event: dict) -> str:
    session_id = event.get("session_id")
    cwd = event.get("cwd")
    if not isinstance(session_id, str) or not session_id or not isinstance(cwd, str) or not cwd:
        return "NOT_BOUND"
    try:
        result = subprocess.run(["git", "-C", cwd, "rev-parse", "--show-toplevel"],
                                capture_output=True, text=True, encoding="utf-8", timeout=3, check=True)
        root = Path(result.stdout.strip()).resolve()
        path = root / ".codex/awg-task.json"
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 65_536:
            return "NOT_BOUND"
        contract = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(contract, dict) or contract.get("state") not in ACTIVE_STATES:
            return "INACTIVE"
        sessions = contract.get("session_hashes", [])
        if not isinstance(sessions, list) or len(sessions) > 50:
            return "NOT_BOUND"
        binding = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:20]
        if binding in sessions:
            return "BOUND"
        sessions.append(binding)
        contract["session_hashes"] = sessions
        fd, temporary = tempfile.mkstemp(prefix=".awg-session-", suffix=".tmp", dir=path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
                json.dump(contract, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return "BOUND"
    except (OSError, ValueError, subprocess.SubprocessError, json.JSONDecodeError):
        return "NOT_BOUND"


def main() -> int:
    try:
        value = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeDecodeError):
        value = {}
    if not isinstance(value, dict):
        value = {}
    binding_status = bind_active_task(value)
    context = (
        "AWG Codex project: follow repository AGENTS.md and task authorization. "
        "Use the awg-repo-map skill for Repo MCP when available; read authoritative source and tests. "
        "Codex project agents use native Codex configuration. Kimi AgentSwarm rules do not apply here. "
        f"Active task session binding: {binding_status}."
    )
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context,
    }}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
