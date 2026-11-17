"""Plugin-root stdio entrypoint for the project-bound AWG Repo MCP."""
import sys
from pathlib import Path

PLUGIN_ROOT = Path(__file__).resolve().parents[1]
MCP_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(MCP_ROOT))

from repo_map.plugin_service import PluginRepoMapService, plugin_tool_schemas
from repo_map import protocol


def run():
    service = PluginRepoMapService()
    protocol.run(service=service, tool_schemas=plugin_tool_schemas())


if __name__ == "__main__":
    run()
