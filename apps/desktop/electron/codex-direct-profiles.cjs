const crypto = require("node:crypto");
const { parse } = require("smol-toml");
const { createDirectProfileStore } = require("./codex-direct-store.cjs");
const {
  currentDirect,
  captureRouting,
  directUrl,
  recipeHash,
  configFromRecipe,
  assertIndependentDirectAuth,
} = require("./codex-direct-projection.cjs");
const { fail, sanitize } = require("./codex-errors.cjs");
const { searchRoutingFingerprint } = require("./codex-search-policy.cjs");
const validText = (value, max) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const validKey = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 8192 && /^[\x21-\x7e]+$/.test(value);
const parseSnapshot = (snapshot) =>
  snapshot.exists ? parse(snapshot.bytes.toString("utf8"), { integersAsBigInt: true }) : {};
const ownKeys = (input, allowed) =>
  input &&
  typeof input === "object" &&
  !Array.isArray(input) &&
  !Object.keys(input).some((key) => !allowed.includes(key));
const customProvider = "cx_codex_direct";
function createDirectProfiles({ filePath, safeStorage, fsImpl, platform, getSnapshot, catalogs }) {
  const store = createDirectProfileStore({ filePath, safeStorage, fsImpl, platform });
  function metadata(profile, active) {
    if (profile.kind === "custom")
      return {
        id: profile.id,
        kind: "custom",
        name: profile.name,
        baseUrl: profile.baseUrl,
        models: [...profile.models],
        defaultModel: profile.defaultModel,
        credentialConfigured: validKey(profile.apiKey),
        editable: true,
        active,
        updatedAt: profile.updatedAt,
      };
    const config = parse(
      profile.recipe.values
        .map((value) => value.parts.map((part) => JSON.stringify(part)).join(".") + " = " + value.raw)
        .join("\n"),
      { integersAsBigInt: true },
    );
    const direct = currentDirect(config).direct;
    const provider = config.model_providers?.[profile.recipe.providerId];
    const credentials = !!(
      validKey(provider?.experimental_bearer_token) ||
      validText(provider?.env_key, 256) ||
      provider?.http_headers ||
      provider?.env_http_headers ||
      provider?.gateway_oauth
    );
    return {
      id: profile.id,
      kind: "snapshot",
      name: profile.name,
      ...(direct?.baseUrl ? { baseUrl: direct.baseUrl } : {}),
      models: validText(config.model, 256) ? [config.model] : [],
      ...(validText(config.model, 256) ? { defaultModel: config.model } : {}),
      credentialConfigured: credentials,
      editable: false,
      active,
      updatedAt: profile.updatedAt,
    };
  }
  async function activeId(data, snapshot) {
    const config = parseSnapshot(snapshot),
      state = currentDirect(config);
    if (state.mode !== "direct") return undefined;
    let captured;
    try {
      captured = captureRouting(snapshot.bytes?.toString("utf8") || "", config);
    } catch {
      return undefined;
    }
    // A saved empty snapshot must not shadow the built-in official choice.
    // Explicit model/forced/advanced routing values still match their own
    // snapshots and retain their distinct restore behavior below.
    if (state.direct?.kind === "official" && captured.recipe.values.length === 0) return "official";
    for (const profile of data.profiles) {
      if (profile.recipe && profile.fingerprint === captured.fingerprint) return profile.id;
      if (profile.kind === "custom" && !profile.recipe && config.model_provider === customProvider) {
        const provider = config.model_providers?.[customProvider];
        const storedCatalog = await catalogs.inspect(config.model_catalog_json);
        const catalogMatches =
          storedCatalog.status === "managed" &&
          JSON.stringify(storedCatalog.data._cxrg.aliases) === JSON.stringify(profile.models) &&
          storedCatalog.data._cxrg.defaultRouteId === "direct-model-" + profile.models.indexOf(profile.defaultModel);
        if (
          config.model === profile.defaultModel &&
          catalogMatches &&
          provider?.name === profile.name &&
          provider?.base_url === profile.baseUrl &&
          provider?.wire_api === "responses" &&
          provider?.requires_openai_auth === false &&
          provider?.experimental_bearer_token === profile.apiKey &&
          config.openai_base_url === undefined &&
          config.chatgpt_base_url === undefined &&
          config.forced_login_method === undefined
        ) {
          const expected = {
            name: profile.name,
            base_url: profile.baseUrl,
            wire_api: "responses",
            requires_openai_auth: false,
            supports_websockets: false,
            experimental_bearer_token: profile.apiKey,
          };
          if (
            JSON.stringify(Object.keys(provider).sort()) === JSON.stringify(Object.keys(expected).sort()) &&
            Object.entries(expected).every(([key, value]) => provider[key] === value)
          )
            return profile.id;
        }
      }
    }
    return state.direct?.kind === "official" ? "official" : undefined;
  }
  async function publicList(read, snapshot) {
    const active = await activeId(read.data, snapshot);
    return {
      revision: read.revision,
      secureStorageAvailable: read.secureStorageAvailable,
      profiles: [
        {
          id: "official",
          kind: "official",
          name: "官方默认",
          models: [],
          credentialConfigured: false,
          editable: false,
          active: active === "official",
        },
        ...read.data.profiles.map((profile) => metadata(profile, profile.id === active)),
      ],
      ...(read.data.lastDirectProfileId ? { lastDirectProfileId: read.data.lastDirectProfileId } : {}),
    };
  }
  async function list() {
    return publicList(await store.read(), await getSnapshot());
  }
  async function selected(profileId, revision) {
    if (typeof profileId !== "string" || typeof revision !== "string") throw fail("CODEX_INPUT_INVALID");
    const read = await store.read();
    if (read.revision !== revision) throw fail("CODEX_PROFILES_CHANGED");
    if (profileId === "official") return { profile: { id: "official", kind: "official", name: "官方默认" }, read };
    const profile = read.data.profiles.find((item) => item.id === profileId);
    if (!profile) throw fail("CODEX_PROFILE_NOT_FOUND");
    if (profile.recipe) assertIndependentDirectAuth(configFromRecipe(profile.recipe));
    return { profile, read };
  }
  function validateCustom(input, current) {
    if (
      !ownKeys(input, ["expectedRevision", "id", "name", "baseUrl", "models", "defaultModel", "apiKey"]) ||
      !validText(input.name, 80) ||
      !directUrl(input.baseUrl) ||
      !Array.isArray(input.models) ||
      input.models.length < 1 ||
      input.models.length > 100 ||
      !input.models.every((model) => validText(model, 256)) ||
      new Set(input.models).size !== input.models.length ||
      !input.models.includes(input.defaultModel) ||
      (input.apiKey !== undefined && typeof input.apiKey !== "string")
    )
      throw fail("CODEX_INPUT_INVALID");
    const apiKey = input.apiKey?.trim() || current?.apiKey;
    if (!validKey(apiKey)) throw fail("CODEX_INPUT_INVALID");
    return {
      name: input.name.trim(),
      baseUrl: directUrl(input.baseUrl),
      models: [...input.models],
      defaultModel: input.defaultModel,
      apiKey,
    };
  }
  async function mutate(expectedRevision, fn, validateBeforeCommit) {
    const snapshot = await getSnapshot();
    const result = await store.update(expectedRevision, fn, validateBeforeCommit);
    return publicList(result, snapshot);
  }
  async function captureCurrent(expectedRevision, expectedConfigRevision, name, automatic = false) {
    const snapshot = await getSnapshot();
    if (snapshot.revision !== expectedConfigRevision) throw fail("CODEX_CONFIG_CHANGED");
    const config = parseSnapshot(snapshot),
      capture = captureRouting(snapshot.bytes?.toString("utf8") || "", config);
    const read = await store.read();
    if (read.revision !== expectedRevision) throw fail("CODEX_PROFILES_CHANGED");
    const active = await activeId(read.data, snapshot);
    if (
      automatic &&
      capture.status.direct.kind === "official" &&
      active === "official" &&
      capture.recipe.values.length === 0
    ) {
      return store.update(read.revision, (data) => ({ ...data, lastDirectProfileId: "official" }));
    }
    const match =
      read.data.profiles.find((profile) => profile.recipe && profile.fingerprint === capture.fingerprint) ||
      read.data.profiles.find((profile) => profile.id === active);
    return store.update(
      read.revision,
      async (data) => {
        if ((await getSnapshot()).revision !== expectedConfigRevision) throw fail("CODEX_CONFIG_CHANGED");
        if (match) {
          if (automatic) data.lastDirectProfileId = match.id;
          return data;
        }
        if (data.profiles.length >= 50) throw fail("CODEX_PROFILE_LIMIT");
        const id = "direct_" + crypto.randomUUID();
        const provider = config.model_providers?.[capture.recipe.providerId];
        const structured =
          capture.status.direct.kind === "custom" &&
          validKey(provider?.experimental_bearer_token) &&
          config.model_catalog_json === undefined &&
          config.forced_login_method === undefined &&
          config.openai_base_url === undefined &&
          config.chatgpt_base_url === undefined &&
          (provider?.requires_openai_auth === undefined || provider.requires_openai_auth === false) &&
          (provider?.supports_websockets === undefined || provider.supports_websockets === false) &&
          Object.keys(provider).every((field) =>
            [
              "name",
              "base_url",
              "wire_api",
              "requires_openai_auth",
              "supports_websockets",
              "experimental_bearer_token",
            ].includes(field),
          ) &&
          validText(config.model, 256);
        const profile = structured
          ? {
              id,
              kind: "custom",
              name: validText(name, 80) ? name.trim() : capture.status.direct.name,
              baseUrl: capture.status.direct.baseUrl,
              models: [config.model],
              defaultModel: config.model,
              apiKey: provider.experimental_bearer_token,
              recipe: capture.recipe,
              fingerprint: capture.fingerprint,
              updatedAt: new Date().toISOString(),
            }
          : {
              id,
              kind: "snapshot",
              name: validText(name, 80) ? name.trim() : capture.status.direct.name,
              recipe: capture.recipe,
              fingerprint: capture.fingerprint,
              updatedAt: new Date().toISOString(),
            };
        data.profiles.push(profile);
        if (automatic) data.lastDirectProfileId = id;
        return data;
      },
      async () => {
        if ((await getSnapshot()).revision !== expectedConfigRevision) throw fail("CODEX_CONFIG_CHANGED");
      },
    );
  }
  return {
    list,
    selected,
    activeId,
    async searchRestore(snapshot) {
      const read = await store.read();
      const pending = read.data.gatewaySearchRollback;
      const matches = pending && (pending.targetRevision === snapshot.revision ||
        (pending.targetFingerprint !== pending.sourceFingerprint &&
          pending.targetFingerprint === searchRoutingFingerprint(parseSnapshot(snapshot), pending.restore)));
      return { revision: read.revision,
        restore: matches ? pending.restore || undefined : read.data.gatewaySearchRestore,
        pending: !!pending };
    },
    async rememberSearchRestore(snapshot, restore, expectedRevision) {
      const read = await store.read();
      if (read.revision !== expectedRevision) throw fail("CODEX_PROFILES_CHANGED");
      if (JSON.stringify(read.data.gatewaySearchRestore) === JSON.stringify(restore)) return read;
      return store.update(read.revision, data => ({ ...data, gatewaySearchRestore: restore }), async () => {
        if ((await getSnapshot()).revision !== snapshot.revision) throw fail("CODEX_CONFIG_CHANGED");
      });
    },
    async clearReleasedSearchRestore(expectedRevision) {
      const read = await store.read();
      if (read.revision !== expectedRevision || !read.data.gatewaySearchRestore?.released) return;
      await store.update(read.revision, data => { delete data.gatewaySearchRestore; return data; });
    },
    async rememberSearchRecovery(snapshot, backupId, restore, expectedRevision, previousBackupId, activeRestore) {
      return store.update(expectedRevision, data => {
        // A failed pending publication must retain the still-current backup's
        // search state. All other backups are no longer exposed by recovery().
        data.gatewaySearchRecoveries = (data.gatewaySearchRecoveries || [])
          .filter(item => item.backupId === previousBackupId && item.backupId !== backupId);
        data.gatewaySearchRecoveries.push({ backupId, restore: restore || null });
        if (activeRestore === undefined) delete data.gatewaySearchRestore;
        else data.gatewaySearchRestore = activeRestore;
        delete data.gatewaySearchRollback;
        return data;
      }, async () => {
        if ((await getSnapshot()).revision !== snapshot.revision) throw fail("CODEX_CONFIG_CHANGED");
      });
    },
    async restoreSearchRecovery(snapshot, backupId, target) {
      const read = await store.read();
      const recovery = read.data.gatewaySearchRecoveries?.find(item => item.backupId === backupId);
      if (!recovery) return read;
      return store.update(read.revision, data => {
        // Match the target routing/search fields after publication even if an
        // unrelated editor adds Hooks/MCP before finalization can complete.
        // Uncommitted source routing/search cannot activate this prepared state.
        data.gatewaySearchRollback = { backupId, targetRevision: target.revision,
          sourceFingerprint: searchRoutingFingerprint(parseSnapshot(snapshot), recovery.restore),
          targetFingerprint: searchRoutingFingerprint(parseSnapshot(target), recovery.restore),
          restore: structuredClone(recovery.restore) };
        return data;
      }, async () => {
        if ((await getSnapshot()).revision !== snapshot.revision) throw fail("CODEX_CONFIG_CHANGED");
      });
    },
    async finalizeSearchRecovery(expectedRevision, snapshot) {
      const read = await store.read();
      const pending = read.data.gatewaySearchRollback;
      if (read.revision !== expectedRevision || pending?.targetRevision !== snapshot.revision) return;
      await store.update(read.revision, data => {
        if (pending.restore === null) delete data.gatewaySearchRestore;
        else data.gatewaySearchRestore = pending.restore;
        delete data.gatewaySearchRollback;
        return data;
      }, async () => {
        if ((await getSnapshot()).revision !== snapshot.revision) throw fail("CODEX_CONFIG_CHANGED");
      });
    },
    async save(input) {
      if (!ownKeys(input, ["expectedRevision", "id", "name", "baseUrl", "models", "defaultModel", "apiKey"]))
        throw fail("CODEX_INPUT_INVALID");
      const read = await store.read();
      if (read.revision !== input.expectedRevision) throw fail("CODEX_PROFILES_CHANGED");
      const current = input.id ? read.data.profiles.find((profile) => profile.id === input.id) : undefined;
      if (input.id && (!current || current.kind !== "custom")) throw fail("CODEX_PROFILE_NOT_FOUND");
      const values = validateCustom(input, current);
      return mutate(input.expectedRevision, (data) => {
        if (!current && data.profiles.length >= 50) throw fail("CODEX_PROFILE_LIMIT");
        const profile = {
          id: current?.id || "direct_" + crypto.randomUUID(),
          kind: "custom",
          ...values,
          updatedAt: new Date().toISOString(),
        };
        data.profiles = current
          ? data.profiles.map((item) => (item.id === current.id ? profile : item))
          : [...data.profiles, profile];
        return data;
      });
    },
    async importCurrent(input) {
      if (
        !ownKeys(input, ["expectedRevision", "expectedConfigRevision", "name"]) ||
        (input.name !== undefined && !validText(input.name, 80))
      )
        throw fail("CODEX_INPUT_INVALID");
      const snapshot = await getSnapshot();
      const result = await captureCurrent(input.expectedRevision, input.expectedConfigRevision, input.name);
      return publicList(result, snapshot);
    },
    async duplicate(input) {
      if (
        !ownKeys(input, ["expectedRevision", "id", "name"]) ||
        (input.name !== undefined && !validText(input.name, 80))
      )
        throw fail("CODEX_INPUT_INVALID");
      return mutate(input.expectedRevision, (data) => {
        const original = data.profiles.find((item) => item.id === input.id);
        if (!original) throw fail("CODEX_PROFILE_NOT_FOUND");
        if (data.profiles.length >= 50) throw fail("CODEX_PROFILE_LIMIT");
        const profile = {
          ...structuredClone(original),
          id: "direct_" + crypto.randomUUID(),
          name: input.name?.trim() || original.name.slice(0, 75) + " 副本",
          updatedAt: new Date().toISOString(),
        };
        data.profiles.push(profile);
        return data;
      });
    },
    async remove(input) {
      if (!ownKeys(input, ["expectedRevision", "id"])) throw fail("CODEX_INPUT_INVALID");
      const snapshot = await getSnapshot();
      return mutate(
        input.expectedRevision,
        async (data) => {
          if (
            input.id === "official" ||
            input.id === data.lastDirectProfileId ||
            input.id === (await activeId(data, snapshot))
          )
            throw fail("CODEX_PROFILE_IN_USE");
          if (!data.profiles.some((profile) => profile.id === input.id)) throw fail("CODEX_PROFILE_NOT_FOUND");
          if ((await getSnapshot()).revision !== snapshot.revision) throw fail("CODEX_CONFIG_CHANGED");
          data.profiles = data.profiles.filter((profile) => profile.id !== input.id);
          return data;
        },
        async () => {
          if ((await getSnapshot()).revision !== snapshot.revision) throw fail("CODEX_CONFIG_CHANGED");
        },
      );
    },
    async captureBeforeGateway(snapshot) {
      const config = parseSnapshot(snapshot);
      if (currentDirect(config).mode !== "direct") return;
      const read = await store.read();
      return captureCurrent(read.revision, snapshot.revision, undefined, true);
    },
    async rememberDirect(profileId, revision) {
      const { read } = await selected(profileId, revision);
      if (profileId === "official" && !read.secureStorageAvailable && read.revision === "missing") return read;
      return store.update(read.revision, (data) => ({ ...data, lastDirectProfileId: profileId }));
    },
    async assertRevision(revision) {
      if (revision !== undefined && (await store.read()).revision !== revision) throw fail("CODEX_PROFILES_CHANGED");
    },
    async describe(snapshot) {
      const config = parseSnapshot(snapshot),
        state = currentDirect(config);
      if (state.mode !== "direct") return state;
      try {
        captureRouting(snapshot.bytes?.toString("utf8") || "", config);
      } catch (error) {
        return {
          mode: "direct",
          direct: {
            ...state.direct,
            importable: false,
            warning:
              error.code === "CODEX_DIRECT_AUTH_UNSAFE"
                ? "当前第三方路由可能使用官方账户凭证，请先配置供应商独立认证。"
                : "当前高级路由结构暂不支持安全保存，请先手动整理配置。",
          },
        };
      }
      try {
        const read = await store.read(),
          id = await activeId(read.data, snapshot);
        if (id && id !== "official") {
          const profile = read.data.profiles.find((item) => item.id === id);
          return { mode: "direct", direct: { ...state.direct, kind: profile.kind, name: profile.name, profileId: id } };
        }
        return { mode: "direct", direct: { ...state.direct, ...(id ? { profileId: id } : {}) } };
      } catch {
        return state;
      }
    },
  };
}
module.exports = { createDirectProfiles, customProvider };
