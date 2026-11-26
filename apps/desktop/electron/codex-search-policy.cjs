const { fail } = require("./codex-errors.cjs");
const crypto = require("node:crypto");
const modes = ["cached", "live", "disabled"];
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const bounded = value => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
const at = (config, parts) => parts.reduce((value, part) => value?.[part], config);
const routingKeys = ["model_provider", "model", "model_catalog_json", "openai_base_url", "chatgpt_base_url", "forced_login_method", "profile"];
function canonical(value) {
  if (value === undefined) return ["absent"];
  if (value === null) return ["null"];
  if (Array.isArray(value)) return ["array", value.map(canonical)];
  if (value instanceof Date) return ["date", value.toISOString()];
  if (typeof value === "object") return ["object", Object.keys(value).sort().map(key => [key, canonical(value[key])])];
  return [typeof value, typeof value === "number" && Object.is(value, -0) ? "-0" : String(value)];
}
function searchRoutingFingerprint(config, restore) {
  const providerId = config.model_provider === undefined ? "openai" : config.model_provider;
  const profile = typeof config.profile === "string" ? config.profiles?.[config.profile] : undefined;
  const paths = [["web_search"], ...(restore?.entries || []).map(entry => entry.parts)];
  const projection = {
    root: routingKeys.map(key => [key, config[key]]),
    provider: typeof providerId === "string" ? config.model_providers?.[providerId] : undefined,
    profile: routingKeys.filter(key => key !== "profile").concat("web_search").map(key => [key, profile?.[key]]),
    search: paths.map(parts => [parts, at(config, parts)]),
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical(projection))).digest("hex");
}
function validSearchRestore(value) {
  if (!record(value) || value.version !== 1 || Object.keys(value).some(key => !["version", "entries", "released", "releaseFromRevision"].includes(key)) ||
    (value.released !== undefined && value.released !== true) ||
    (value.released ? !/^[a-f0-9]{64}$/.test(value.releaseFromRevision) : value.releaseFromRevision !== undefined) ||
    !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > 101) return false;
  const seen = new Set();
  return value.entries.every(entry => {
    if (!record(entry) || Object.keys(entry).length !== 2 || !Object.keys(entry).every(key => ["parts", "original"].includes(key)) ||
      !Array.isArray(entry.parts) || !(entry.original === null || modes.includes(entry.original)) ||
      !(entry.parts.length === 1 && entry.parts[0] === "web_search" ||
        entry.parts.length === 3 && entry.parts[0] === "profiles" && bounded(entry.parts[1]) && entry.parts[2] === "web_search")) return false;
    const key = JSON.stringify(entry.parts);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) && seen.has('["web_search"]');
}
function activeProfile(config) {
  if (config.profile === undefined) return undefined;
  if (!bounded(config.profile) || !record(config.profiles?.[config.profile])) throw fail("CODEX_CONFIG_UNSUPPORTED");
  return config.profile;
}
function describeSearchPolicy(config) {
  const profile = activeProfile(config);
  return {
    webSearch: config.web_search === "disabled" && (!profile || config.profiles[profile].web_search === undefined || config.profiles[profile].web_search === "disabled") ? "disabled" : "unchanged",
    ...(profile ? { activeProfile: profile } : {}),
    affectsActiveProfile: false,
    externalOverrides: "not-managed",
  };
}
function planSearchPolicy(config, mode, routes = [], previous, revision) {
  if (previous !== undefined && !validSearchRestore(previous)) throw fail("CODEX_PROFILES_INVALID");
  const profile = activeProfile(config);
  const gateway = config.model_provider === "cx_routing_gateway";
  const disabled = mode === "gateway" && routes.some(route => ["Chat", "Mes"].includes(route.outboundProtocol));
  const active = gateway && previous && (!previous.released || previous.releaseFromRevision === revision);
  // A failed restoration followed by an external edit is ambiguous. Preserve
  // that edit and stop rather than silently accepting a still-disabled value.
  if (gateway && previous?.released && !active && previous.entries.some(entry =>
    entry.original !== "disabled" && at(config, entry.parts) === "disabled")) throw fail("CODEX_CONFIG_CHANGED");
  const state = active ? structuredClone(previous) : { version: 1, entries: [] };
  delete state.released;
  delete state.releaseFromRevision;
  const set = [], remove = [];
  if (disabled) {
    const paths = [["web_search"], ...(profile ? [["profiles", profile, "web_search"]] : [])];
    for (const parts of paths) {
      const current = at(config, parts);
      if (current !== undefined && !modes.includes(current)) throw fail("CODEX_CONFIG_UNSUPPORTED");
      if (!state.entries.some(entry => JSON.stringify(entry.parts) === JSON.stringify(parts)))
        state.entries.push({ parts, original: current ?? null });
    }
  }
  // This also recognizes a prepared-but-uncommitted policy state after an IO
  // failure. A genuinely different external value must never be overwritten.
  if (active) {
    for (const entry of previous.entries) {
      const current = at(config, entry.parts);
      if (current !== "disabled" && current !== (entry.original ?? undefined)) throw fail("CODEX_CONFIG_CHANGED");
    }
  }
  if (disabled) {
    for (const entry of state.entries) set.push([entry.parts, "disabled"]);
  } else if (active) {
    for (const entry of previous.entries) {
      if (entry.original === null) remove.push(entry.parts);
      else set.push([entry.parts, entry.original]);
    }
  }
  const restored = !disabled && !!active;
  return {
    set, remove,
    ...(disabled ? { restore: state } : restored ? { restore: { ...previous, released: true, releaseFromRevision: revision } } : {}),
    facts: {
      webSearch: disabled ? "disabled" : restored ? "restored" : "unchanged",
      ...(disabled ? { reason: "converted-upstream" } : {}),
      ...(profile ? { activeProfile: profile } : {}),
      affectsActiveProfile: disabled ? !!profile : restored && previous.entries.some(entry => entry.parts.length === 3),
      externalOverrides: "not-managed",
    },
  };
}
module.exports = { validSearchRestore, planSearchPolicy, describeSearchPolicy, searchRoutingFingerprint };
