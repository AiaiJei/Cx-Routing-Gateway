const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const { CodexConfigStore, validRevision, validHash } = require("./codex-config-store.cjs");
const { isSecureStorageAvailable } = require("./github-token-store.cjs");
const { fail, sanitize } = require("./codex-errors.cjs");
const { validateRecipe, directUrl, recipeHash } = require("./codex-direct-projection.cjs");
const { validSearchRestore } = require("./codex-search-policy.cjs");
const MAX_BYTES = 8 * 1024 * 1024;
const queues = new Map();
const hash = (bytes) => (bytes === null ? "missing" : crypto.createHash("sha256").update(bytes).digest("hex"));
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value) =>
  typeof value === "string" &&
  /^direct_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const bounded = (value, max) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
function validateData(data) {
  if (
    !record(data) ||
    data.version !== 1 ||
    Object.keys(data).some((key) => !["version", "profiles", "lastDirectProfileId", "gatewaySearchRestore", "gatewaySearchRecoveries", "gatewaySearchRollback"].includes(key)) ||
    (data.gatewaySearchRestore !== undefined && !validSearchRestore(data.gatewaySearchRestore)) ||
    (data.gatewaySearchRecoveries !== undefined && (!Array.isArray(data.gatewaySearchRecoveries) ||
      data.gatewaySearchRecoveries.length > 2 ||
      new Set(data.gatewaySearchRecoveries.map(item => item?.backupId)).size !== data.gatewaySearchRecoveries.length ||
      data.gatewaySearchRecoveries.some(item => !record(item) || Object.keys(item).length !== 2 ||
        Object.keys(item).some(key => !["backupId", "restore"].includes(key)) || !validHash(item.backupId) ||
        !(item.restore === null || validSearchRestore(item.restore))))) ||
    (data.gatewaySearchRollback !== undefined && (!record(data.gatewaySearchRollback) ||
      ![3, 4, 5].includes(Object.keys(data.gatewaySearchRollback).length) ||
      Object.keys(data.gatewaySearchRollback).some(key => !["backupId", "targetRevision", "targetFingerprint", "sourceFingerprint", "restore"].includes(key)) ||
      !validHash(data.gatewaySearchRollback.backupId) || !validRevision(data.gatewaySearchRollback.targetRevision) ||
      (data.gatewaySearchRollback.targetFingerprint !== undefined && !validHash(data.gatewaySearchRollback.targetFingerprint)) ||
      (data.gatewaySearchRollback.sourceFingerprint !== undefined && !validHash(data.gatewaySearchRollback.sourceFingerprint)) ||
      !(data.gatewaySearchRollback.restore === null || validSearchRestore(data.gatewaySearchRollback.restore)))) ||
    !Array.isArray(data.profiles) ||
    data.profiles.length > 50 ||
    new Set(data.profiles.map((profile) => profile.id)).size !== data.profiles.length
  )
    throw fail("CODEX_PROFILES_INVALID");
  for (const profile of data.profiles) {
    if (
      !record(profile) ||
      !id(profile.id) ||
      !["custom", "snapshot"].includes(profile.kind) ||
      !bounded(profile.name, 80) ||
      !bounded(profile.updatedAt, 64) ||
      !Number.isFinite(Date.parse(profile.updatedAt)) ||
      Object.keys(profile).some(
        (key) =>
          ![
            "id",
            "kind",
            "name",
            "updatedAt",
            "baseUrl",
            "models",
            "defaultModel",
            "apiKey",
            "recipe",
            "fingerprint",
          ].includes(key),
      )
    )
      throw fail("CODEX_PROFILES_INVALID");
    if (profile.kind === "custom") {
      if (
        !directUrl(profile.baseUrl) ||
        !Array.isArray(profile.models) ||
        profile.models.length < 1 ||
        profile.models.length > 100 ||
        !profile.models.every((model) => bounded(model, 256)) ||
        new Set(profile.models).size !== profile.models.length ||
        !profile.models.includes(profile.defaultModel) ||
        typeof profile.apiKey !== "string" ||
        !profile.apiKey ||
        profile.apiKey.length > 8192 ||
        !/^[\x21-\x7e]+$/.test(profile.apiKey)
      )
        throw fail("CODEX_PROFILES_INVALID");
    }
    if (profile.recipe) {
      validateRecipe(profile.recipe);
      if (profile.fingerprint !== recipeHash(profile.recipe)) throw fail("CODEX_PROFILES_INVALID");
    } else if (profile.kind === "snapshot") throw fail("CODEX_PROFILES_INVALID");
  }
  if (
    data.lastDirectProfileId !== undefined &&
    data.lastDirectProfileId !== "official" &&
    !data.profiles.some((profile) => profile.id === data.lastDirectProfileId)
  )
    throw fail("CODEX_PROFILES_INVALID");
}
function createDirectProfileStore({ filePath, safeStorage, fsImpl = fs, platform = process.platform } = {}) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw fail("CODEX_INPUT_INVALID");
  const io = new CodexConfigStore({ codexHome: path.dirname(filePath), fsImpl });
  const queueKey = process.platform === "win32" ? path.resolve(filePath).toLowerCase() : path.resolve(filePath);
  async function snapshot() {
    try {
      return await io.read(filePath, MAX_BYTES);
    } catch (error) {
      throw sanitize(error, "CODEX_PROFILES_INVALID");
    }
  }
  async function read() {
    const bytes = await snapshot(),
      available = await isSecureStorageAvailable(safeStorage, platform);
    if (bytes === null)
      return { revision: "missing", secureStorageAvailable: available, data: { version: 1, profiles: [] } };
    if (!available) throw fail("CODEX_PROFILES_UNAVAILABLE");
    try {
      const decrypted = await safeStorage.decryptStringAsync(bytes);
      if (typeof decrypted?.result !== "string" || Buffer.byteLength(decrypted.result) > MAX_BYTES) throw Error();
      const data = JSON.parse(decrypted.result);
      validateData(data);
      return { revision: hash(bytes), secureStorageAvailable: true, data };
    } catch {
      throw fail("CODEX_PROFILES_INVALID");
    }
  }
  function serialize(operation) {
    const previous = queues.get(queueKey) || Promise.resolve(),
      result = previous.then(operation).catch((error) => {
        throw sanitize(error);
      }),
      settled = result.catch(() => {});
    queues.set(queueKey, settled);
    void settled.finally(() => {
      if (queues.get(queueKey) === settled) queues.delete(queueKey);
    });
    return result;
  }
  async function update(expectedRevision, mutate, validateBeforeCommit) {
    if (!validRevision(expectedRevision)) throw fail("CODEX_INPUT_INVALID");
    return serialize(async () => {
      const current = await read();
      if (current.revision !== expectedRevision) throw fail("CODEX_PROFILES_CHANGED");
      if (!current.secureStorageAvailable) throw fail("CODEX_PROFILES_UNAVAILABLE");
      const next = await mutate(structuredClone(current.data));
      validateData(next);
      const text = JSON.stringify(next);
      if (Buffer.byteLength(text) > MAX_BYTES - 1024) throw fail("CODEX_PROFILE_LIMIT");
      let encrypted;
      try {
        encrypted = await safeStorage.encryptStringAsync(text);
      } catch {
        throw fail("CODEX_PROFILES_UNAVAILABLE");
      }
      if (!Buffer.isBuffer(encrypted) || !encrypted.length || encrypted.length > MAX_BYTES)
        throw fail("CODEX_PROFILES_UNAVAILABLE");
      await io.atomicWrite(
        filePath,
        encrypted,
        async () => {
          if (hash(await snapshot()) !== current.revision) throw fail("CODEX_PROFILES_CHANGED");
          if (validateBeforeCommit) await validateBeforeCommit();
        },
        MAX_BYTES,
      );
      return { revision: hash(encrypted), secureStorageAvailable: true, data: next };
    });
  }
  return { read, update };
}
module.exports = { createDirectProfileStore, validateData };
