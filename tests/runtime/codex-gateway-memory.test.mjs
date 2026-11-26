import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { encryptedStorage } from "./codex-direct-fixture.mjs";
import { ConfigStore } from "../../packages/shared/src/config-store.mjs";
import { SecretVault } from "../../packages/shared/src/secret-vault.mjs";
import { createControlServer } from "../../services/local-control/src/server.mjs";
import { createGatewayServer } from "../../services/gateway/src/server.mjs";
const require = createRequire(import.meta.url);
const { createCodexConfigService } = require("../../apps/desktop/electron/codex-config-service.cjs");
const { parse } = require("../../apps/desktop/node_modules/smol-toml");
async function fixture({
  original,
  fsImpl = fs,
  getGatewayCredentials,
  resolveGatewayCredential,
  retainGatewayCredential,
} = {}) {
  const root = path.resolve(".tmp/codex-memory-effort-20261126");
  await fs.mkdir(root, { recursive: true });
  const dir = await fs.mkdtemp(path.join(root, "native-"));
  const codexHome = path.join(dir, "codex");
  await fs.mkdir(codexHome);
  const configPath = path.join(codexHome, "config.toml"),
    preferencesPath = path.join(dir, "appdata", "codex-gateway-preferences.json"),
    profilesPath = path.join(dir, "appdata", "profiles.enc");
  if (original !== undefined) await fs.writeFile(configPath, original);
  const validated = [];
  const options = {
    codexHome,
    preferencesPath,
    profilesPath,
    safeStorage: encryptedStorage(),
    platform: "win32",
    fsImpl,
    getRoutes: async (ids) => ({
      routes: ids.map((id) => ({ id, model: "model-" + id })),
      baseUrl: "http://127.0.0.1:4318/v1",
    }),
    validateKey: async (key, model) => validated.push({ key, model }),
    getGatewayCredentials,
    resolveGatewayCredential,
    retainGatewayCredential,
  };
  return {
    dir,
    codexHome,
    configPath,
    preferencesPath,
    profilesPath,
    validated,
    options,
    service: createCodexConfigService(options),
  };
}
const choice = { routeIds: ["a", "b"], defaultRouteId: "b", credentialSource: "stored", credentialId: "key-a" };
test("Gateway preferences persist nonsecret unfinished choices and remain separate from applied Codex config", async () => {
  const data = await fixture();
  const initial = await data.service.getGatewayPreferences();
  assert.equal(initial.exists, false);
  assert.deepEqual(initial.routeIds, []);
  const saved = await data.service.saveGatewayPreferences({ expectedRevision: initial.revision, ...choice });
  assert.equal(saved.exists, true);
  assert.deepEqual(saved.routeIds, ["a", "b"]);
  assert.equal(saved.defaultRouteId, "b");
  const restarted = createCodexConfigService(data.options);
  assert.deepEqual(await restarted.getGatewayPreferences(), saved);
  await assert.rejects(fs.readFile(data.configPath), { code: "ENOENT" });
  const json = JSON.parse(await fs.readFile(data.preferencesPath, "utf8"));
  assert.ok(!JSON.stringify(json).includes("clientKey"));
  assert.ok(!JSON.stringify(json).includes("apiKey"));
  await assert.rejects(data.service.saveGatewayPreferences({ expectedRevision: initial.revision, ...choice }), {
    code: "CODEX_PREFERENCES_CHANGED",
  });
  const empty = await data.service.saveGatewayPreferences({
    expectedRevision: saved.revision,
    routeIds: [],
    defaultRouteId: "",
    credentialSource: "manual",
  });
  assert.deepEqual(empty.routeIds, []);
  assert.equal(empty.defaultRouteId, "");
});
test("preferences bind each fixed Codex home, reject corruption and invalid schema without silently replacing data", async () => {
  const data = await fixture();
  const first = await data.service.getGatewayPreferences();
  await data.service.saveGatewayPreferences({ expectedRevision: first.revision, ...choice });
  const otherHome = path.join(data.dir, "other-codex");
  await fs.mkdir(otherHome);
  const other = createCodexConfigService({ ...data.options, codexHome: otherHome });
  const empty = await other.getGatewayPreferences();
  assert.equal(empty.exists, false);
  assert.deepEqual(empty.routeIds, []);
  await other.saveGatewayPreferences({
    expectedRevision: empty.revision,
    routeIds: ["other"],
    defaultRouteId: "other",
    credentialSource: "current",
  });
  assert.deepEqual((await data.service.getGatewayPreferences()).routeIds, ["a", "b"]);
  const bytes = await fs.readFile(data.preferencesPath);
  for (const extra of [
    { routeIds: ["a", "a"] },
    { defaultRouteId: "missing" },
    { clientKey: "never-save" },
    { credentialSource: "stored", credentialId: undefined },
  ]) {
    const current = await data.service.getGatewayPreferences();
    await assert.rejects(
      data.service.saveGatewayPreferences({ expectedRevision: current.revision, ...choice, ...extra }),
      { code: "CODEX_INPUT_INVALID" },
    );
    assert.deepEqual(await fs.readFile(data.preferencesPath), bytes);
  }
  await fs.writeFile(data.preferencesPath, "broken-json");
  await assert.rejects(data.service.getGatewayPreferences(), { code: "CODEX_PREFERENCES_INVALID" });
  await assert.rejects(data.service.saveGatewayPreferences({ expectedRevision: "missing", ...choice }), {
    code: "CODEX_PREFERENCES_INVALID",
  });
  assert.equal(await fs.readFile(data.preferencesPath, "utf8"), "broken-json");
});
test("first Gateway preferences fallback reads only active managed catalogue and later direct mode keeps saved draft", async () => {
  const data = await fixture();
  const selection = { mode: "gateway", routeIds: ["a", "b"], defaultRouteId: "b" };
  const preview = await data.service.preview(selection);
  await data.service.apply({ ...selection, expectedRevision: preview.revision, clientKey: "cxrg_fixture_gateway_key" });
  const fallback = await data.service.getGatewayPreferences();
  assert.equal(fallback.exists, false);
  assert.deepEqual(fallback.routeIds, ["a", "b"]);
  assert.equal(fallback.defaultRouteId, "b");
  const saved = await data.service.saveGatewayPreferences({ expectedRevision: fallback.revision, ...choice });
  const profiles = await data.service.getDirectProfiles(),
    direct = { mode: "direct", profileId: "official", profilesRevision: profiles.revision };
  const p = await data.service.preview(direct);
  await data.service.apply({ ...direct, expectedRevision: p.revision });
  assert.deepEqual(await data.service.getGatewayPreferences(), saved);
  const status = await data.service.getStatus();
  assert.equal(status.configScope, "user");
});
test("stored credential resolves only natively and every selected model is validated with no key in outputs", async () => {
  const resolved = [];
  const metadata = {
    credentials: [
      {
        id: "key-a",
        name: "Existing",
        scope: ["model-a", "model-b"],
        enabled: true,
        secretAvailable: true,
        current: false,
      },
    ],
    currentConfigured: false,
  };
  const data = await fixture({
    getGatewayCredentials: async () => metadata,
    resolveGatewayCredential: async (id) => {
      resolved.push(id);
      return { id, key: "cxrg_stored_fixture_secret" };
    },
  });
  const list = await data.service.getGatewayCredentials();
  assert.deepEqual(list, metadata);
  const selection = { mode: "gateway", routeIds: ["a", "b"], defaultRouteId: "b" },
    preview = await data.service.preview(selection);
  const status = await data.service.apply({ ...selection, expectedRevision: preview.revision, credentialId: "key-a" });
  assert.deepEqual(resolved, ["key-a"]);
  assert.deepEqual(
    data.validated.map((v) => v.model),
    ["model-a", "model-b"],
  );
  assert.ok(!JSON.stringify(status).includes("cxrg_stored_fixture_secret"));
  const config = parse(await fs.readFile(data.configPath, "utf8"));
  assert.equal(config.model_providers.cx_routing_gateway.experimental_bearer_token, "cxrg_stored_fixture_secret");
  await assert.rejects(
    data.service.apply({
      ...selection,
      expectedRevision: status.revision,
      credentialId: "key-a",
      clientKey: "another-secret",
    }),
    { code: "CODEX_INPUT_INVALID" },
  );
});
test("current credential retention uses managed config only and returns metadata without raw secret", async () => {
  const calls = [];
  const currentKey = "cxrg_current_fixture_key";
  const original =
    'model_provider = "cx_routing_gateway"\n[model_providers.cx_routing_gateway]\nexperimental_bearer_token = "' +
    currentKey +
    '"\n';
  const data = await fixture({
    original,
    getGatewayCredentials: async (key) => ({
      credentials: [
        {
          id: "key-current",
          name: "Current",
          scope: [],
          enabled: true,
          secretAvailable: false,
          current: key === currentKey,
        },
      ],
      currentCredentialId: "key-current",
      currentConfigured: true,
    }),
    retainGatewayCredential: async (id, key) => {
      calls.push({ id, key });
      return { id };
    },
  });
  const result = await data.service.retainGatewayCredential({ id: "key-current", fromCurrent: true });
  assert.deepEqual(calls, [{ id: "key-current", key: currentKey }]);
  assert.ok(!JSON.stringify(result).includes(currentKey));
  await assert.rejects(data.service.retainGatewayCredential({ id: "key-current", key: "manual", fromCurrent: true }), {
    code: "CODEX_INPUT_INVALID",
  });
  const noCurrent = await fixture({
    getGatewayCredentials: async () => ({ credentials: [], currentConfigured: false }),
    retainGatewayCredential: async () => {},
  });
  await assert.rejects(noCurrent.service.retainGatewayCredential({ id: "key-current", fromCurrent: true }), {
    code: "CODEX_CREDENTIAL_UNAVAILABLE",
  });
});
test("new Gateway catalogue publishes standard reasoning choices while direct and historical catalogue metadata remain valid", async () => {
  const data = await fixture({ original: 'model_reasoning_effort = "high"\n' }),
    selection = { mode: "gateway", routeIds: ["a"], defaultRouteId: "a" };
  const preview = await data.service.preview(selection);
  const status = await data.service.apply({
    ...selection,
    expectedRevision: preview.revision,
    clientKey: "cxrg_fixture_gateway_key",
  });
  const config = parse(await fs.readFile(data.configPath, "utf8")),
    catalog = JSON.parse(await fs.readFile(config.model_catalog_json, "utf8"));
  assert.deepEqual(
    catalog.models[0].supported_reasoning_levels.map((item) => item.effort),
    ["none", "minimal", "low", "medium", "high", "xhigh"],
  );
  assert.equal(catalog.models[0].default_reasoning_level, "medium");
  assert.equal(catalog.models[0].supports_reasoning_effort_updates, false);
  assert.equal(config.model_reasoning_effort, "high");
  const { createModelCatalog, catalogData } = require("../../apps/desktop/electron/codex-model-catalog.cjs"),
    { CodexConfigStore } = require("../../apps/desktop/electron/codex-config-store.cjs");
  const builder = createModelCatalog(new CodexConfigStore({ codexHome: data.codexHome }));
  const direct = builder.planDirect(["direct-model"], "direct-model");
  assert.deepEqual(direct.data.models[0].supported_reasoning_levels, []);
  assert.equal(direct.data.models[0].default_reasoning_level, null);
  await builder.write(direct);
  assert.equal((await builder.inspect(direct.path)).status, "managed");
  assert.equal(status.catalogStatus, "managed");
});

