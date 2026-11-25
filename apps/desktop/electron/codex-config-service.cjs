const os = require("node:os");
const path = require("node:path");
const { parse, stringify } = require("smol-toml");
const { CodexConfigStore, MAX_CONFIG_BYTES, validHash, validRevision } = require("./codex-config-store.cjs");
const { fail, sanitize } = require("./codex-errors.cjs");
const { editCodexToml } = require("./codex-toml-editor.cjs");
const PROVIDER = "cx_routing_gateway";
const efforts = new Set(["none", "minimal", "low", "medium", "high", "xhigh"]);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const boundedText = value => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
function safeGatewayUrl(value) {
  if (typeof value !== "string" || value.length > 128) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/v1" || url.username || url.password || url.search || url.hash) return undefined;
    return url.href;
  } catch { return undefined; }
}
function validateSelection(input, withKey = false) {
  if (!isRecord(input) || typeof input.routeId !== "string" || !input.routeId.trim() || input.routeId.length > 100 ||
      /[\u0000-\u001f\u007f]/.test(input.routeId) || (input.reasoningEffort !== undefined && !efforts.has(input.reasoningEffort)) ||
      Object.keys(input).some(key => !(withKey ? ["routeId", "reasoningEffort", "clientKey", "expectedRevision"] : ["routeId", "reasoningEffort"]).includes(key))) throw fail("CODEX_INPUT_INVALID");
  if (withKey && (!validRevision(input.expectedRevision) || typeof input.clientKey !== "string" || input.clientKey.length < 8 || input.clientKey.length > 512 || !/^[\x21-\x7e]+$/.test(input.clientKey))) throw fail("CODEX_INPUT_INVALID");
}
function configFrom(snapshot) {
  if (!snapshot.exists) return {};
  try { return parse(new TextDecoder("utf-8", { fatal: true }).decode(snapshot.bytes), { integersAsBigInt: true }); }
  catch { throw fail("CODEX_CONFIG_INVALID"); }
}
function provider(config) { return isRecord(config.model_providers) && isRecord(config.model_providers[PROVIDER]) ? config.model_providers[PROVIDER] : undefined; }
function buildConfig(config, route, effort, key) {
  if (config.model_providers !== undefined && !isRecord(config.model_providers)) throw fail("CODEX_CONFIG_INVALID");
  const existing = provider(config) || {};
  const managed = { ...existing, name: "Cx-Routing Gateway", base_url: route.baseUrl, wire_api: "responses", requires_openai_auth: false, supports_websockets: false, experimental_bearer_token: key };
  for (const field of ["env_key", "env_key_instructions", "gateway_oauth"]) delete managed[field];
  for (const field of ["http_headers", "env_http_headers"]) {
    if (managed[field] !== undefined && !isRecord(managed[field])) delete managed[field];
    else if (managed[field]) managed[field] = Object.fromEntries(Object.entries(managed[field]).filter(([name]) => !["authorization", "x-api-key", "api-key"].includes(name.toLowerCase())));
  }
  const next = { ...config, model: route.model, model_provider: PROVIDER, model_providers: { ...(config.model_providers || {}), [PROVIDER]: managed } };
  if (effort !== undefined) next.model_reasoning_effort = effort;
  return next;
}
function patchedConfig(snapshot, config, route, effort, key) {
  const next = buildConfig(config, route, effort, key);
  const managed = next.model_providers[PROVIDER];
  const prefix = ["model_providers", PROVIDER];
  const set = [["model"], ["model_provider"]].map(parts => [parts, next[parts[0]]]);
  if (effort !== undefined) set.push([["model_reasoning_effort"], effort]);
  for (const field of ["name", "base_url", "wire_api", "requires_openai_auth", "supports_websockets", "experimental_bearer_token"]) set.push([[...prefix, field], managed[field]]);
  const remove = ["env_key", "env_key_instructions", "gateway_oauth"].map(field => [...prefix, field]);
  const previous = provider(config);
  for (const field of ["http_headers", "env_http_headers"]) {
    if (previous?.[field] === undefined) continue;
    if (!isRecord(previous[field])) remove.push([...prefix, field]);
    else for (const name of Object.keys(previous[field])) {
      if (["authorization", "x-api-key", "api-key"].includes(name.toLowerCase())) remove.push([...prefix, field, name]);
    }
  }
  const source = snapshot.bytes?.toString("utf8") || "";
  return Buffer.from(editCodexToml(source, { set, remove }));
}
function createCodexConfigService({ codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex")), fsImpl, getRoute, validateKey } = {}) {
  if (typeof getRoute !== "function" || typeof validateKey !== "function") throw fail("CODEX_INPUT_INVALID");
  const store = new CodexConfigStore({ codexHome, fsImpl });
  async function resolveRoute(routeId) {
    let route;
    try { route = await getRoute(routeId); } catch (error) { throw sanitize(error, "CODEX_ROUTE_UNAVAILABLE"); }
    if (!route || !boundedText(route.model) || !safeGatewayUrl(route.baseUrl)) throw fail("CODEX_ROUTE_UNAVAILABLE");
    return { model: route.model, baseUrl: safeGatewayUrl(route.baseUrl) };
  }
  async function statusOf(snapshot, recovery = () => store.recovery(snapshot)) {
    const config = configFrom(snapshot);
    const managed = provider(config);
    const active = config.model_provider === PROVIDER;
    const baseUrl = active && safeGatewayUrl(managed?.base_url);
    const backup = await recovery();
    return {
      configPath: store.configPath, exists: snapshot.exists, revision: snapshot.revision,
      configured: !!(active && boundedText(config.model) && baseUrl && managed?.wire_api === "responses"),
      credentialConfigured: !!(active && typeof managed?.experimental_bearer_token === "string" && managed.experimental_bearer_token.length > 0),
      ...(boundedText(config.model) ? { model: config.model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(efforts.has(config.model_reasoning_effort) ? { reasoningEffort: config.model_reasoning_effort } : {}),
      ...(backup ? { backup: { id: backup.id, createdAt: backup.createdAt } } : {}),
    };
  }
  function run(operation) { return store.serialize(async () => { try { return await operation(); } catch (error) { throw sanitize(error); } }); }
  return {
    getStatus: () => run(async () => statusOf(await store.snapshot())),
    preview: input => run(async () => {
      validateSelection(input);
      const snapshot = await store.snapshot();
      const config = configFrom(snapshot);
      const route = await resolveRoute(input.routeId);
      // Validate the actual source edit now, so unsupported table shapes are
      // explained before the user enters a Key or confirms an apply.
      patchedConfig(snapshot, config, route, input.reasoningEffort, "<Gateway client Key>");
      // Preview only the generated fields, never serialize unrelated config or headers.
      const previewConfig = buildConfig({}, route, input.reasoningEffort ?? (efforts.has(config.model_reasoning_effort) ? config.model_reasoning_effort : undefined), "<Gateway client Key>");
      const old = provider(config);
      return {
        configPath: store.configPath, revision: snapshot.revision, model: route.model, baseUrl: route.baseUrl,
        configPreview: stringify(previewConfig, { numbersAsFloat: true }),
        replacesCurrentProvider: snapshot.exists && (config.model_provider !== PROVIDER || old?.name !== "Cx-Routing Gateway" || old?.base_url !== route.baseUrl || old?.wire_api !== "responses"),
      };
    }),
    apply: input => run(async () => {
      validateSelection(input, true);
      const snapshot = await store.check(input.expectedRevision);
      const config = configFrom(snapshot);
      const route = await resolveRoute(input.routeId);
      try { await validateKey(input.clientKey, route.model); } catch (error) { throw sanitize(error, "CODEX_KEY_REJECTED"); }
      // Resolve again after credential validation so a concurrent route edit cannot
      // apply a route disabled or replaced during the HTTP round trip.
      const currentRoute = await resolveRoute(input.routeId);
      if (currentRoute.model !== route.model || currentRoute.baseUrl !== route.baseUrl) throw fail("CODEX_ROUTE_UNAVAILABLE");
      const next = patchedConfig(snapshot, config, route, input.reasoningEffort, input.clientKey);
      if (next.length > MAX_CONFIG_BYTES) throw fail("CODEX_CONFIG_TOO_LARGE");
      await store.check(snapshot.revision);
      const backup = await store.prepare(snapshot, next);
      await store.replace(snapshot, next);
      // The rename is the commit boundary. Return its known result instead of
      // turning a later scanner/read failure into a misleading failed apply.
      return statusOf({ bytes: next, exists: true, revision: backup.afterRevision }, async () => backup);
    }),
    restore: input => run(async () => {
      if (!isRecord(input) || !validHash(input.backupId) || !validRevision(input.expectedRevision) || Object.keys(input).some(key => !["backupId", "expectedRevision"].includes(key))) throw fail("CODEX_INPUT_INVALID");
      const snapshot = await store.check(input.expectedRevision);
      const backup = await store.recovery(snapshot);
      if (!backup || backup.id !== input.backupId) throw fail("CODEX_BACKUP_INVALID");
      await store.restore(snapshot, backup);
      return statusOf({ bytes: backup.original, exists: backup.originalExists, revision: backup.beforeRevision }, async () => undefined);
    }),
  };
}
module.exports = { createCodexConfigService, safeGatewayUrl };
