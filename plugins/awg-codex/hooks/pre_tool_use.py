"""Codex PreToolUse entrypoint for the AWG project scope policy."""
from pathlib import Path
import sys


HOOK_DIRECTORY = Path(__file__).resolve().parent
if str(HOOK_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(HOOK_DIRECTORY))

from policy import main


if __name__ == "__main__":
    raise SystemExit(main())