test("preferences serialize separate instances, reject linked files and preserve external edits during preparation", async () => {
  const data = await fixture();
  const other = createCodexConfigService(data.options);
  const results = await Promise.allSettled(
    [data.service, other].map((service) => service.saveGatewayPreferences({ expectedRevision: "missing", ...choice })),
  );
  assert.equal(results.filter((value) => value.status === "fulfilled").length, 1);
  assert.equal(results.find((value) => value.status === "rejected").reason.code, "CODEX_PREFERENCES_CHANGED");
  const saved = await data.service.getGatewayPreferences(),
    before = await fs.readFile(data.preferencesPath);
  const fsImpl = {
    ...fs,
    open: async (target, ...args) => {
      const handle = await fs.open(target, ...args);
      if (String(target).includes("codex-gateway-preferences.json.") && args[0] === "wx")
        return {
          writeFile: async (bytes) => {
            await handle.writeFile(bytes);
            await fs.writeFile(data.preferencesPath, "external-invalid");
          },
          sync: () => handle.sync(),
          close: () => handle.close(),
        };
      return handle;
    },
  };
  const racing = createCodexConfigService({ ...data.options, fsImpl });
  await assert.rejects(
    racing.saveGatewayPreferences({
      expectedRevision: saved.revision,
      routeIds: [],
      defaultRouteId: "",
      credentialSource: "current",
    }),
    { code: "CODEX_PREFERENCES_INVALID" },
  );
  assert.equal(await fs.readFile(data.preferencesPath, "utf8"), "external-invalid");
  await fs.writeFile(data.preferencesPath, before);
  const linked = path.join(data.dir, "linked-preferences.json");
  await fs.link(data.preferencesPath, linked);
  await assert.rejects(data.service.getGatewayPreferences(), { code: "CODEX_PATH_UNSAFE" });
  assert.deepEqual(await fs.readFile(linked), before);
});

