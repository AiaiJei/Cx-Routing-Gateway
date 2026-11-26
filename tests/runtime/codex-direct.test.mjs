import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { encryptedStorage, directFixtureRoot } from "./codex-direct-fixture.mjs";
const require = createRequire(import.meta.url);
const { createCodexConfigService } = require("../../apps/desktop/electron/codex-config-service.cjs");
const { parse } = require("../../apps/desktop/node_modules/smol-toml");
const key = "direct-profile-secret-key-only";
const gatewayKey = "cxrg_gateway_fixture_key";
const gateway = { mode: "gateway", routeIds: ["a"], defaultRouteId: "a" };
async function fixture({ original, safeStorage = encryptedStorage(), fsImpl = fs, isLoginPending } = {}) {
  const root = await directFixtureRoot();
  await fs.mkdir(root.codexHome, { recursive: true });
  const configPath = path.join(root.codexHome, "config.toml");
  if (original !== undefined) await fs.writeFile(configPath, original);
  const service = createCodexConfigService({
    ...root,
    safeStorage,
    fsImpl,
    isLoginPending,
    getRoutes: async (ids) => ({
      routes: ids.map((id) => ({ id, model: "model-" + id })),
      baseUrl: "http://127.0.0.1:4318/v1",
    }),
    validateKey: async () => {},
  });
  return { ...root, service, configPath };
}
async function save(service, extra = {}) {
  const library = await service.getDirectProfiles();
  return service.saveDirectProfile({
    expectedRevision: library.revision,
    name: "Provider A",
    baseUrl: "https://api.example.test/v1",
    models: ["alpha", "beta"],
    defaultModel: "beta",
    apiKey: key,
    ...extra,
  });
}
async function enable(service, profileId, clientKey) {
  const library = await service.getDirectProfiles();
  const input = profileId ? { mode: "direct", profileId, profilesRevision: library.revision } : gateway;
  const preview = await service.preview(input);
  return service.apply({
    ...input,
    expectedRevision: preview.revision,
    ...(!profileId ? { clientKey: clientKey || gatewayKey } : {}),
  });
}
test("direct profile CRUD encrypts library and returns only redacted metadata with optimistic revisions", async () => {
  const data = await fixture();
  const initial = await data.service.getDirectProfiles();
  assert.equal(initial.secureStorageAvailable, true);
  assert.deepEqual(
    initial.profiles.map((p) => p.id),
    ["official"],
  );
  const saved = await save(data.service);
  const profile = saved.profiles.find((p) => p.kind === "custom");
  assert.equal(profile.name, "Provider A");
  assert.equal(profile.editable, true);
  assert.equal(profile.active, false);
  assert.equal(profile.credentialConfigured, true);
  assert.deepEqual(profile.models, ["alpha", "beta"]);
  assert.equal(profile.defaultModel, "beta");
  assert.ok(!JSON.stringify(saved).includes(key));
  assert.ok(!(await fs.readFile(data.profilesPath)).includes(Buffer.from(key)));
  await assert.rejects(
    data.service.saveDirectProfile({
      expectedRevision: initial.revision,
      name: "Stale",
      baseUrl: "https://api.example/v1",
      models: ["x"],
      defaultModel: "x",
      apiKey: key,
    }),
    { code: "CODEX_PROFILES_CHANGED" },
  );
  const edited = await data.service.saveDirectProfile({
    expectedRevision: saved.revision,
    id: profile.id,
    name: "Updated",
    baseUrl: "https://new.example/v1",
    models: ["alpha"],
    defaultModel: "alpha",
    apiKey: "",
  });
  assert.equal(edited.profiles.find((p) => p.id === profile.id).credentialConfigured, true);
  const copied = await data.service.duplicateDirectProfile({
    expectedRevision: edited.revision,
    id: profile.id,
    name: "Copied",
  });
  const copy = copied.profiles.find((p) => p.name === "Copied");
  assert.ok(copy.id !== profile.id);
  assert.equal(copy.credentialConfigured, true);
  const removed = await data.service.deleteDirectProfile({ expectedRevision: copied.revision, id: copy.id });
  assert.ok(!removed.profiles.some((p) => p.id === copy.id));
  await assert.rejects(data.service.deleteDirectProfile({ expectedRevision: removed.revision, id: "official" }), {
    code: "CODEX_PROFILE_IN_USE",
  });
});
test("structured third-party profile activation uses native Responses catalogue without changing account or reasoning", async () => {
  const data = await fixture({ original: 'model_reasoning_effort = "high"\n[mcp_servers.keep]\ncommand = "node"\n' });
  await fs.writeFile(path.join(data.codexHome, "auth.json"), "account-bytes-untouched");
  const saved = await save(data.service);
  const profile = saved.profiles.find((p) => p.kind === "custom");
  const status = await enable(data.service, profile.id);
  assert.equal(status.mode, "direct");
  assert.equal(status.direct.kind, "custom");
  assert.equal(status.direct.profileId, profile.id);
  assert.equal(status.direct.name, "Provider A");
  assert.equal(status.configured, true);
  const config = parse(await fs.readFile(data.configPath, "utf8"));
  assert.equal(config.model_provider, "cx_codex_direct");
  assert.equal(config.model, "beta");
  assert.equal(config.model_reasoning_effort, "high");
  const provider = config.model_providers.cx_codex_direct;
  assert.equal(provider.base_url, "https://api.example.test/v1");
  assert.equal(provider.experimental_bearer_token, key);
  assert.equal(provider.requires_openai_auth, false);
  const catalog = JSON.parse(await fs.readFile(config.model_catalog_json, "utf8"));
  assert.deepEqual(
    catalog.models.map((m) => m.slug),
    ["alpha", "beta"],
  );
  assert.equal(await fs.readFile(path.join(data.codexHome, "auth.json"), "utf8"), "account-bytes-untouched");
  const active = await data.service.getDirectProfiles();
  assert.equal(active.profiles.find((p) => p.id === profile.id).active, true);
  await assert.rejects(data.service.deleteDirectProfile({ expectedRevision: active.revision, id: profile.id }), {
    code: "CODEX_PROFILE_IN_USE",
  });
});
test("current advanced third-party import survives Gateway twice and return preserves newer unrelated config", async () => {
  const original =
    'model = "third-model"\nmodel_provider = "third_party"\nmodel_catalog_json = "C:/external-catalog.json"\nmodel_reasoning_effort = "xhigh"\n[model_providers.third_party]\nname = "Existing"\nbase_url = "https://existing.example/v1"\nwire_api = "responses"\nenv_key = "EXISTING_ENV_KEY"\nrequires_openai_auth = false\nhttp_headers = { "X-Custom" = "secret-custom-header" }\n[mcp_servers.before]\ncommand = "before"\n';
  const data = await fixture({ original });
  const current = await data.service.getStatus();
  assert.equal(current.mode, "direct");
  assert.equal(current.direct.kind, "custom");
  assert.equal(current.direct.baseUrl, "https://existing.example/v1");
  assert.ok(!JSON.stringify(current).includes("secret-custom-header"));
  const library = await data.service.getDirectProfiles();
  const imported = await data.service.importDirectProfile({
    expectedRevision: library.revision,
    expectedConfigRevision: current.revision,
    name: "Original configuration",
  });
  const profile = imported.profiles.find((p) => p.name === "Original configuration");
  assert.equal(profile.kind, "snapshot");
  assert.equal(profile.editable, false);
  await enable(data.service);
  const firstLibrary = await data.service.getDirectProfiles();
  assert.equal(firstLibrary.lastDirectProfileId, profile.id);
  const afterFirst = await fs.readFile(data.configPath, "utf8");
  await fs.writeFile(data.configPath, afterFirst + '\n[mcp_servers.newer]\ncommand = "keep-newer"\n');
  await enable(data.service);
  assert.equal((await data.service.getDirectProfiles()).lastDirectProfileId, profile.id);
  const returned = await enable(data.service, profile.id);
  assert.equal(returned.mode, "direct");
  assert.equal(returned.direct.profileId, profile.id);
  const config = parse(await fs.readFile(data.configPath, "utf8"));
  assert.equal(config.model_provider, "third_party");
  assert.equal(config.model, "third-model");
  assert.equal(config.model_catalog_json, "C:/external-catalog.json");
  assert.equal(config.model_providers.third_party.env_key, "EXISTING_ENV_KEY");
  assert.equal(config.model_providers.third_party.http_headers["X-Custom"], "secret-custom-header");
  assert.equal(config.mcp_servers.newer.command, "keep-newer");
  assert.equal(config.model_reasoning_effort, "xhigh");
  assert.ok(!(await fs.readFile(data.profilesPath)).includes(Buffer.from("secret-custom-header")));
});
test("automatic direct capture deduplicates and is mandatory before Gateway activation", async () => {
  const original =
    'model = "original"\nmodel_provider = "third"\n[model_providers.third]\nname = "Third"\nbase_url = "https://third.example/v1"\nwire_api = "responses"\nexperimental_bearer_token = "' +
    key +
    '"\nrequires_openai_auth = false\n';
  const data = await fixture({ original });
  await enable(data.service);
  const library = await data.service.getDirectProfiles();
  assert.ok(library.lastDirectProfileId);
  const direct = library.profiles.find((p) => p.id === library.lastDirectProfileId);
  assert.equal(direct.kind, "custom");
  await enable(data.service);
  assert.equal((await data.service.getDirectProfiles()).profiles.length, library.profiles.length);
  const blocked = await fixture({ original, safeStorage: encryptedStorage(false) });
  const preview = await blocked.service.preview(gateway);
  await assert.rejects(
    blocked.service.apply({ ...gateway, expectedRevision: preview.revision, clientKey: gatewayKey }),
    { code: "CODEX_PROFILES_UNAVAILABLE" },
  );
  assert.equal(await fs.readFile(blocked.configPath, "utf8"), original);
});
test("official direct default does not force ChatGPT login or delete inactive suppliers/auth", async () => {
  const data = await fixture({
    original:
      'model_provider = "cx_routing_gateway"\nmodel = "route-a"\nforced_login_method = "chatgpt"\nopenai_base_url = "http://localhost/v1"\n[model_providers.cx_routing_gateway]\nexperimental_bearer_token = "retained"\n[model_providers.openai]\nbase_url = "https://custom/v1"\n',
  });
  const saved = await enable(data.service, "official");
  assert.equal(saved.mode, "direct");
  assert.equal(saved.direct.kind, "official");
  const config = parse(await fs.readFile(data.configPath, "utf8"));
  assert.equal(config.model_provider, undefined);
  assert.equal(config.forced_login_method, undefined);
  assert.equal(config.model, undefined);
  assert.equal(config.openai_base_url, undefined);
  assert.equal(config.model_providers.cx_routing_gateway.experimental_bearer_token, "retained");
  assert.equal(config.model_providers.openai, undefined);
});
test("encrypted profile corruption, unavailable storage, validation and stale config import fail closed", async () => {
  const data = await fixture();
  const saved = await save(data.service);
  await fs.writeFile(data.profilesPath, "tampered encrypted payload");
  await assert.rejects(data.service.getDirectProfiles(), { code: "CODEX_PROFILES_INVALID" });
  const blocked = await fixture({ safeStorage: encryptedStorage(false) });
  const list = await blocked.service.getDirectProfiles();
  assert.equal(list.secureStorageAvailable, false);
  await assert.rejects(save(blocked.service), { code: "CODEX_PROFILES_UNAVAILABLE" });
  const normal = await fixture();
  for (const extra of [
    { baseUrl: "http://remote.example/v1" },
    { baseUrl: "https://user:key@example/v1" },
    { baseUrl: "https://example/v1?key=secret" },
    { models: ["a", "a"], defaultModel: "a" },
    { models: ["a"], defaultModel: "missing" },
  ])
    await assert.rejects(save(normal.service, extra), { code: "CODEX_INPUT_INVALID" });
  const status = await normal.service.getStatus();
  const library = await normal.service.getDirectProfiles();
  await fs.writeFile(normal.configPath, 'model = "external"\n');
  await assert.rejects(
    normal.service.importDirectProfile({ expectedRevision: library.revision, expectedConfigRevision: status.revision }),
    { code: "CODEX_CONFIG_CHANGED" },
  );
  assert.ok(saved.revision);
});

