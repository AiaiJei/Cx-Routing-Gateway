const { parse } = require("smol-toml");
const { parseTOML } = require("toml-eslint-parser");
const crypto = require("node:crypto");
const { fail } = require("./codex-errors.cjs");
const ROOT_KEYS = [
  "model_provider",
  "model",
  "model_catalog_json",
  "openai_base_url",
  "chatgpt_base_url",
  "forced_login_method",
];
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 256) =>
  typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const keyParts = (node) => node.keys.map((key) => (key.type === "TOMLBare" ? key.name : key.value));
const starts = (parts, prefix) => prefix.length <= parts.length && prefix.every((part, i) => part === parts[i]);
function directUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      (url.protocol === "http:" && !local) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return undefined;
    return url.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}
function assertIndependentDirectAuth(config) {
  const id = config.model_provider === undefined ? "openai" : config.model_provider;
  const provider = isRecord(config.model_providers?.[id]) ? config.model_providers[id] : undefined;
  const hasRedirect =
    provider?.base_url !== undefined ||
    (id === "openai" && (config.openai_base_url !== undefined || config.chatgpt_base_url !== undefined));
  if (id === "openai" && !hasRedirect) return;
  const requiresOfficial =
    provider?.requires_openai_auth === undefined ? id === "openai" : provider.requires_openai_auth;
  const explicitToken =
    typeof provider?.experimental_bearer_token === "string" &&
    /^[\x21-\x7e]{1,8192}$/.test(provider.experimental_bearer_token);
  const explicitEnvironment =
    typeof provider?.env_key === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(provider.env_key);
  // Codex resolves provider env_key (missing => error), then explicit bearer,
  // before ambient official auth. Headers alone cannot prevent the ambient
  // AuthProvider from replacing Authorization.
  if (requiresOfficial !== false && !explicitToken && !explicitEnvironment) throw fail("CODEX_DIRECT_AUTH_UNSAFE");
}
function currentDirect(config) {
  const id = config.model_provider === undefined ? "openai" : config.model_provider;
  if (!text(id, 100) || !isRecord(config.model_providers || {})) return { mode: "unknown" };
  if (id === "cx_routing_gateway") return { mode: "gateway" };
  const provider = config.model_providers?.[id];
  if (provider !== undefined && !isRecord(provider)) return { mode: "unknown" };
  const cleanOfficial =
    id === "openai" &&
    config.openai_base_url === undefined &&
    config.chatgpt_base_url === undefined &&
    provider === undefined &&
    config.model_catalog_json === undefined &&
    (config.forced_login_method === undefined || config.forced_login_method === "chatgpt");
  if (cleanOfficial)
    return {
      mode: "direct",
      direct: {
        kind: "official",
        name: "官方默认",
        importable: true,
        ...(text(config.model) ? { model: config.model } : {}),
      },
    };
  const rawUrl =
    provider?.base_url || (id === "openai" ? config.openai_base_url || config.chatgpt_base_url : undefined);
  const url = directUrl(rawUrl);
  const kind = provider?.wire_api === "responses" && url ? "custom" : "snapshot";
  return {
    mode: "direct",
    direct: {
      kind,
      name: text(provider?.name, 80) ? provider.name : id === "openai" ? "当前 Codex 配置" : id,
      providerId: id,
      importable: true,
      ...(url ? { baseUrl: url } : {}),
      ...(text(config.model) ? { model: config.model } : {}),
      ...(!url && rawUrl !== undefined ? { warning: "当前接口地址未通过显示校验，导入方案仅保存原有路由。" } : {}),
    },
  };
}
function captureRouting(source, config) {
  const status = currentDirect(config);
  if (status.mode !== "direct") throw fail("CODEX_CONFIG_UNSUPPORTED");
  assertIndependentDirectAuth(config);
  const providerId = config.model_provider === undefined ? "openai" : config.model_provider;
  const prefix = ["model_providers", providerId];
  let ast;
  try {
    ast = parseTOML(source, { tomlVersion: "1.0" });
  } catch {
    throw fail("CODEX_CONFIG_UNSUPPORTED");
  }
  const values = [];
  function entry(node, parts) {
    if (parts.length === 1 && ROOT_KEYS.includes(parts[0])) {
      values.push({ parts, raw: source.slice(...node.value.range) });
      return;
    }
    if (starts(parts, prefix)) {
      values.push({ parts, raw: source.slice(...node.value.range) });
      return;
    }
    if (starts(prefix, parts) && node.value.type === "TOMLInlineTable")
      for (const child of node.value.body) entry(child, [...parts, ...keyParts(child.key)]);
    else if (starts(prefix, parts)) throw fail("CODEX_CONFIG_UNSUPPORTED");
  }
  for (const node of ast.body[0].body) {
    if (node.type === "TOMLKeyValue") entry(node, keyParts(node.key));
    else {
      const parts = node.resolvedKey;
      if (starts(parts, prefix) && node.kind === "array") throw fail("CODEX_CONFIG_UNSUPPORTED");
      if (starts(parts, prefix) && node.body.length === 0) values.push({ parts, raw: "{}" });
      for (const child of node.body) entry(child, [...parts, ...keyParts(child.key)]);
    }
  }
  values.sort((a, b) => JSON.stringify(a.parts).localeCompare(JSON.stringify(b.parts)));
  const recipe = { version: 1, providerId, values };
  validateRecipe(recipe);
  return { recipe, fingerprint: recipeHash(recipe), status };
}
function validateRecipe(recipe) {
  if (
    !isRecord(recipe) ||
    Object.keys(recipe).some((key) => !["version", "providerId", "values"].includes(key)) ||
    recipe.version !== 1 ||
    !text(recipe.providerId, 100) ||
    recipe.providerId === "cx_routing_gateway" ||
    !Array.isArray(recipe.values) ||
    recipe.values.length > 1000
  )
    throw fail("CODEX_PROFILES_INVALID");
  const seen = new Set();
  for (const value of recipe.values) {
    if (
      !isRecord(value) ||
      Object.keys(value).some((key) => !["parts", "raw"].includes(key)) ||
      !Array.isArray(value.parts) ||
      !value.parts.length ||
      !value.parts.every((part) => text(part, 256)) ||
      typeof value.raw !== "string" ||
      Buffer.byteLength(value.raw) > 1024 * 1024 ||
      !(
        (value.parts.length === 1 && ROOT_KEYS.includes(value.parts[0])) ||
        starts(value.parts, ["model_providers", recipe.providerId])
      )
    )
      throw fail("CODEX_PROFILES_INVALID");
    const key = JSON.stringify(value.parts);
    if (seen.has(key)) throw fail("CODEX_PROFILES_INVALID");
    for (const previous of recipe.values) {
      if (previous === value) break;
      if (starts(value.parts, previous.parts) || starts(previous.parts, value.parts))
        throw fail("CODEX_PROFILES_INVALID");
    }
    seen.add(key);
    try {
      const doc = parse("v = " + value.raw, { integersAsBigInt: true });
      if (Object.keys(doc).length !== 1 || !("v" in doc)) throw Error();
    } catch {
      throw fail("CODEX_PROFILES_INVALID");
    }
  }
  try {
    const config = configFromRecipe(recipe);
    if ((config.model_provider === undefined ? "openai" : config.model_provider) !== recipe.providerId) throw Error();
    assertIndependentDirectAuth(config);
  } catch {
    throw fail("CODEX_PROFILES_INVALID");
  }
}
function recipeHash(recipe) {
  return crypto.createHash("sha256").update(JSON.stringify(recipe)).digest("hex");
}
function configFromRecipe(recipe) {
  return parse(
    recipe.values
      .map((value) => value.parts.map((part) => JSON.stringify(part)).join(".") + " = " + value.raw)
      .join("\n"),
    { integersAsBigInt: true },
  );
}
function recipeSet(recipe) {
  return recipe.values.map((value) => [value.parts, { tomlRaw: value.raw }]);
}
function rootRemoval() {
  return ROOT_KEYS.map((key) => [key]);
}
module.exports = {
  ROOT_KEYS,
  directUrl,
  currentDirect,
  captureRouting,
  validateRecipe,
  recipeHash,
  recipeSet,
  rootRemoval,
  configFromRecipe,
  assertIndependentDirectAuth,
};
