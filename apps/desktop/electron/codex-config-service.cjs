const { validateCapabilities, supportedEfforts } = require("./codex-model-capabilities.cjs");
const { catalogSyncStatus } = require("./codex-catalog-status.cjs");
const os = require("node:os");
const path = require("node:path");
const { parse } = require("smol-toml");
const { CodexConfigStore, MAX_CONFIG_BYTES, validHash, validRevision } = require("./codex-config-store.cjs");
const { fail, sanitize } = require("./codex-errors.cjs");
const { editCodexToml } = require("./codex-toml-editor.cjs");
const { createModelCatalog } = require("./codex-model-catalog.cjs");
const { createDirectProfiles, customProvider } = require("./codex-direct-profiles.cjs");
const { sourceEdits, previewFragment } = require("./codex-config-builder.cjs");
const { assertIndependentDirectAuth } = require("./codex-direct-projection.cjs");
const { createGatewayPreferences } = require("./codex-gateway-preferences.cjs");
const { createGatewayCredentialBridge } = require("./codex-gateway-credentials.cjs");
const { validReasoningRange } = require("./codex-reasoning-range.cjs");
const { planSearchPolicy, describeSearchPolicy } = require("./codex-search-policy.cjs");
const PROVIDER = "cx_routing_gateway";
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const boundedText = (value, max = 256) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const validKey = (value) =>
  typeof value === "string" && value.length >= 8 && value.length <= 512 && /^[\x21-\x7e]+$/.test(value);