test("simple current Responses import stays editable and blank-Key edits preserve secret until explicit activation", async () => {
  const original =
    'model = "existing-model"\nmodel_provider = "existing"\n[model_providers.existing]\nname = "Existing"\nbase_url = "https://existing.example/v1"\nwire_api = "responses"\nexperimental_bearer_token = "' +
    key +
    '"\n';
  const data = await fixture({ original });
  const list = await data.service.getDirectProfiles(),
    status = await data.service.getStatus();
  const imported = await data.service.importDirectProfile({
    expectedRevision: list.revision,
    expectedConfigRevision: status.revision,
    name: "Imported",
  });
  const profile = imported.profiles.find((item) => item.name === "Imported");
  assert.equal(profile.kind, "custom");
  assert.equal(profile.editable, true);
  assert.equal(profile.active, true);
  const edited = await data.service.saveDirectProfile({
    expectedRevision: imported.revision,
    id: profile.id,
    name: "Edited",
    baseUrl: "https://edited.example/v1",
    models: ["new-model"],
    defaultModel: "new-model",
    apiKey: "",
  });
  assert.equal(edited.profiles.find((item) => item.id === profile.id).active, false);
  assert.equal(await fs.readFile(data.configPath, "utf8"), original);
  await enable(data.service, profile.id);
  const config = parse(await fs.readFile(data.configPath, "utf8"));
  assert.equal(config.model, "new-model");
  assert.equal(config.model_providers.cx_codex_direct.base_url, "https://edited.example/v1");
  assert.equal(config.model_providers.cx_codex_direct.experimental_bearer_token, key);
  const changed = await fs.readFile(data.configPath, "utf8");
  await fs.writeFile(data.configPath, changed.replace('"Edited"', '"External edit"'));
  const actual = await data.service.getDirectProfiles();
  assert.equal(actual.profiles.find((item) => item.id === profile.id).active, false);
});