test("legacy version-one Gateway catalogue remains readable and exact restoration keeps historical effort metadata", async () => {
  const data = await fixture();
  const { createModelCatalog, catalogData } = require("../../apps/desktop/electron/codex-model-catalog.cjs"),
    { CodexConfigStore } = require("../../apps/desktop/electron/codex-config-store.cjs");
  const builder = createModelCatalog(new CodexConfigStore({ codexHome: data.codexHome }));
  const legacyData = catalogData(["a"], "a", ["model-a"], "Historical fallback", "legacy");
  const bytes = Buffer.from(JSON.stringify(legacyData, null, 2) + "\n");
  const id = (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");
  const legacy = { data: legacyData, bytes, id, path: path.join(data.codexHome, ".cx-routing-gateway", "catalogs", id + ".json") };
  await builder.write(legacy);
  assert.equal(legacy.data._cxrg.version, 1);
  assert.deepEqual(legacy.data.models[0].supported_reasoning_levels, []);
  const original =
    'model_provider = "cx_routing_gateway"\nmodel = "model-a"\nmodel_catalog_json = ' +
    JSON.stringify(legacy.path) +
    '\n[model_providers.cx_routing_gateway]\nbase_url = "http://127.0.0.1:4318/v1"\nwire_api = "responses"\nexperimental_bearer_token = "cxrg_legacy_catalogue_key"\n';
  await fs.writeFile(data.configPath, original);
  assert.equal((await data.service.getStatus()).catalogStatus, "managed");
  const selection = { mode: "gateway", routeIds: ["a"], defaultRouteId: "a" },
    preview = await data.service.preview(selection),
    applied = await data.service.apply({ ...selection, expectedRevision: preview.revision });
  const current = parse(await fs.readFile(data.configPath, "utf8"));
  assert.ok(current.model_catalog_json !== legacy.path);
  const restored = await data.service.restore({ backupId: applied.backup.id, expectedRevision: applied.revision });
  assert.equal(restored.catalogStatus, "managed");
  assert.equal(await fs.readFile(data.configPath, "utf8"), original);
  assert.deepEqual(JSON.parse(await fs.readFile(legacy.path, "utf8")).models[0].supported_reasoning_levels, []);
});

test("unavailable stored credential and malformed secret resolution never fall back to current Key or write config", async () => {
  for (const resolveGatewayCredential of [
    async () => {
      throw Error("vault-private-failure");
    },
    async (id) => ({ id, key: "bad\nkey" }),
    async () => ({ id: "different", key: "cxrg_secret_wrong_id" }),
  ]) {
    const data = await fixture({ original: 'model = "before"\n', resolveGatewayCredential });
    const selection = { mode: "gateway", routeIds: ["a"], defaultRouteId: "a" },
      preview = await data.service.preview(selection);
    await assert.rejects(
      data.service.apply({ ...selection, expectedRevision: preview.revision, credentialId: "key-a" }),
      (error) => error.code === "CODEX_CREDENTIAL_UNAVAILABLE" && !error.message.includes("vault-private-failure"),
    );
    assert.equal(await fs.readFile(data.configPath, "utf8"), 'model = "before"\n');
    assert.deepEqual(await fs.readdir(data.codexHome), ["config.toml"]);
  }
});

test("runtime credential bridge uses control bearer and native SHA match without putting raw current Key in URLs or outputs", async () => {
  const { createCodexRuntimeClient } = require("../../apps/desktop/electron/codex-runtime-client.cjs");
  const requests = [],
    key = "cxrg_current_match_fixture";
  const credential = { id: "key-current", name: "Existing", scope: ["model-a"], enabled: true, secretAvailable: true };
  const client = createCodexRuntimeClient({
    getControlPort: () => 4319,
    getGatewayPort: () => 4318,
    getControlToken: () => "control-only-token",
    isRuntimeReady: () => true,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      assert.equal(options.headers.authorization, "Bearer control-only-token");
      if (url.endsWith("/match")) {
        assert.deepEqual(JSON.parse(options.body), { keyHash: crypto.createHash("sha256").update(key).digest("hex") });
        return new Response(JSON.stringify({ credential }));
      }
      if (url.endsWith("/secret"))
        return new Response(JSON.stringify(options.method === "POST" ? credential : { id: credential.id, key }));
      return new Response(JSON.stringify({ credentials: [credential] }));
    },
  });
  const result = await client.getGatewayCredentials(key);
  assert.equal(result.currentCredentialId, "key-current");
  assert.ok(!JSON.stringify(result).includes(key));
  assert.deepEqual(await client.resolveGatewayCredential("key-current"), { id: "key-current", key });
  await client.retainGatewayCredential("key-current", key);
  assert.ok(requests.every((request) => !request.url.includes(key)));
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[1].options.method, "POST");
  const bad = createCodexRuntimeClient({
    getControlPort: () => 4319,
    getGatewayPort: () => 4318,
    getControlToken: () => "control-only-token",
    isRuntimeReady: () => true,
    fetchImpl: async () => new Response(JSON.stringify({ error: "key_secret_mismatch" }), { status: 409 }),
  });
  await assert.rejects(bad.retainGatewayCredential("key-current", key), { code: "CODEX_CREDENTIAL_MISMATCH" });
});

