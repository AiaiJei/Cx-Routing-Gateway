"""Regression tests for the installed AWG Repo MCP security binding."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
MCP_ROOT = ROOT / "plugins/awg-codex/mcp"
TEST_TMP = ROOT / "tests/.tmp"
TEST_TMP.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(MCP_ROOT))

from repo_map.backend import fingerprint_backend
from repo_map.errors import RepoMapError
from repo_map.plugin_service import PluginRepoMapService


class ProjectBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = Path(tempfile.mkdtemp(prefix="awg-mcp-binding-", dir=TEST_TMP))
        self.project = self.temp / "project"
        self.project.mkdir()
        subprocess.run(["git", "init", "--quiet", str(self.project)], check=True)
        self.package = self.temp / "trusted-site-packages/aider"
        self.package.mkdir(parents=True)
        (self.package / "__init__.py").write_text('__version__ = "0.86.2"\n', encoding="utf-8")
        (self.package / "repomap.py").write_text("class RepoMap: pass\n", encoding="utf-8")
        self.backend_path = self.package.parent
        self.backend_sha256 = fingerprint_backend(self.backend_path)
        self.workspace_id = "workspace-test-id"
        self.write_repo_map()
        (self.project / ".codex/config.toml").write_text(
            '[plugins."awg-governance@awg-local"]\n'
            'enabled = true\n\n'
            '[plugins."awg-governance@awg-local".mcp_servers.awg_repo]\n'
            'enabled = true\n'
            'enabled_tools = ["repo_map_status"]\n',
            encoding="utf-8",
        )
        self.service = PluginRepoMapService(
            expected_root=self.project,
            workspace_id=self.workspace_id,
            backend_path=self.backend_path,
            backend_sha256=self.backend_sha256,
        )

    def write_repo_map(self, **changes):
        value = {
            "workspaces": [{
                "workspace_id": self.workspace_id,
                "root": "..",
                "project_id": "project",
                "repo_id": self.workspace_id,
                "allow_refresh": False,
            }],
            "cache_dir": "../.agent-workspace-governance/repo-map-awg-cache",
            "backend_path": str(self.backend_path),
            "backend_sha256": self.backend_sha256,
        }
        value.update(changes)
        config_dir = self.project / ".codex"
        config_dir.mkdir(exist_ok=True)
        (config_dir / "repo-map.json").write_text(json.dumps(value), encoding="utf-8")

    def call(self, service=None, *, root=None, workspace_id=None):
        (service or self.service).call("repo_map_status", {
            "project_root": str(root or self.project),
            "workspace_id": workspace_id or self.workspace_id,
        })

    def test_foreign_project_root_is_rejected_before_its_config_is_read(self):
        foreign = self.temp / "foreign"
        foreign.mkdir()
        (foreign / ".codex").mkdir()
        (foreign / ".codex/repo-map.json").write_text("malformed", encoding="utf-8")
        with self.assertRaises(RepoMapError) as error:
            self.call(root=foreign)
        self.assertEqual(error.exception.code, "PROJECT_ROOT_MISMATCH")

    def test_backend_path_cannot_be_changed_by_project_config(self):
        marker = self.temp / "untrusted-backend-imported"
        untrusted = self.temp / "untrusted-site-packages/aider"
        untrusted.mkdir(parents=True)
        (untrusted / "__init__.py").write_text(
            f"from pathlib import Path\nPath({str(marker)!r}).write_text('loaded')\n__version__ = \"0.86.2\"\n",
            encoding="utf-8",
        )
        (untrusted / "repomap.py").write_text("class RepoMap: pass\n", encoding="utf-8")
        repo_map = json.loads((self.project / ".codex/repo-map.json").read_text(encoding="utf-8"))
        repo_map["backend_path"] = str(untrusted.parent)
        repo_map["backend_sha256"] = fingerprint_backend(untrusted.parent)
        (self.project / ".codex/repo-map.json").write_text(json.dumps(repo_map), encoding="utf-8")
        with self.assertRaises(RepoMapError) as error:
            self.call()
        self.assertEqual(error.exception.code, "BACKEND_NOT_REGISTERED")
        self.assertFalse(marker.exists())

    def test_cache_path_cannot_escape_the_project(self):
        repo_map = json.loads((self.project / ".codex/repo-map.json").read_text(encoding="utf-8"))
        repo_map["cache_dir"] = str(self.temp / "outside-cache")
        (self.project / ".codex/repo-map.json").write_text(json.dumps(repo_map), encoding="utf-8")
        with self.assertRaises(RepoMapError) as error:
            self.call()
        self.assertEqual(error.exception.code, "CACHE_PATH_NOT_REGISTERED")

    def test_backend_content_change_is_rejected_before_backend_import(self):
        (self.package / "repomap.py").write_text("raise RuntimeError('untrusted')\n", encoding="utf-8")
        with self.assertRaises(RepoMapError) as error:
            self.call()
        self.assertEqual(error.exception.code, "BACKEND_INTEGRITY_FAILED")

    def test_relative_project_root_resolves_from_the_codex_config_directory(self):
        result = PluginRepoMapService.from_environment(
            self.project,
            {
                "AWG_PROJECT_ROOT": str(self.project.resolve()),
                "AWG_BACKEND_PATH": str(self.backend_path),
                "AWG_BACKEND_SHA256": self.backend_sha256,
                "PYTHONDONTWRITEBYTECODE": "1",
            },
        )
        self.assertEqual(result.expected_root, self.project.resolve())
        self.assertEqual(result.workspace_id, self.workspace_id)


if __name__ == "__main__":
    unittest.main(verbosity=2)