test("advanced unknown provider fields remain readonly snapshots and official model choice survives Gateway return", async () => {
  const advanced = await fixture({
    original:
      'model = "advanced"\nmodel_provider = "custom"\n[model_providers.custom]\nbase_url = "https://advanced.example/v1"\nwire_api = "responses"\nrequires_openai_auth = false\nrequest_max_retries = 7\nexperimental_bearer_token = "' +
      key +
      '"\n',
  });
  let library = await advanced.service.getDirectProfiles(),
    status = await advanced.service.getStatus();
  const imported = await advanced.service.importDirectProfile({
    expectedRevision: library.revision,
    expectedConfigRevision: status.revision,
  });
  assert.equal(imported.profiles.find((item) => item.id !== "official").kind, "snapshot");
  assert.equal(imported.profiles.find((item) => item.id !== "official").editable, false);
  const official = await fixture({ original: 'model = "account-selected-model"\nmodel_reasoning_effort = "medium"\n' });
  await enable(official.service);
  library = await official.service.getDirectProfiles();
  assert.ok(library.lastDirectProfileId !== "official");
  await enable(official.service, library.lastDirectProfileId);
  const config = parse(await fs.readFile(official.configPath, "utf8"));
  assert.equal(config.model, "account-selected-model");
  assert.equal(config.model_provider, undefined);
  assert.equal(config.model_reasoning_effort, "medium");
});

