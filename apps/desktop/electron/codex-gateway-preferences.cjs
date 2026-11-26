const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const { CodexConfigStore, validRevision } = require("./codex-config-store.cjs");
const { fail, sanitize } = require("./codex-errors.cjs");
const MAX_BYTES = 128 * 1024;
const queues = new Map();
const digest = (bytes) => (bytes === null ? "missing" : crypto.createHash("sha256").update(bytes).digest("hex"));
const bounded = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
function choiceValid(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) =>
      ["routeIds", "defaultRouteId", "credentialSource", "credentialId"].includes(key),
    ) &&
    Array.isArray(value.routeIds) &&
    value.routeIds.length <= 100 &&
    value.routeIds.every(bounded) &&
    new Set(value.routeIds).size === value.routeIds.length &&
    typeof value.defaultRouteId === "string" &&
    (value.routeIds.length ? value.routeIds.includes(value.defaultRouteId) : value.defaultRouteId === "") &&
    ["current", "stored", "manual"].includes(value.credentialSource) &&
    (value.credentialSource === "stored" ? bounded(value.credentialId) : value.credentialId === undefined)
  );
}
function createGatewayPreferences({
  filePath,
  codexHome,
  fsImpl = fs,
  getFallback = async () => ({ routeIds: [], defaultRouteId: "", credentialSource: "current" }),
} = {}) {
  if (
    typeof filePath !== "string" ||
    !path.isAbsolute(filePath) ||
    typeof codexHome !== "string" ||
    !path.isAbsolute(codexHome)
  )
    throw fail("CODEX_INPUT_INVALID");
  const io = new CodexConfigStore({ codexHome: path.dirname(filePath), fsImpl });
  const home = path.resolve(codexHome),
    normalized = process.platform === "win32" ? home.toLowerCase() : home;
  const homeId = crypto.createHash("sha256").update(normalized).digest("hex");
  const queueKey = process.platform === "win32" ? path.resolve(filePath).toLowerCase() : path.resolve(filePath);
  async function read() {
    let bytes;
    try {
      bytes = await io.read(filePath, MAX_BYTES);
    } catch (error) {
      throw sanitize(error, "CODEX_PREFERENCES_INVALID");
    }
    if (bytes === null) return { revision: "missing", data: { version: 1, homes: {} } };
    try {
      const data = JSON.parse(bytes.toString("utf8"));
      if (
        !data ||
        data.version !== 1 ||
        Object.keys(data).some((key) => !["version", "homes"].includes(key)) ||
        !data.homes ||
        typeof data.homes !== "object" ||
        Array.isArray(data.homes) ||
        Object.keys(data.homes).length > 50
      )
        throw Error();
      for (const [id, value] of Object.entries(data.homes))
        if (!/^[a-f0-9]{64}$/.test(id) || !choiceValid(value)) throw Error();
      return { revision: digest(bytes), data };
    } catch {
      throw fail("CODEX_PREFERENCES_INVALID");
    }
  }
  async function result(read) {
    const value = read.data.homes[homeId],
      fallback = value || (await getFallback());
    return {
      revision: read.revision,
      exists: !!value,
      routeIds: [...fallback.routeIds],
      defaultRouteId: fallback.defaultRouteId,
      credentialSource: fallback.credentialSource,
      ...(fallback.credentialId ? { credentialId: fallback.credentialId } : {}),
    };
  }
  function serialize(operation) {
    const before = queues.get(queueKey) || Promise.resolve(),
      run = before.then(operation).catch((error) => {
        throw sanitize(error);
      }),
      settled = run.catch(() => {});
    queues.set(queueKey, settled);
    void settled.finally(() => {
      if (queues.get(queueKey) === settled) queues.delete(queueKey);
    });
    return run;
  }
  return {
    async get() {
      return result(await read());
    },
    async save(input) {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        !validRevision(input.expectedRevision) ||
        Object.keys(input).some(
          (key) =>
            !["expectedRevision", "routeIds", "defaultRouteId", "credentialSource", "credentialId"].includes(key),
        )
      )
        throw fail("CODEX_INPUT_INVALID");
      const { expectedRevision, ...choice } = input;
      if (!choiceValid(choice)) throw fail("CODEX_INPUT_INVALID");
      return serialize(async () => {
        const current = await read();
        if (current.revision !== expectedRevision) throw fail("CODEX_PREFERENCES_CHANGED");
        if (!current.data.homes[homeId] && Object.keys(current.data.homes).length >= 50)
          throw fail("CODEX_PREFERENCES_INVALID");
        const next = { version: 1, homes: { ...current.data.homes, [homeId]: choice } },
          bytes = Buffer.from(JSON.stringify(next, null, 2) + "\n");
        if (bytes.length > MAX_BYTES) throw fail("CODEX_PREFERENCES_INVALID");
        await io.atomicWrite(
          filePath,
          bytes,
          async () => {
            if ((await read()).revision !== current.revision) throw fail("CODEX_PREFERENCES_CHANGED");
          },
          MAX_BYTES,
        );
        return result({ revision: digest(bytes), data: next });
      });
    },
  };
}
module.exports = { createGatewayPreferences };
