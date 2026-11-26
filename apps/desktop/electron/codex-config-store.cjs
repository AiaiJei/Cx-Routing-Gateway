const fs = require("node:fs/promises");
const constants = require("node:fs").constants;
const path = require("node:path");
const crypto = require("node:crypto");
const { fail } = require("./codex-errors.cjs");

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_BACKUP_BYTES = MAX_CONFIG_BYTES * 2;
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const revision = bytes => bytes === null ? "missing" : hash(bytes);
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validRevision = value => value === "missing" || validHash(value);
const queues = new Map();

function serialize(targetPath, operation) {
  const key = process.platform === "win32" ? path.resolve(targetPath).toLowerCase() : path.resolve(targetPath);
  const previous = queues.get(key) || Promise.resolve();
  const result = previous.then(operation);
  const settled = result.catch(() => {});
  queues.set(key, settled);
  void settled.finally(() => { if (queues.get(key) === settled) queues.delete(key); });
  return result;
}

class CodexConfigStore {
  constructor({ codexHome, fsImpl = fs }) {
    if (typeof codexHome !== "string" || !codexHome || !path.isAbsolute(codexHome)) throw fail("CODEX_INPUT_INVALID");
    this.fs = fsImpl;
    this.home = path.resolve(codexHome);
    this.configPath = path.join(this.home, "config.toml");
    this.stateDir = path.join(this.home, ".cx-routing-gateway");
    this.backupDir = path.join(this.stateDir, "backups");
    this.statePath = path.join(this.stateDir, "state.json");
  }

  serialize(operation) { return serialize(this.configPath, operation); }