test("profile edit after preview and profile changes during catalogue publication abort activation", async () => {
  const data = await fixture({ original: 'model = "before"\n' });
  let library = await save(data.service),
    profile = library.profiles.find((item) => item.kind === "custom");
  const input = { mode: "direct", profileId: profile.id, profilesRevision: library.revision },
    preview = await data.service.preview(input);
  await data.service.saveDirectProfile({
    expectedRevision: library.revision,
    id: profile.id,
    name: "Newer",
    baseUrl: profile.baseUrl,
    models: profile.models,
    defaultModel: profile.defaultModel,
  });
  await assert.rejects(data.service.apply({ ...input, expectedRevision: preview.revision }), {
    code: "CODEX_PROFILES_CHANGED",
  });
  assert.equal(await fs.readFile(data.configPath, "utf8"), 'model = "before"\n');
  let changed = false;
  const fsImpl = {
    ...fs,
    link: async (source, target) => {
      await fs.link(source, target);
      if (!changed) {
        changed = true;
        await fs.writeFile(data.profilesPath, "external library replacement");
      }
    },
  };
  const racing = createCodexConfigService({ ...data, fsImpl, getRoutes: async () => {}, validateKey: async () => {} });
  library = await racing.getDirectProfiles();
  const newer = { mode: "direct", profileId: profile.id, profilesRevision: library.revision };
  const next = await racing.preview(newer);
  await assert.rejects(racing.apply({ ...newer, expectedRevision: next.revision }), (error) =>
    ["CODEX_PROFILES_CHANGED", "CODEX_PROFILES_INVALID"].includes(error.code),
  );
  assert.equal(await fs.readFile(data.configPath, "utf8"), 'model = "before"\n');
});

