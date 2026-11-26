const { stringify } = require("smol-toml");
const { fail } = require("./codex-errors.cjs");
const { customProvider } = require("./codex-direct-profiles.cjs");
const { recipeSet, rootRemoval } = require("./codex-direct-projection.cjs");
const { editCodexToml } = require("./codex-toml-editor.cjs");
const PROVIDER = "cx_routing_gateway";
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const provider = (config) =>
  isRecord(config.model_providers) && isRecord(config.model_providers[PROVIDER])
    ? config.model_providers[PROVIDER]
    : undefined;
function sourceEdits(config, selection, resolved, catalogPath, key) {
  const edits = routingEdits(config, selection, resolved, catalogPath, key);
  return { set: [...edits.set, ...(resolved.searchPolicy?.set || [])], remove: [...edits.remove, ...(resolved.searchPolicy?.remove || [])] };
}
function routingEdits(config, selection, resolved, catalogPath, key) {
  if (selection.mode === "direct") return directEdits(config, resolved.profile, catalogPath, key);
  if (config.model_providers !== undefined && !isRecord(config.model_providers)) throw fail("CODEX_CONFIG_INVALID");
  const prefix = ["model_providers", PROVIDER];
  const defaultModel = resolved.routes.find((route) => route.id === selection.defaultRouteId).model;
  const managed = {
    name: "Cx-Routing Gateway",
    base_url: resolved.baseUrl,
    wire_api: "responses",
    requires_openai_auth: false,
    supports_websockets: false,
    experimental_bearer_token: key,
  };
  const set = [
    [["model"], defaultModel],
    [["model_provider"], PROVIDER],
    [["model_catalog_json"], catalogPath],
  ];
  for (const [field, value] of Object.entries(managed)) set.push([[...prefix, field], value]);
  const remove = [
    ["forced_login_method"],
    ...["env_key", "env_key_instructions", "gateway_oauth"].map((field) => [...prefix, field]),
  ];
  const previous = provider(config);
  for (const field of ["http_headers", "env_http_headers"]) {
    if (previous?.[field] === undefined) continue;
    if (!isRecord(previous[field])) remove.push([...prefix, field]);
    else
      for (const name of Object.keys(previous[field]))
        if (["authorization", "x-api-key", "api-key"].includes(name.toLowerCase()))
          remove.push([...prefix, field, name]);
  }
  return { set, remove };
}
function directEdits(config, profile, catalogPath, key) {
  if (profile.kind === "official") return { set: [], remove: [...rootRemoval(), ["model_providers", "openai"]] };
  if (profile.recipe)
    return {
      set: recipeSet(profile.recipe),
      remove: [
        ...rootRemoval().filter(
          (parts) => !profile.recipe.values.some((value) => value.parts.length === 1 && value.parts[0] === parts[0]),
        ),
        ["model_providers", profile.recipe.providerId],
      ],
    };
  const prefix = ["model_providers", customProvider];
  return {
    set: [
      [["model_provider"], customProvider],
      [["model"], profile.defaultModel],
      [["model_catalog_json"], catalogPath],
      ...Object.entries({
        name: profile.name,
        base_url: profile.baseUrl,
        wire_api: "responses",
        requires_openai_auth: false,
        supports_websockets: false,
        experimental_bearer_token: key,
      }).map(([field, value]) => [[...prefix, field], value]),
    ],
    remove: [["forced_login_method"], ["openai_base_url"], ["chatgpt_base_url"], prefix],
  };
}
function previewFragment(profile, resolved, prepared) {
  const text = routingPreview(profile, resolved, prepared);
  return resolved.searchPolicy ? editCodexToml(text, { set: resolved.searchPolicy.set, remove: [] }) : text;
}
function routingPreview(profile, resolved, prepared) {
  if (profile?.kind === "official")
    return "# 使用官方内置默认；移除活动供应商、自定义默认模型、目录和接口覆盖；不修改账户登录。\n";
  if (profile?.recipe)
    return (
      "# 恢复已加密保存的直连路由；保留当前 MCP、Hooks、项目及思考设置。\n" +
      stringify({
        model_provider: profile.recipe.providerId,
        ...(profile.defaultModel ? { model: profile.defaultModel } : {}),
      }) +
      "# 凭证、认证环境变量和自定义请求头已隐藏。\n"
    );
  const direct = !!profile;
  const name = direct ? profile.name : "Cx-Routing Gateway",
    id = direct ? customProvider : PROVIDER;
  const model = direct
    ? profile.defaultModel
    : resolved.routes.find((route) => route.id === resolved.defaultRouteId).model;
  const url = direct ? profile.baseUrl : resolved.baseUrl;
  return stringify({
    model,
    model_provider: id,
    model_catalog_json: prepared.path,
    model_providers: {
      [id]: {
        name,
        base_url: url,
        wire_api: "responses",
        requires_openai_auth: false,
        supports_websockets: false,
        experimental_bearer_token: "<已隐藏的客户端 Key>",
      },
    },
  });
}

module.exports = { sourceEdits, previewFragment };
