"""Plugin-root stdio entrypoint for the project-bound AWG Repo MCP."""
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True
PLUGIN_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(os.environ.get("AWG_PROJECT_ROOT", "")).expanduser().resolve()
MCP_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(MCP_ROOT))

from repo_map.plugin_service import PluginRepoMapService, plugin_tool_schemas
from repo_map import protocol


def run():
    service = PluginRepoMapService.from_environment(PROJECT_ROOT, os.environ)
    protocol.run(service=service, tool_schemas=plugin_tool_schemas())


if __name__ == "__main__":
    run()