test("pending official login blocks config activation and restore while profile library CRUD stays available", async () => {
  let pending = false;
  const data = await fixture({ isLoginPending: () => pending });
  const library = await save(data.service),
    profile = library.profiles.find((item) => item.kind === "custom");
  const input = { mode: "direct", profileId: profile.id, profilesRevision: library.revision },
    preview = await data.service.preview(input);
  pending = true;
  await assert.rejects(data.service.apply({ ...input, expectedRevision: preview.revision }), {
    code: "CODEX_LOGIN_PENDING",
  });
  const edited = await data.service.saveDirectProfile({
    expectedRevision: library.revision,
    id: profile.id,
    name: "Still editable",
    baseUrl: profile.baseUrl,
    models: profile.models,
    defaultModel: profile.defaultModel,
  });
  assert.equal(edited.profiles.find((item) => item.id === profile.id).name, "Still editable");
  await assert.rejects(data.service.restore({ backupId: "a".repeat(64), expectedRevision: "missing" }), {
    code: "CODEX_LOGIN_PENDING",
  });
});

test("unavailable encryption permits built-in official default but never third-party capture or plaintext fallback", async () => {
  const data = await fixture({
    original: 'model_provider = "cx_routing_gateway"\n',
    safeStorage: encryptedStorage(false),
  });
  const status = await enable(data.service, "official");
  assert.equal(status.direct.kind, "official");
  await assert.rejects(fs.readFile(data.profilesPath), { code: "ENOENT" });
});

