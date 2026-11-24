# Legacy deployment archive

The original Repo Map cache and orphaned AWG Python bytecode were moved out of active discovery paths and hash-checked against preflight.json.

The generated SQLite and .pyc payloads remain only in the primary worktree's local evidence archive and are intentionally omitted from this Git branch. The bytecode embeds absolute workstation paths; the preflight inventory retains each file's byte count and SHA-256.

These are generated cache artifacts, not runtime dependencies of the Codex-AWG project binding. The official project rollback does not require restoring them.