  async directory(directory, create = false) {
    const resolved = path.resolve(directory);
    const root = path.parse(resolved).root;
    let cursor = root;
    for (const part of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, part);
      let info;
      try { info = await this.fs.lstat(cursor); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        if (!create) return false;
        try { await this.fs.mkdir(cursor, { mode: 0o700 }); }
        catch (mkdirError) { if (mkdirError.code !== "EEXIST") throw mkdirError; }
        info = await this.fs.lstat(cursor);
      }
      if (!info.isDirectory() || info.isSymbolicLink()) throw fail("CODEX_PATH_UNSAFE");
    }
    return true;
  }

  async read(filePath, maxBytes) {
    if (!await this.directory(path.dirname(filePath))) return null;
    let before;
    try { before = await this.fs.lstat(filePath); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw fail("CODEX_PATH_UNSAFE");
    if (before.size > maxBytes) throw fail(filePath === this.configPath ? "CODEX_CONFIG_TOO_LARGE" : "CODEX_BACKUP_INVALID");
    const handle = await this.fs.open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1) throw fail("CODEX_PATH_UNSAFE");
      const bytes = await handle.readFile();
      if (bytes.length > maxBytes) throw fail(filePath === this.configPath ? "CODEX_CONFIG_TOO_LARGE" : "CODEX_BACKUP_INVALID");
      return bytes;
    } finally { await handle.close(); }
  }

  async snapshot() {
    const bytes = await this.read(this.configPath, MAX_CONFIG_BYTES);
    return { bytes, exists: bytes !== null, revision: revision(bytes) };
  }

  async check(expectedRevision) {
    const current = await this.snapshot();
    if (current.revision !== expectedRevision) throw fail("CODEX_CONFIG_CHANGED");
    return current;
  }

  async atomicWrite(filePath, bytes, beforeReplace, maximumBytes) {
    await this.directory(path.dirname(filePath), true);
    // Reject links or special files at an existing destination before replacement.
    await this.read(filePath, maximumBytes || (filePath === this.configPath ? MAX_CONFIG_BYTES : 16 * 1024));
    const temporary = path.join(path.dirname(filePath), "." + path.basename(filePath) + "." + crypto.randomUUID() + ".tmp");
    let handle;
    let committed = false;
    try {
      handle = await this.fs.open(temporary, "wx", 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      if (beforeReplace) await beforeReplace();
      await this.directory(path.dirname(filePath));
      await this.fs.rename(temporary, filePath);
      committed = true;
    } finally {
      if (handle) await handle.close().catch(() => {});
      // Cleanup cannot alter the committed outcome or mask the original failure.
      if (!committed) await this.fs.unlink(temporary).catch(() => {});
    }
  }

  async readState() {
    const bytes = await this.read(this.statePath, 16 * 1024);
    if (bytes === null) return { version: 1, currentId: null, pendingId: null, restoring: false };
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch { throw fail("CODEX_BACKUP_INVALID"); }
    if (!value || value.version !== 1 || ![value.currentId, value.pendingId].every(id => id === null || validHash(id)) || typeof value.restoring !== "boolean" || (value.restoring && value.pendingId)) throw fail("CODEX_BACKUP_INVALID");
    return value;
  }

  async readBackup(id) {
    if (!validHash(id)) throw fail("CODEX_INPUT_INVALID");
    const bytes = await this.read(path.join(this.backupDir, id + ".json"), MAX_BACKUP_BYTES);
    if (bytes === null || hash(bytes) !== id) throw fail("CODEX_BACKUP_INVALID");
    let data;
    try { data = JSON.parse(bytes.toString("utf8")); } catch { throw fail("CODEX_BACKUP_INVALID"); }
    if (!data || data.version !== 1 || typeof data.createdAt !== "string" || !Number.isFinite(Date.parse(data.createdAt)) ||
        typeof data.originalExists !== "boolean" || !validRevision(data.beforeRevision) || !validHash(data.afterRevision) ||
        typeof data.original !== "string" || data.original.length > Math.ceil(MAX_CONFIG_BYTES / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.original)) throw fail("CODEX_BACKUP_INVALID");
    const original = data.originalExists ? Buffer.from(data.original, "base64") : null;
    if ((!data.originalExists && data.original !== "") || (original && original.toString("base64") !== data.original) || revision(original) !== data.beforeRevision) throw fail("CODEX_BACKUP_INVALID");
    return { ...data, id, original };
  }

  async recovery(snapshot) {
    const state = await this.readState();
    let currentId = state.currentId;
    if (state.pendingId) {
      const pending = await this.readBackup(state.pendingId);
      // The write-ahead record remains valid after a crash on either side of rename.
      if (snapshot.revision === pending.afterRevision) currentId = state.pendingId;
      else if (snapshot.revision !== pending.beforeRevision) currentId = state.pendingId;
    }
    if (state.restoring && currentId) {
      const restoring = await this.readBackup(currentId);
      if (snapshot.revision === restoring.beforeRevision) currentId = null;
    }
    return currentId ? await this.readBackup(currentId) : undefined;
  }

  async prepare(snapshot, nextBytes) {
    await this.directory(this.backupDir, true);
    const prior = await this.recovery(snapshot);
    const record = Buffer.from(JSON.stringify({
      version: 1, createdAt: new Date().toISOString(), nonce: crypto.randomUUID(),
      originalExists: snapshot.exists, original: snapshot.bytes?.toString("base64") || "",
      beforeRevision: snapshot.revision, afterRevision: hash(nextBytes),
    }));
    const id = hash(record);
    const filePath = path.join(this.backupDir, id + ".json");
    const handle = await this.fs.open(filePath, "wx", 0o600);
    try { await handle.writeFile(record); await handle.sync(); } finally { await handle.close(); }
    // Persist recovery metadata before the config rename. No metadata write is needed
    // after rename, so a process interruption cannot orphan an applied backup.
    await this.atomicWrite(this.statePath, Buffer.from(JSON.stringify({ version: 1, currentId: prior?.id || null, pendingId: id, restoring: false })));
    return this.readBackup(id);
  }

  async replace(snapshot, bytes, validateBeforeCommit) {
    await this.atomicWrite(this.configPath, bytes, async () => {
      if (validateBeforeCommit) await validateBeforeCommit();
      // Profile decryption and login checks can yield to an external editor.
      // Re-read the source only after those asynchronous validations finish.
      await this.check(snapshot.revision);
    });
  }

  async restore(snapshot, backup, validateBeforeCommit) {
    if (snapshot.revision !== backup.afterRevision) throw fail("CODEX_CONFIG_CHANGED");
    await this.atomicWrite(this.statePath, Buffer.from(JSON.stringify({ version: 1, currentId: backup.id, pendingId: null, restoring: true })));
    if (backup.originalExists) return this.replace(snapshot, backup.original, validateBeforeCommit);
    if (validateBeforeCommit) await validateBeforeCommit();
    await this.check(snapshot.revision);
    await this.fs.unlink(this.configPath);
  }
}
module.exports = { CodexConfigStore, MAX_CONFIG_BYTES, validHash, validRevision };