test("quoted dotted and inline routing snapshots preserve raw precision, headers and later unrelated tables", async () => {
  for (const providerSource of [
    '"model_providers"."advanced" = { name = "Advanced", base_url = "https://advanced.example/v1", wire_api = "responses", env_key = "NATIVE_ENV", tuning = 1.0, http_headers = { "X-Key" = "hidden-header" } }\n',
    '["model_providers"."advanced"]\nname = "Advanced"\nbase_url = "https://advanced.example/v1"\nwire_api = "responses"\nenv_key = "NATIVE_ENV"\ntuning = -0.0\n[model_providers.advanced.extra]\nprecise = 1979-05-27T07:32:00.123456789Z\n',
  ]) {
    const original =
      'model = "advanced-model"\nmodel_provider = "advanced"\n' +
      providerSource +
      '[mcp_servers.old]\ncommand = "old"\n';
    const data = await fixture({ original });
    await enable(data.service);
    const library = await data.service.getDirectProfiles();
    const saved = await fs.readFile(data.configPath, "utf8");
    await fs.writeFile(data.configPath, saved + '\n[hooks]\ncommand = "new-hook"\n');
    await enable(data.service, library.lastDirectProfileId);
    const returned = await fs.readFile(data.configPath, "utf8");
    const config = parse(returned);
    assert.equal(config.model_providers.advanced.env_key, "NATIVE_ENV");
    assert.equal(config.hooks.command, "new-hook");
    if (providerSource.includes("hidden-header"))
      assert.equal(config.model_providers.advanced.http_headers["X-Key"], "hidden-header");
    for (const literal of ["1.0", "-0.0", "1979-05-27T07:32:00.123456789Z"]) {
      if (providerSource.includes(literal)) assert.ok(returned.includes(literal));
    }
  }
});

test("unsafe third-party official-auth fallback is non-importable and cannot be captured or activated", async () => {
  for (const original of [
    'model_provider = "third"\n[model_providers.third]\nbase_url = "https://third.example/v1"\nwire_api = "responses"\nrequires_openai_auth = true\n',
    'openai_base_url = "https://third.example/v1"\n',
    'model_provider = "openai"\nchatgpt_base_url = "https://third.example/backend"\n',
    'model_provider = "third"\n[model_providers.third]\nbase_url = "https://third.example/v1"\nwire_api = "responses"\nrequires_openai_auth = true\nhttp_headers = { Authorization = "Bearer provider-header" }\n',
  ]) {
    const data = await fixture({ original });
    const status = await data.service.getStatus();
    assert.equal(status.direct.importable, false);
    assert.match(status.direct.warning, /官方账户凭证/);
    const list = await data.service.getDirectProfiles();
    await assert.rejects(
      data.service.importDirectProfile({ expectedRevision: list.revision, expectedConfigRevision: status.revision }),
      { code: "CODEX_DIRECT_AUTH_UNSAFE" },
    );
    const preview = await data.service.preview(gateway);
    await assert.rejects(
      data.service.apply({ ...gateway, clientKey: gatewayKey, expectedRevision: preview.revision }),
      { code: "CODEX_DIRECT_AUTH_UNSAFE" },
    );
    assert.equal(await fs.readFile(data.configPath, "utf8"), original);
    await assert.rejects(fs.readFile(data.profilesPath), { code: "ENOENT" });
    assert.deepEqual(await fs.readdir(data.codexHome), ["config.toml"]);
  }
});

test("snapshot import keeps explicit provider token or env auth while headers need disabled official fallback", async () => {
  for (const auth of [
    'requires_openai_auth = true\nexperimental_bearer_token = "supplier-token"\n',
    'requires_openai_auth = true\nenv_key = "SUPPLIER_KEY_NOT_RESOLVED"\n',
    'requires_openai_auth = false\nhttp_headers = { Authorization = "Bearer supplier-header" }\n',
    'requires_openai_auth = false\nenv_http_headers = { "x-api-key" = "SUPPLIER_HEADER_ENV" }\n',
  ]) {
    const original =
      'model_provider = "third"\nmodel = "third-model"\n[model_providers.third]\nbase_url = "https://third.example/v1"\nwire_api = "responses"\n' +
      auth;
    const data = await fixture({ original });
    const status = await data.service.getStatus(),
      library = await data.service.getDirectProfiles();
    assert.equal(status.direct.importable, true);
    const imported = await data.service.importDirectProfile({
      expectedRevision: library.revision,
      expectedConfigRevision: status.revision,
    });
    const selected = imported.profiles.find((profile) => profile.id !== "official");
    await enable(data.service);
    await enable(data.service, selected.id);
    const config = parse(await fs.readFile(data.configPath, "utf8"));
    assert.equal(config.model_providers.third.requires_openai_auth, auth.includes("= true"));
    assert.ok(!JSON.stringify(imported).includes("supplier-token"));
    assert.ok(!JSON.stringify(imported).includes("supplier-header"));
  }
});

