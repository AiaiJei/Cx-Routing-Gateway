"""Atomic publication of Repo Map generations and refresh idempotency."""
import json
from pathlib import Path
import sqlite3
from datetime import datetime, timezone

from .errors import RepoMapError


class GenerationStore:
    def __init__(self, cache_dir):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.cache_dir / "repo-map.sqlite3"
        connection = self.connect()
        try:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS generations (
                    generation INTEGER PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS refresh_requests (
                    request_id TEXT PRIMARY KEY,
                    generation INTEGER NOT NULL,
                    result TEXT NOT NULL
                );
            """)
        finally:
            connection.close()

    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=10000")
        return connection

    def latest(self):
        with self.connect() as connection:
            row = connection.execute(
                "SELECT generation, created_at, payload FROM generations ORDER BY generation DESC LIMIT 1"
            ).fetchone()
        if row is None:
            return None
        return {"generation": row[0], "published_at": row[1], **json.loads(row[2])}

    def find_request(self, request_id):
        with self.connect() as connection:
            row = connection.execute(
                "SELECT generation, result FROM refresh_requests WHERE request_id=?", (request_id,)
            ).fetchone()
        if row is None:
            return None
        return {"generation": row[0], **json.loads(row[1]), "idempotent_replay": True}

    def publish(self, request_id, expected_generation, payload):
        if not isinstance(request_id, str) or not request_id.strip() or len(request_id) > 128:
            raise RepoMapError("INVALID_INPUT", "request_id must contain 1 to 128 characters")
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            prior = connection.execute(
                "SELECT generation, result FROM refresh_requests WHERE request_id=?", (request_id,)
            ).fetchone()
            if prior is not None:
                connection.commit()
                return {"generation": prior[0], **json.loads(prior[1]), "idempotent_replay": True}
            current = connection.execute("SELECT COALESCE(MAX(generation), 0) FROM generations").fetchone()[0]
            if expected_generation is not None:
                if isinstance(expected_generation, bool) or not isinstance(expected_generation, int) \
                        or expected_generation < 1:
                    raise RepoMapError("INVALID_INPUT", "expected_generation must be a positive integer")
                if expected_generation != current:
                    raise RepoMapError(
                        "GENERATION_CONFLICT", "the published Repo Map generation changed during refresh",
                        retryable=True, next_action="read repo_map_status and retry with the current generation",
                        details={"expected": expected_generation, "current": current},
                    )
            generation = current + 1
            created_at = datetime.now(timezone.utc).isoformat()
            payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            result = {"generation": generation, "published_at": created_at,
                      "freshness": "current", "coverage": payload["coverage"]}
            result_json = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
            connection.execute(
                "INSERT INTO generations(generation, created_at, payload) VALUES (?, ?, ?)",
                (generation, created_at, payload_json),
            )
            connection.execute(
                "INSERT INTO refresh_requests(request_id, generation, result) VALUES (?, ?, ?)",
                (request_id, generation, result_json),
            )
            connection.commit()
            return result
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