test("native credential IDs integrate with encrypted Control storage, legacy retention and Gateway revocation checks", async (t) => {
  const data = await fixture({
    original:
      'model_provider = "cx_routing_gateway"\n[model_providers.cx_routing_gateway]\nexperimental_bearer_token = "cxrg_current_legacy_fixture"\n',
  });
  const store = new ConfigStore(path.join(data.dir, "runtime", "config.json"));
  const vault = new SecretVault(path.join(data.dir, "runtime", "secrets.json"), "memory-test-master");
  const legacyKey = "cxrg_current_legacy_fixture";
  await store.update((config) => ({
    ...config,
    upstreams: [{ id: "up", enabled: true }],
    routes: ["a", "b"].map((id) => ({
      id,
      alias: "model-" + id,
      modelId: "remote-" + id,
      upstreamId: "up",
      enabled: true,
      inboundProtocol: "Res",
      outboundProtocol: "Res",
    })),
    clientKeys: [
      {
        id: "legacy",
        name: "Legacy",
        scope: ["model-a", "model-b"],
        enabled: true,
        keyHash: crypto.createHash("sha256").update(legacyKey).digest("hex"),
      },
      {
        id: "revoked",
        name: "Revoked",
        scope: [],
        enabled: false,
        keyHash: crypto.createHash("sha256").update("revoked-fixture-key").digest("hex"),
      },
    ],
  }));
  const control = createControlServer({ store, vault, controlToken: "control-fixture-token" });
  const gateway = createGatewayServer({ store, vault });
  for (const server of [control, gateway]) {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(
      () =>
        new Promise((resolve) => {
          server.closeAllConnections?.();
          server.close(resolve);
        }),
    );
  }
  const controlPort = control.address().port,
    gatewayPort = gateway.address().port;
  const { createCodexRuntimeClient } = require("../../apps/desktop/electron/codex-runtime-client.cjs");
  const runtime = createCodexRuntimeClient({
    getControlPort: () => controlPort,
    getGatewayPort: () => gatewayPort,
    getControlToken: () => "control-fixture-token",
    isRuntimeReady: () => true,
  });
  const service = createCodexConfigService({ ...data.options, ...runtime });
  const listed = await service.getGatewayCredentials();
  assert.equal(listed.currentCredentialId, "legacy");
  assert.equal(listed.credentials.find((item) => item.id === "legacy").secretAvailable, false);
  assert.equal(listed.credentials.find((item) => item.id === "revoked").enabled, false);
  assert.ok(!JSON.stringify(listed).includes(legacyKey));
  await assert.rejects(service.retainGatewayCredential({ id: "legacy", key: "cxrg_wrong_original_fixture" }), {
    code: "CODEX_CREDENTIAL_MISMATCH",
  });
  const retained = await service.retainGatewayCredential({ id: "legacy", fromCurrent: true });
  assert.equal(retained.credentials.find((item) => item.id === "legacy").secretAvailable, true);
  const selection = { mode: "gateway", routeIds: ["a", "b"], defaultRouteId: "b" };
  const preview = await service.preview(selection);
  const applied = await service.apply({ ...selection, expectedRevision: preview.revision, credentialId: "legacy" });
  assert.equal(applied.model, "model-b");
  const persisted = await fs.readFile(store.filePath, "utf8");
  assert.ok(!persisted.includes(legacyKey));
  assert.ok(!(await fs.readFile(vault.filePath)).includes(Buffer.from(legacyKey)));
  const createdResponse = await fetch("http://127.0.0.1:" + controlPort + "/v1/control/client-keys", {
    method: "POST",
    headers: { authorization: "Bearer control-fixture-token", "content-type": "application/json" },
    body: JSON.stringify({ name: "One model", scope: ["model-a"] }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const beforeScopeFailure = await fs.readFile(data.configPath);
  await assert.rejects(service.apply({ ...selection, expectedRevision: applied.revision, credentialId: created.id }), {
    code: "CODEX_KEY_REJECTED",
  });
  assert.deepEqual(await fs.readFile(data.configPath), beforeScopeFailure);
  await store.update((config) => ({
    ...config,
    clientKeys: config.clientKeys.map((item) => (item.id === "legacy" ? { ...item, enabled: false } : item)),
  }));
  const before = await fs.readFile(data.configPath);
  await assert.rejects(service.apply({ ...selection, expectedRevision: applied.revision, credentialId: "legacy" }), {
    code: "CODEX_CREDENTIAL_UNAVAILABLE",
  });
  assert.deepEqual(await fs.readFile(data.configPath), before);
  assert.deepEqual((await store.read()).usage, []);
});