test("a validly encrypted tampered unsafe routing recipe cannot bypass import authentication checks", async () => {
  const original =
    'model_provider = "third"\nmodel = "third-model"\n[model_providers.third]\nbase_url = "https://third.example/v1"\nwire_api = "responses"\nrequires_openai_auth = false\nenv_key = "THIRD_KEY"\n';
  const data = await fixture({ original });
  const status = await data.service.getStatus(),
    library = await data.service.getDirectProfiles();
  const imported = await data.service.importDirectProfile({
    expectedRevision: library.revision,
    expectedConfigRevision: status.revision,
  });
  const encrypted = await fs.readFile(data.profilesPath),
    plaintext = await data.safeStorage.decryptStringAsync(encrypted),
    payload = JSON.parse(plaintext.result);
  const recipe = payload.profiles[0].recipe;
  recipe.values = recipe.values.filter((value) => !value.parts.includes("env_key"));
  recipe.values.find((value) => value.parts.includes("requires_openai_auth")).raw = "true";
  const { recipeHash } = require("../../apps/desktop/electron/codex-direct-projection.cjs");
  payload.profiles[0].fingerprint = recipeHash(recipe);
  await fs.writeFile(data.profilesPath, await data.safeStorage.encryptStringAsync(JSON.stringify(payload)));
  const before = await fs.readFile(data.configPath);
  await assert.rejects(data.service.getDirectProfiles(), { code: "CODEX_PROFILES_INVALID" });
  const revision = (await import("node:crypto"))
    .createHash("sha256")
    .update(await fs.readFile(data.profilesPath))
    .digest("hex");
  await assert.rejects(
    data.service.preview({ mode: "direct", profileId: imported.profiles[1].id, profilesRevision: revision }),
    { code: "CODEX_PROFILES_INVALID" },
  );
  assert.deepEqual(await fs.readFile(data.configPath), before);
});

test("snapshot activation returns accurate external catalogue status from preparation before config commit", async () => {
  const original =
    'model_provider = "third"\nmodel = "third-model"\nmodel_catalog_json = "C:/external-catalog.json"\n[model_providers.third]\nbase_url = "https://third.example/v1"\nwire_api = "responses"\nenv_key = "THIRD_KEY"\n';
  const data = await fixture({ original }),
    status = await data.service.getStatus(),
    list = await data.service.getDirectProfiles();
  const imported = await data.service.importDirectProfile({
    expectedRevision: list.revision,
    expectedConfigRevision: status.revision,
  });
  await enable(data.service);
  const returned = await enable(data.service, imported.profiles[1].id);
  assert.equal(returned.catalogStatus, "external");
  assert.equal((await data.service.getStatus()).catalogStatus, returned.catalogStatus);
});

test("snapshot activation reports retained managed catalogue without a post-commit catalogue read", async () => {
  const data = await fixture();
  const { CodexConfigStore } = require("../../apps/desktop/electron/codex-config-store.cjs");
  const { createModelCatalog } = require("../../apps/desktop/electron/codex-model-catalog.cjs");
  const catalogues = createModelCatalog(new CodexConfigStore({ codexHome: data.codexHome }));
  const catalog = catalogues.planDirect(["snapshot-model"], "snapshot-model");
  await catalogues.write(catalog);
  await fs.writeFile(
    data.configPath,
    'model_provider = "third"\nmodel = "snapshot-model"\nmodel_catalog_json = ' +
      JSON.stringify(catalog.path) +
      '\n[model_providers.third]\nbase_url = "https://third.example/v1"\nwire_api = "responses"\nenv_key = "THIRD_KEY"\n',
  );
  const status = await data.service.getStatus(),
    list = await data.service.getDirectProfiles();
  const imported = await data.service.importDirectProfile({
    expectedRevision: list.revision,
    expectedConfigRevision: status.revision,
  });
  await enable(data.service);
  let committed = false;
  const fsImpl = {
    ...fs,
    rename: async (source, target) => {
      await fs.rename(source, target);
      if (target === data.configPath) committed = true;
    },
    open: async (target, ...args) => {
      if (committed && target === catalog.path) throw Error("scanner after commit");
      return fs.open(target, ...args);
    },
  };
  const service = createCodexConfigService({ ...data, fsImpl, getRoutes: async () => {}, validateKey: async () => {} });
  const returned = await enable(service, imported.profiles[1].id);
  assert.equal(returned.catalogStatus, "managed");
  assert.deepEqual(returned.selectedModelAliases, ["snapshot-model"]);
});

