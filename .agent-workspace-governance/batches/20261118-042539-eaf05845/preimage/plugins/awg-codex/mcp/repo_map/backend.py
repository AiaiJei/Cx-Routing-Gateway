"""Pinned Aider RepoMap adapter; all caches stay under the registered repo cache."""
from pathlib import Path
import re
import sys

from .errors import RepoMapError


class OfflineModel:
    name = "awg-offline-character-estimator"

    @staticmethod
    def token_count(text):
        return max(1, len(text) // 4)


class QuietIO:
    encoding = "utf-8"

    @staticmethod
    def read_text(filename, silent=False):
        try:
            return Path(filename).read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            return None

    @staticmethod
    def tool_output(*messages):
        print("[awg-repo-map]", *messages, file=sys.stderr)

    @staticmethod
    def tool_warning(*messages):
        print("[awg-repo-map:warn]", *messages, file=sys.stderr)

    @staticmethod
    def tool_error(*messages):
        print("[awg-repo-map:error]", *messages, file=sys.stderr)


class AiderBackend:
    VERSION = "0.86.2"

    def __init__(self, configured_path, tags_cache_dir):
        path = Path(configured_path).resolve()
        if (path / "Lib" / "site-packages").is_dir():
            path = path / "Lib" / "site-packages"
        elif (path / "lib" / "site-packages").is_dir():
            path = path / "lib" / "site-packages"
        init_file = path / "aider" / "__init__.py"
        try:
            init_text = init_file.read_text(encoding="utf-8")
        except OSError:
            raise RepoMapError("BACKEND_UNAVAILABLE", "configured Aider package was not found",
                               next_action="install pinned Aider 0.86.2 into an isolated environment") from None
        version = re.search(r'^__version__\s*=\s*"([^"]+)"', init_text, re.MULTILINE)
        if version is None or version.group(1) != self.VERSION or not (path / "aider" / "repomap.py").is_file():
            raise RepoMapError("BACKEND_VERSION_MISMATCH", "RepoMap requires the pinned Aider 0.86.2 API",
                               details={"expected": self.VERSION,
                                        "actual": version.group(1) if version else None})
        self.package_path = path
        self.version = version.group(1)
        self.tags_cache_dir = Path(tags_cache_dir).resolve()
        self.tags_cache_dir.mkdir(parents=True, exist_ok=True)
        if str(path) not in sys.path:
            sys.path.insert(0, str(path))
        try:
            from aider.repomap import RepoMap
            from diskcache import Cache
            from grep_ast import filename_to_lang
        except Exception as exc:
            raise RepoMapError("BACKEND_UNAVAILABLE", "pinned Aider RepoMap dependencies could not be loaded",
                               details={"exception": type(exc).__name__}) from None
        self.RepoMap = RepoMap
        self.Cache = Cache
        self.filename_to_lang = filename_to_lang
        self._maps = {}

    def language_for(self, filename):
        try:
            return self.filename_to_lang(filename)
        except Exception:
            return None

    def _mapper(self, root):
        key = str(Path(root).resolve())
        if key in self._maps:
            return self._maps[key]
        tags_cache = self.tags_cache_dir / "tags"
        backend = self

        class WorkspaceRepoMap(backend.RepoMap):
            def load_tags_cache(self):
                self.TAGS_CACHE = backend.Cache(str(tags_cache))

        mapper = WorkspaceRepoMap(
            map_tokens=1500,
            root=key,
            main_model=OfflineModel(),
            io=QuietIO(),
            verbose=False,
            refresh="auto",
        )
        self._maps[key] = mapper
        return mapper

    def invalidate(self, root, relative_paths, *, full=False):
        mapper = self._mapper(root)
        cache = mapper.TAGS_CACHE
        if full:
            cache.clear()
        else:
            for relative in relative_paths:
                cache.delete(str((Path(root) / Path(*relative.split("/"))).resolve()))
        mapper.map_cache.clear()
        mapper.tree_cache.clear()
        mapper.tree_context_cache.clear()

    def build(self, root, relative_files, *, token_budget=1500, focus_files=(), mentioned_identifiers=()):
        if isinstance(token_budget, bool) or not isinstance(token_budget, int) or not 256 <= token_budget <= 4000:
            raise RepoMapError("INVALID_INPUT", "token_budget must be between 256 and 4000")
        mapper = self._mapper(root)
        mapper.max_map_tokens = token_budget
        mapper.map_cache.clear()
        absolute_files = [str((Path(root) / Path(*relative.split("/"))).resolve())
                          for relative in relative_files]
        try:
            result = mapper.get_repo_map(
                chat_files=[],
                other_files=absolute_files,
                mentioned_fnames=set(focus_files),
                mentioned_idents=set(mentioned_identifiers),
                force_refresh=True,
            )
        except Exception as exc:
            raise RepoMapError("MAP_BUILD_FAILED", "Aider RepoMap could not build this generation",
                               retryable=True, details={"exception": type(exc).__name__}) from None
        return result or ""