function safeGatewayUrl(value) {
  if (typeof value !== "string" || value.length > 128) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.pathname !== "/v1" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
function validateSelection(input, withKey = false) {
  if (!isRecord(input) || !["direct", "gateway"].includes(input.mode)) throw fail("CODEX_INPUT_INVALID");
  const allowed =
    input.mode === "direct" ? ["mode", "profileId", "profilesRevision"] : ["mode", "routeIds", "defaultRouteId"];
  if (withKey) allowed.push("expectedRevision", ...(input.mode === "gateway" ? ["clientKey", "credentialId"] : []));
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw fail("CODEX_INPUT_INVALID");
  if (withKey && !validRevision(input.expectedRevision)) throw fail("CODEX_INPUT_INVALID");
  if (
    input.mode === "direct" &&
    (typeof input.profileId !== "string" || !input.profileId || !validRevision(input.profilesRevision))
  )
    throw fail("CODEX_INPUT_INVALID");
  if (input.mode === "gateway") {
    if (
      withKey &&
      input.credentialId !== undefined &&
      (!boundedText(input.credentialId, 100) || input.clientKey !== undefined)
    )
      throw fail("CODEX_INPUT_INVALID");
    if (
      !Array.isArray(input.routeIds) ||
      input.routeIds.length < 1 ||
      input.routeIds.length > 100 ||
      !input.routeIds.every((id) => boundedText(id, 100)) ||
      new Set(input.routeIds).size !== input.routeIds.length ||
      !input.routeIds.includes(input.defaultRouteId)
    )
      throw fail("CODEX_INPUT_INVALID");
    if (
      withKey &&
      input.clientKey !== undefined &&
      (typeof input.clientKey !== "string" || (input.clientKey.trim() && !validKey(input.clientKey.trim())))
    )
      throw fail("CODEX_INPUT_INVALID");
  }
}
function configFrom(snapshot) {
  if (!snapshot.exists) return {};
  try {
    return parse(new TextDecoder("utf-8", { fatal: true }).decode(snapshot.bytes), { integersAsBigInt: true });
  } catch {
    throw fail("CODEX_CONFIG_INVALID");
  }
}
function provider(config) {
  return isRecord(config.model_providers) && isRecord(config.model_providers[PROVIDER])
    ? config.model_providers[PROVIDER]
    : undefined;
}
function patch(snapshot, edits) {
  return Buffer.from(editCodexToml(snapshot.bytes?.toString("utf8") || "", edits));
}
function createCodexConfigService({
  codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex")),
  fsImpl,
  getRoutes,
  getRoute,
  validateKey,
  profilesPath,
  safeStorage,
  platform,
  isLoginPending = () => false,
  preferencesPath,
  getGatewayCredentials,
  resolveGatewayCredential,
  retainGatewayCredential,
} = {}) {
  if ((typeof getRoutes !== "function" && typeof getRoute !== "function") || typeof validateKey !== "function")
    throw fail("CODEX_INPUT_INVALID");
  const store = new CodexConfigStore({ codexHome, fsImpl });
  const catalogs = createModelCatalog(store);
  const gatewayCredentials = createGatewayCredentialBridge({
    getCurrentKey: async () => provider(configFrom(await store.snapshot()))?.experimental_bearer_token,
    getGatewayCredentials,
    resolveGatewayCredential,
    retainGatewayCredential,
  });
  const gatewayPreferences = createGatewayPreferences({
    filePath: preferencesPath || path.join(store.home, ".cx-routing-gateway", "gateway-preferences.json"),
    codexHome: store.home,
    fsImpl,
    getFallback: async () => {
      const config = configFrom(await store.snapshot());
      const catalog =
        config.model_provider === PROVIDER ? await catalogs.inspect(config.model_catalog_json) : undefined;
      const value = catalog?.status === "managed" ? catalog.data._cxrg : undefined;
      return {
        routeIds: value ? [...value.routeIds] : [],
        defaultRouteId: value?.defaultRouteId || "",
        credentialSource: "current",
      };
    },
  });
  const directProfiles = createDirectProfiles({
    filePath: profilesPath || path.join(store.home, ".cx-routing-gateway", "profiles.enc"),
    safeStorage,
    fsImpl,
    platform,
    getSnapshot: () => store.snapshot(),
    catalogs,
  });
  async function resolveSelection(selection) {
    let resolved;
    try {
      // Production getRoutes reads all requested routes from one Control snapshot.
      // The retained private getRoute adapter serves older isolated embedding callers.
      if (getRoutes) resolved = await getRoutes(selection.routeIds);
      else {
        const values = await Promise.all(selection.routeIds.map(async (id) => ({ id, ...(await getRoute(id)) })));
        resolved = { routes: values.map(({ id, model, reasoning, outboundProtocol, capabilities }) => ({ id, model,
          ...(capabilities === undefined ? {} : { capabilities }),
          ...(reasoning === undefined ? {} : { reasoning }), ...(outboundProtocol === undefined ? {} : { outboundProtocol }) })), baseUrl: values[0]?.baseUrl };
        if (values.some((value) => value.baseUrl !== resolved.baseUrl)) throw fail("CODEX_ROUTE_UNAVAILABLE");
      }
    } catch (error) {
      throw sanitize(error, "CODEX_ROUTE_UNAVAILABLE");
    }
    if (
      !resolved ||
      !safeGatewayUrl(resolved.baseUrl) ||
      !Array.isArray(resolved.routes) ||
      resolved.routes.length !== selection.routeIds.length ||
      resolved.routes.some(
        (route, index) => !route || route.id !== selection.routeIds[index] || !boundedText(route.model) ||
          (route.reasoning !== undefined && !validReasoningRange(route.reasoning)) ||
          (route.outboundProtocol !== undefined && !["Res", "Chat", "Mes"].includes(route.outboundProtocol)),
      ) ||
      new Set(resolved.routes.map((route) => route.model)).size !== resolved.routes.length
    )
      throw fail("CODEX_ROUTE_UNAVAILABLE");
    for (const route of resolved.routes) {
      if (route.capabilities !== undefined) {
        try { validateCapabilities(route.capabilities); supportedEfforts(route.capabilities, route.reasoning); if (route.capabilities.tools === false) throw Error(); }
        catch { throw fail("CODEX_ROUTE_UNAVAILABLE"); }
      }
    }
    return {
      routes: resolved.routes.map(({ id, model, reasoning, outboundProtocol, capabilities }) => ({ id, model,
        ...(capabilities === undefined ? {} : { capabilities: validateCapabilities(capabilities) }),
        ...(reasoning === undefined ? {} : { reasoning: { ...reasoning } }),
        ...(outboundProtocol === undefined ? {} : { outboundProtocol }) })),
      baseUrl: safeGatewayUrl(resolved.baseUrl),
    };
  }
  async function statusOf(snapshot, recovery = () => store.recovery(snapshot), catalogResult) {
    const config = configFrom(snapshot);
    const managed = provider(config);
    const routeStatus = await directProfiles.describe(snapshot);
    const mode = routeStatus.mode;
    const baseUrl = mode === "gateway" && safeGatewayUrl(managed?.base_url);
    const backup = await recovery();
    const catalog = catalogResult || (await catalogs.inspect(config.model_catalog_json));
    const catalogStatus = catalog.status === "none" && mode === "gateway" ? "legacy" : catalog.status;
    const metadata = catalog.status === "managed" ? catalog.data._cxrg : undefined;
    const selectedModelAliases = metadata
      ? [...metadata.aliases]
      : catalogStatus === "legacy" && boundedText(config.model)
        ? [config.model]
        : [];
    const selectedRouteIds = metadata ? [...metadata.routeIds] : [];
    const defaultIndex = metadata?.routeIds.indexOf(metadata.defaultRouteId) ?? -1;
    const defaultMatches = metadata && defaultIndex >= 0 && config.model === metadata.aliases[defaultIndex];
    const direct = mode === "direct";
    return {
      configPath: store.configPath,
      configScope: "user",
      exists: snapshot.exists,
      revision: snapshot.revision,
      mode,
      configured: !!(
        direct ||
        (mode === "gateway" &&
          baseUrl &&
          managed?.wire_api === "responses" &&
          validKey(managed?.experimental_bearer_token) &&
          defaultMatches)
      ),
      credentialConfigured: validKey(managed?.experimental_bearer_token),
      selectedRouteIds,
      selectedModelAliases,
      catalogStatus,
      catalogSync: await catalogSyncStatus({ catalog, mode, config, catalogs, resolveSelection, preserveDirectCatalog: mode === 'direct' && (routeStatus.direct?.kind === 'snapshot' || config.model_provider !== customProvider) }),
      searchPolicy: describeSearchPolicy(config),
      ...(defaultMatches ? { defaultRouteId: metadata.defaultRouteId } : {}),
      ...(boundedText(config.model) ? { model: config.model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(routeStatus.direct ? { direct: routeStatus.direct } : {}),
      ...(backup ? { backup: { id: backup.id, createdAt: backup.createdAt } } : {}),
    };
  }
  function run(operation) {
    return store.serialize(async () => {
      try {
        return await operation();
      } catch (error) {
        throw sanitize(error);
      }
    });
  }
  return {
    getStatus: () => run(async () => statusOf(await store.snapshot())),
    preview: (input) =>
      run(async () => {
        validateSelection(input);
        const snapshot = await store.snapshot();
        const config = configFrom(snapshot);
        const selection =
          input.mode === "direct" ? await directProfiles.selected(input.profileId, input.profilesRevision) : undefined;
        const profile = selection?.profile;
        const resolved = input.mode === "gateway" ? await resolveSelection(input) : { profile };
        if (input.mode === "gateway") resolved.defaultRouteId = input.defaultRouteId;
        const search = await directProfiles.searchRestore(snapshot);
        resolved.searchPolicy = planSearchPolicy(config, input.mode, resolved.routes, search.restore, snapshot.revision);
        const prepared =
          input.mode === "gateway"
            ? catalogs.plan(
                input.routeIds,
                input.defaultRouteId,
                resolved.routes.map((route) => route.model),
                "gateway",
                resolved.routes.map((route) => route.reasoning || null),
                resolved.routes.map((route) => route.capabilities || null),
              )
            : profile.kind === "custom" && !profile.recipe
              ? catalogs.planDirect(profile.models, profile.defaultModel)
              : undefined;
        patch(snapshot, sourceEdits(config, input, resolved, prepared?.path, "<已隐藏的客户端 Key>"));
        const names = prepared ? prepared.data._cxrg.aliases : profile?.models || [];
        return {
          configPath: store.configPath,
          revision: snapshot.revision,
          mode: input.mode,
          searchPolicy: resolved.searchPolicy.facts,
          ...(input.mode === "gateway" ? { catalogRefresh: "on-explicit-apply" } : {}),
          configPreview: previewFragment(profile, resolved, prepared),
          selectedModelAliases: [...names],
          replacesCurrentProvider: true,
          providerName: profile?.name || "Cx-Routing Gateway",
          changes:
            input.mode === "gateway"
              ? ["启用所选 Gateway 模型与默认模型", "切换前加密保留当前直连方案", "保留账户登录、MCP、Hooks 和思考设置",
                  ...(resolved.searchPolicy.facts.webSearch === "disabled" ? ["所选路由包含 Chat/Mes 出站，将禁用本机用户配置的托管网页搜索，并在返回直连时恢复原设置"] : []),
                  "仅本次保存并启用刷新模型目录；随后完全退出并重启 Codex 以重载目录。路由范围与输出上限保存后立即约束转发",
                  "独立 --profile 配置及启动参数需自行同步，当前仅修改本机用户配置"]
              : profile.kind === "official"
                ? ["使用官方内置默认", "移除活动路由、自定义模型目录和接口覆盖", "保留账户登录及其他供应商"]
                : ["启用所选直连方案", "保留账户登录、MCP、Hooks 和思考设置"],
          ...(prepared
            ? {
                model:
                  input.mode === "gateway"
                    ? resolved.routes.find((route) => route.id === input.defaultRouteId).model
                    : profile.defaultModel,
                baseUrl: input.mode === "gateway" ? resolved.baseUrl : profile.baseUrl,
                catalogPreview: JSON.stringify(
                  {
                    models: prepared.data.models.map(({ slug, display_name, priority }) => ({
                      slug,
                      display_name,
                      priority,
                    })),
                    _cxrg: prepared.data._cxrg,
                  },
                  null,
                  2,
                ),
              }
            : {
                ...(profile?.baseUrl ? { baseUrl: profile.baseUrl } : {}),
                ...(profile?.defaultModel ? { model: profile.defaultModel } : {}),
              }),
        };
      }),
    apply: (input) =>
      run(async () => {
        validateSelection(input, true);
        if (await isLoginPending()) throw fail("CODEX_LOGIN_PENDING");
        const snapshot = await store.check(input.expectedRevision);
        const config = configFrom(snapshot);
        const search = await directProfiles.searchRestore(snapshot);
        let resolved, prepared, key, profile;
        if (input.mode === "direct") {
          ({ profile } = await directProfiles.selected(input.profileId, input.profilesRevision));
          resolved = { profile };
          if (profile.kind === "custom" && !profile.recipe) {
            key = profile.apiKey;
            prepared = catalogs.planDirect(profile.models, profile.defaultModel);
          }
        }
        if (input.mode === "gateway") {
          resolved = await resolveSelection(input);
          key =
            input.credentialId !== undefined
              ? await gatewayCredentials.resolve(input.credentialId)
              : input.clientKey?.trim() || provider(config)?.experimental_bearer_token;
          if (!validKey(key)) throw fail("CODEX_KEY_REJECTED");
          for (const route of resolved.routes) {
            try {
              await validateKey(key, route.model);
            } catch (error) {
              throw sanitize(error, "CODEX_KEY_REJECTED");
            }
          }
          const current = await resolveSelection(input);
          if (JSON.stringify(current) !== JSON.stringify(resolved)) throw fail("CODEX_ROUTE_UNAVAILABLE");
          prepared = catalogs.plan(
            input.routeIds,
            input.defaultRouteId,
            resolved.routes.map((route) => route.model),
            "gateway",
            resolved.routes.map((route) => route.reasoning || null),
                resolved.routes.map((route) => route.capabilities || null),
          );
        }
        resolved.searchPolicy = planSearchPolicy(config, input.mode, resolved.routes, search.restore, snapshot.revision);
        const next = patch(snapshot, sourceEdits(config, input, resolved, prepared?.path, key));
        if (next.length > MAX_CONFIG_BYTES) throw fail("CODEX_CONFIG_TOO_LARGE");
        if (input.mode === "direct") assertIndependentDirectAuth(configFrom({ bytes: next, exists: true }));
        // Resolve snapshot catalogue status before commit. The known result can
        // be returned afterward without post-commit IO causing a false failure.
        const targetCatalog = prepared
          ? { status: "managed", data: prepared.data }
          : await catalogs.inspect(configFrom({ bytes: next, exists: true }).model_catalog_json);
        await store.check(snapshot.revision);
        await directProfiles.assertRevision(search.revision);
        let activationLibrary =
          input.mode === "gateway"
            ? await directProfiles.captureBeforeGateway(snapshot)
            : await directProfiles.rememberDirect(input.profileId, input.profilesRevision);
        // Write the restoration record before config publication. Revalidation
        // below binds both files; a failed config publication remains retryable.
        if (resolved.searchPolicy.restore) activationLibrary = await directProfiles.rememberSearchRestore(
          snapshot, resolved.searchPolicy.restore, activationLibrary?.revision || search.revision,
        );
        if (prepared) await catalogs.write(prepared);
        await store.check(snapshot.revision);
        const previousRecovery = await store.recovery(snapshot);
        const backup = await store.prepare(snapshot, next);
        if (search.restore || resolved.searchPolicy.restore || search.pending) activationLibrary = await directProfiles.rememberSearchRecovery(
          snapshot, backup.id, search.restore, activationLibrary?.revision || search.revision, previousRecovery?.id,
          resolved.searchPolicy.restore || search.restore,
        );
        await store.replace(snapshot, next, async () => {
          if (input.mode === "gateway") {
            const current = await resolveSelection(input);
            if (JSON.stringify(current) !== JSON.stringify({ routes: resolved.routes, baseUrl: resolved.baseUrl }))
              throw fail("CODEX_ROUTE_UNAVAILABLE");
          }
          await directProfiles.assertRevision(activationLibrary?.revision);
          if (await isLoginPending()) throw fail("CODEX_LOGIN_PENDING");
        });
        if (resolved.searchPolicy.restore?.released) {
          // Config publication is already committed. Cleanup failure must not
          // turn a successful apply into an error; the released marker makes
          // a leftover record inactive and preserves later search edits.
          await directProfiles.clearReleasedSearchRestore(activationLibrary.revision).catch(() => {});
        }
        return statusOf(
          { bytes: next, exists: true, revision: backup.afterRevision },
          async () => backup,
          targetCatalog,
        );
      }),
    getDirectProfiles: () => run(() => directProfiles.list()),
    getGatewayPreferences: () => run(() => gatewayPreferences.get()),
    saveGatewayPreferences: (input) => run(() => gatewayPreferences.save(input)),
    getGatewayCredentials: () => run(() => gatewayCredentials.list()),
    retainGatewayCredential: (input) => run(() => gatewayCredentials.retain(input)),
    saveDirectProfile: (input) => run(() => directProfiles.save(input)),
    importDirectProfile: (input) => run(() => directProfiles.importCurrent(input)),
    duplicateDirectProfile: (input) => run(() => directProfiles.duplicate(input)),
    deleteDirectProfile: (input) => run(() => directProfiles.remove(input)),
    restore: (input) =>
      run(async () => {
        if (await isLoginPending()) throw fail("CODEX_LOGIN_PENDING");
        if (
          !isRecord(input) ||
          !validHash(input.backupId) ||
          !validRevision(input.expectedRevision) ||
          Object.keys(input).some((key) => !["backupId", "expectedRevision"].includes(key))
        )
          throw fail("CODEX_INPUT_INVALID");
        const snapshot = await store.check(input.expectedRevision);
        const backup = await store.recovery(snapshot);
        if (!backup || backup.id !== input.backupId) throw fail("CODEX_BACKUP_INVALID");
        if (snapshot.revision !== backup.afterRevision) throw fail("CODEX_CONFIG_CHANGED");
        const original = { bytes: backup.original, exists: backup.originalExists, revision: backup.beforeRevision };
        const originalCatalog = await catalogs.inspect(configFrom(original).model_catalog_json);
        const restorationLibrary = await directProfiles.restoreSearchRecovery(snapshot, backup.id, original);
        await store.restore(snapshot, backup, async () => {
          await directProfiles.assertRevision(restorationLibrary.revision);
          if (await isLoginPending()) throw fail("CODEX_LOGIN_PENDING");
        });
        await directProfiles.finalizeSearchRecovery(restorationLibrary.revision, original).catch(() => {});
        return statusOf(original, async () => undefined, originalCatalog);
      }),
  };
}
module.exports = { createCodexConfigService, safeGatewayUrl };