test("external edit during final asynchronous profile validation is preserved before config replacement", async () => {
  const data = await fixture({ original: 'model = "before"\n' });
  const saved = await save(data.service),
    profile = saved.profiles.find((item) => item.kind === "custom");
  let validateFinal = false,
    releaseValidation,
    enteredValidation;
  const entered = new Promise((resolve) => {
    enteredValidation = resolve;
  });
  const release = new Promise((resolve) => {
    releaseValidation = resolve;
  });
  const storage = {
    ...data.safeStorage,
    decryptStringAsync: async (bytes) => {
      if (validateFinal) {
        validateFinal = false;
        enteredValidation();
        await release;
      }
      return data.safeStorage.decryptStringAsync(bytes);
    },
  };
  const fsImpl = {
    ...fs,
    rename: async (source, target) => {
      await fs.rename(source, target);
      if (String(target).endsWith(path.join(".cx-routing-gateway", "state.json"))) validateFinal = true;
    },
  };
  const service = createCodexConfigService({
    ...data,
    safeStorage: storage,
    fsImpl,
    getRoutes: async () => {},
    validateKey: async () => {},
  });
  const library = await service.getDirectProfiles();
  const selection = { mode: "direct", profileId: profile.id, profilesRevision: library.revision };
  const preview = await service.preview(selection);
  const applying = service.apply({ ...selection, expectedRevision: preview.revision });
  await entered;
  const external = 'model = "external-during-validation"\n[mcp_servers.newer]\ncommand = "preserve"\n';
  await fs.writeFile(data.configPath, external);
  releaseValidation();
  await assert.rejects(applying, { code: "CODEX_CONFIG_CHANGED" });
  assert.equal(await fs.readFile(data.configPath, "utf8"), external);
});

test("pure official snapshot import cannot shadow reserved official status or the native login gate", async () => {
  const data = await fixture();
  const original = await data.service.getStatus(),
    library = await data.service.getDirectProfiles();
  const imported = await data.service.importDirectProfile({
    expectedRevision: library.revision,
    expectedConfigRevision: original.revision,
    name: "Imported official default",
  });
  assert.ok(imported.profiles.some((profile) => profile.id === "official"));
  await enable(data.service);
  const returned = await enable(data.service, "official");
  assert.equal(returned.mode, "direct");
  assert.equal(returned.direct.kind, "official");
  assert.equal(returned.direct.profileId, "official");
  const profiles = await data.service.getDirectProfiles();
  assert.equal(profiles.profiles.find((profile) => profile.id === "official").active, true);
  assert.equal(profiles.profiles.filter((profile) => profile.active).length, 1);
  const { createCodexClientManager } = require("../../apps/desktop/electron/codex-client-manager.cjs");
  const client = createCodexClientManager({
    codexHome: data.codexHome,
    resolveExecutable: async () => undefined,
    getConfigStatus: () => data.service.getStatus(),
  });
  // Reaching the CLI-not-found result proves the mode/revision gate accepted
  // this actual saved config, without launching a process or reading auth.
  await assert.rejects(client.startLogin({ expectedRevision: returned.revision }), { code: "CODEX_CLI_NOT_FOUND" });
  client.dispose();
});
