import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { encryptedStorage } from './codex-direct-fixture.mjs';
const require = createRequire(import.meta.url);
const { parse } = require('../../apps/desktop/node_modules/smol-toml');
const { createCodexConfigService } = require('../../apps/desktop/electron/codex-config-service.cjs');
const { createCodexRuntimeClient } = require('../../apps/desktop/electron/codex-runtime-client.cjs');
const { createModelCatalog, catalogData } = require('../../apps/desktop/electron/codex-model-catalog.cjs');
const { CodexConfigStore } = require('../../apps/desktop/electron/codex-config-store.cjs');
const { REASONING_LEVELS, validReasoningRange } = require('../../apps/desktop/electron/codex-reasoning-range.cjs');
const selection = { mode: 'gateway', routeIds: ['a', 'b', 'c'], defaultRouteId: 'b' };
const routes = [
  { id: 'a', model: 'lower', reasoning: { min: 'none', max: 'low' }, outboundProtocol: 'Chat' },
  { id: 'b', model: 'upper', reasoning: { min: 'xhigh', max: 'max' }, outboundProtocol: 'Mes' },
  { id: 'c', model: 'legacy', outboundProtocol: 'Res' },
];
async function fixture({ original = '', getRoutes, validateKey = async () => {}, fsImpl = fs } = {}) {
  const root = path.resolve('.tmp/codex-routing-range-20261126');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'native-'));
  const codexHome = path.join(directory, 'codex');
  await fs.mkdir(codexHome);
  const configPath = path.join(codexHome, 'config.toml');
  await fs.writeFile(configPath, original);
  const options = { codexHome, fsImpl, profilesPath: path.join(directory, 'profiles.enc'), safeStorage: encryptedStorage(), platform: 'win32',
    getRoutes: getRoutes || (async ids => ({ routes: ids.map(id => structuredClone(routes.find(route => route.id === id))), baseUrl: 'http://127.0.0.1:4318/v1' })), validateKey };
  return { directory, configPath, codexHome, options, service: createCodexConfigService(options) };
}
async function enable(data, input = selection) {
  const preview = await data.service.preview(input);
  return data.service.apply({ ...input, expectedRevision: preview.revision, ...(input.mode === 'gateway' ? { clientKey: 'cxrg_local_fixture_key' } : {}) });
}
async function direct(data) {
  const library = await data.service.getDirectProfiles();
  return enable(data, { mode: 'direct', profileId: library.lastDirectProfileId || 'official', profilesRevision: library.revision });
}

test('native runtime route projection preserves validated reasoning range and outbound protocol', async () => {
  const state = { routes: routes.map(route => ({ ...route, alias: route.model, enabled: true, inboundProtocol: 'Res', targets: [{ upstreamId: 'u', modelId: route.model }] })), upstreams: [{ id: 'u', enabled: true }] };
  const client = createCodexRuntimeClient({ getControlPort: () => 4317, getGatewayPort: () => 4318, getControlToken: () => 'test-control', isRuntimeReady: () => true,
    fetchImpl: async () => new Response(JSON.stringify(state)) });
  assert.deepEqual((await client.getRoutes(selection.routeIds)).routes, routes);
  state.routes[0].reasoning = { min: 'ultra', max: 'none' };
  await assert.rejects(client.getRoutes(selection.routeIds), { code: 'CODEX_ROUTE_UNAVAILABLE' });
});

test('gateway v3 catalog reflects each route interval and medium clamp while retaining legacy choices', async () => {
  const data = await fixture();
  const preview = await data.service.preview(selection);
  assert.equal(preview.catalogRefresh, 'on-explicit-apply');
  await enable(data);
  const config = parse(await fs.readFile(data.configPath, 'utf8'));
  const catalog = JSON.parse(await fs.readFile(config.model_catalog_json, 'utf8'));
  assert.equal(catalog._cxrg.version, 5);
  assert.deepEqual(catalog._cxrg.reasoningRanges, [routes[0].reasoning, routes[1].reasoning, null]);
  assert.deepEqual(catalog.models.map(model => model.default_reasoning_level), ['low', 'xhigh', 'medium']);
  assert.deepEqual(catalog.models.map(model => model.supported_reasoning_levels.map(level => level.effort)), [
    ['none', 'minimal', 'low'], ['xhigh', 'max'], ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  ]);
  assert.equal((await data.service.getStatus()).catalogStatus, 'managed');
});

test('historical v1 v2 and direct catalog hashes remain recognized', async () => {
  const data = await fixture();
  const catalog = createModelCatalog(new CodexConfigStore({ codexHome: data.codexHome }));
  const directory = path.join(data.codexHome, '.cx-routing-gateway', 'catalogs');
  await fs.mkdir(directory, { recursive: true });
  for (const kind of ['legacy', 'gateway']) {
    const value = catalogData(['a'], 'a', ['model-a'], 'Historical prompt', kind);
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    const target = path.join(directory, crypto.createHash('sha256').update(bytes).digest('hex') + '.json');
    await fs.writeFile(target, bytes);
    assert.equal((await catalog.inspect(target)).status, 'managed');
    assert.equal(value._cxrg.version, kind === 'legacy' ? 1 : 2);
  }
  const direct = catalog.planDirect(['direct-a', 'direct-b'], 'direct-b');
  await catalog.write(direct);
  assert.equal((await catalog.inspect(direct.path)).status, 'managed');
  assert.deepEqual(direct.data.models[0].supported_reasoning_levels, []);
});

test('converted routes disable root and legacy active profile search explicitly, and direct return restores only managed fields', async () => {
  const original = 'profile = "active"\nweb_search = "cached"\n[profiles.active]\nweb_search = "live"\nmodel_reasoning_effort = "high"\n[profiles.other]\nweb_search = "live"\n[mcp_servers.before]\ncommand = "before"\n';
  const data = await fixture({ original });
  const preview = await data.service.preview(selection);
  assert.deepEqual(preview.searchPolicy, { webSearch: 'disabled', reason: 'converted-upstream', activeProfile: 'active', affectsActiveProfile: true, externalOverrides: 'not-managed' });
  assert.equal(parse(preview.configPreview).web_search, 'disabled');
  assert.equal(parse(preview.configPreview).profiles.active.web_search, 'disabled');
  assert.ok(preview.changes.some(change => change.includes('--profile')));
  const status = await enable(data);
  assert.equal(status.searchPolicy.webSearch, 'disabled');
  let config = parse(await fs.readFile(data.configPath, 'utf8'));
  assert.equal(config.web_search, 'disabled');
  assert.equal(config.profiles.active.web_search, 'disabled');
  assert.equal(config.profiles.other.web_search, 'live');
  await fs.appendFile(data.configPath, '\n[profiles.newer]\nweb_search = "cached"\n[mcp_servers.newer]\ncommand = "newer"\n[hooks]\nkeep = true\n');
  // Saving twice must retain the first direct values, including after restart.
  data.service = createCodexConfigService(data.options);
  await enable(data);
  await direct(data);
  config = parse(await fs.readFile(data.configPath, 'utf8'));
  assert.equal(config.web_search, 'cached');
  assert.equal(config.profiles.active.web_search, 'live');
  assert.equal(config.profiles.active.model_reasoning_effort, 'high');
  assert.equal(config.profiles.newer.web_search, 'cached');
  assert.equal(config.profiles.other.web_search, 'live');
  assert.equal(config.mcp_servers.newer.command, 'newer');
  assert.equal(config.hooks.keep, true);
});

test('absent root/profile search values are removed on return and only Res selections leave settings intact', async () => {
  const data = await fixture({ original: 'profile = "active"\n[profiles.active]\nmodel_reasoning_effort = "high"\n' });
  await enable(data);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).profiles.active.web_search, 'disabled');
  await direct(data);
  let config = parse(await fs.readFile(data.configPath, 'utf8'));
  assert.equal(config.web_search, undefined);
  assert.equal(config.profiles.active.web_search, undefined);
  await enable(data, { mode: 'gateway', routeIds: ['c'], defaultRouteId: 'c' });
  config = parse(await fs.readFile(data.configPath, 'utf8'));
  assert.equal(config.web_search, undefined);
  assert.equal(config.profiles.active.web_search, undefined);
});

test('search restoration refuses externally edited managed values instead of overwriting newer settings', async () => {
  const data = await fixture({ original: 'web_search = "cached"\n' });
  await enable(data);
  await fs.writeFile(data.configPath, (await fs.readFile(data.configPath, 'utf8')).replace('web_search = "disabled"', 'web_search = "live"'));
  const before = await fs.readFile(data.configPath, 'utf8');
  await assert.rejects(direct(data), { code: 'CODEX_CONFIG_CHANGED' });
  assert.equal(await fs.readFile(data.configPath, 'utf8'), before);
});

test('range or outbound changes during credential validation abort before config and catalog activation', async () => {
  for (const field of ['reasoning', 'outboundProtocol']) {
    let changed = false;
    const data = await fixture({ original: 'model = "before"\n',
      getRoutes: async ids => ({ routes: ids.map(id => ({ ...routes.find(route => route.id === id), ...(changed && id === 'a' ? { [field]: field === 'reasoning' ? { min: 'low', max: 'high' } : 'Res' } : {}) })), baseUrl: 'http://127.0.0.1:4318/v1' }),
      validateKey: async () => { changed = true; } });
    await assert.rejects(enable(data), { code: 'CODEX_ROUTE_UNAVAILABLE' });
    assert.equal(await fs.readFile(data.configPath, 'utf8'), 'model = "before"\n');
  }
});

test('invalid route ranges and unsupported outbound identifiers fail closed before writing', async () => {
  for (const patch of [
    { reasoning: { min: 'high', max: 'medium' } }, { reasoning: { min: 'persistent', max: 'ultra' } },
    { reasoning: { min: 'low', max: 'high', bypass: true } }, { reasoning: null }, { outboundProtocol: 'invalid' },
  ]) {
    const data = await fixture({ getRoutes: async () => ({ routes: [{ id: 'a', model: 'alias', ...patch }], baseUrl: 'http://127.0.0.1:4318/v1' }) });
    await assert.rejects(enable(data, { mode: 'gateway', routeIds: ['a'], defaultRouteId: 'a' }), { code: 'CODEX_ROUTE_UNAVAILABLE' });
    assert.deepEqual(await fs.readdir(data.codexHome), ['config.toml']);
  }
});

test('catalog inspection refuses tampered version-three interval metadata and choices', async () => {
  const data = await fixture();
  await enable(data);
  const config = parse(await fs.readFile(data.configPath, 'utf8'));
  const original = JSON.parse(await fs.readFile(config.model_catalog_json, 'utf8'));
  const catalog = createModelCatalog(new CodexConfigStore({ codexHome: data.codexHome }));
  for (const mutate of [
    value => { value._cxrg.reasoningRanges[0] = { min: 'max', max: 'low' }; },
    value => { value.models[0].supported_reasoning_levels.push({ effort: 'ultra', description: 'ultra' }); },
    value => { delete value._cxrg.reasoningRanges; },
  ]) {
    const value = structuredClone(original);
    mutate(value);
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    const target = path.join(path.dirname(config.model_catalog_json), crypto.createHash('sha256').update(bytes).digest('hex') + '.json');
    await fs.writeFile(target, bytes);
    assert.equal((await catalog.inspect(target)).status, 'invalid');
  }
});

test('legacy embedding routes without outbound metadata retain search and publish old reasoning defaults', async () => {
  const data = await fixture({ original: 'web_search = "live"\n', getRoutes: async () => ({ routes: [{ id: 'a', model: 'legacy' }], baseUrl: 'http://127.0.0.1:4318/v1' }) });
  await enable(data, { mode: 'gateway', routeIds: ['a'], defaultRouteId: 'a' });
  const config = parse(await fs.readFile(data.configPath, 'utf8'));
  assert.equal(config.web_search, 'live');
  const catalog = JSON.parse(await fs.readFile(config.model_catalog_json, 'utf8'));
  assert.equal(catalog.models[0].default_reasoning_level, 'medium');
});

test('clearing converted selection restores search while newer active profile overrides remain untouched', async () => {
  const data = await fixture({ original: 'web_search = "live"\n[profiles.unrelated]\nweb_search = "cached"\n' });
  await enable(data);
  await enable(data, { mode: 'gateway', routeIds: ['c'], defaultRouteId: 'c' });
  const config = parse(await fs.readFile(data.configPath, 'utf8'));
  assert.equal(config.web_search, 'live');
  assert.equal(config.profiles.unrelated.web_search, 'cached');
  await fs.writeFile(data.configPath, (await fs.readFile(data.configPath, 'utf8')).replace('web_search = "live"', 'web_search = "cached"'));
  await direct(data);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'cached');
});

test('search restore survives failed config publication and stale previews cannot overwrite newer search', async () => {
  let failOnce = false;
  const data = await fixture({ original: 'web_search = "cached"\n', fsImpl: { ...fs,
    rename: async (from, to) => {
      if (failOnce && path.basename(to) === 'config.toml') { failOnce = false; throw Object.assign(Error('fixture failure'), { code: 'EACCES' }); }
      return fs.rename(from, to);
    },
  } });
  const preview = await data.service.preview(selection);
  failOnce = true;
  await assert.rejects(data.service.apply({ ...selection, expectedRevision: preview.revision, clientKey: 'cxrg_local_fixture_key' }), { code: 'CODEX_IO_FAILED' });
  assert.equal(await fs.readFile(data.configPath, 'utf8'), 'web_search = "cached"\n');
  data.service = createCodexConfigService(data.options);
  await enable(data);
  const library = await data.service.getDirectProfiles();
  const input = { mode: 'direct', profileId: library.lastDirectProfileId, profilesRevision: library.revision };
  const before = await data.service.preview(input);
  const external = (await fs.readFile(data.configPath, 'utf8')) + '\n[hooks]\nnewer = true\n';
  await fs.writeFile(data.configPath, external);
  await assert.rejects(data.service.apply({ ...input, expectedRevision: before.revision }), { code: 'CODEX_CONFIG_CHANGED' });
  assert.equal(await fs.readFile(data.configPath, 'utf8'), external);
  await direct(data);
  const config = parse(await fs.readFile(data.configPath, 'utf8'));
  assert.equal(config.web_search, 'cached');
  assert.equal(config.hooks.newer, true);
});

test('failed direct restoration keeps its original search values retryable', async () => {
  let failOnce = false;
  const data = await fixture({ original: 'web_search = "cached"\n', fsImpl: { ...fs,
    rename: async (from, to) => {
      if (failOnce && path.basename(to) === 'config.toml') { failOnce = false; throw Object.assign(Error('fixture failure'), { code: 'EACCES' }); }
      return fs.rename(from, to);
    },
  } });
  await enable(data);
  failOnce = true;
  await assert.rejects(direct(data), { code: 'CODEX_IO_FAILED' });
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'disabled');
  data.service = createCodexConfigService(data.options);
  await direct(data);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'cached');
});

test('an external edit after failed direct restoration cannot silently return direct with search still disabled', async () => {
  let failOnce = false;
  const data = await fixture({ original: 'web_search = "cached"\n', fsImpl: { ...fs,
    rename: async (from, to) => {
      if (failOnce && path.basename(to) === 'config.toml') { failOnce = false; throw Object.assign(Error('fixture failure'), { code: 'EACCES' }); }
      return fs.rename(from, to);
    },
  } });
  await enable(data);
  failOnce = true;
  await assert.rejects(direct(data), { code: 'CODEX_IO_FAILED' });
  await fs.appendFile(data.configPath, '\n[hooks]\nexternal = true\n');
  const external = await fs.readFile(data.configPath, 'utf8');
  await assert.rejects(direct(data), { code: 'CODEX_CONFIG_CHANGED' });
  assert.equal(await fs.readFile(data.configPath, 'utf8'), external);
});

test('cleanup failure after committed search restoration preserves newer user edits and never reports a false apply failure', async () => {
  let metadataWrites = 0, restoring = false;
  const data = await fixture({ original: 'web_search = "cached"\n', fsImpl: { ...fs,
    rename: async (from, to) => {
      if (restoring && path.basename(to) === 'profiles.enc' && ++metadataWrites === 3)
        throw Object.assign(Error('cleanup failed'), { code: 'EACCES' });
      return fs.rename(from, to);
    },
  } });
  await enable(data);
  restoring = true;
  await enable(data, { mode: 'gateway', routeIds: ['c'], defaultRouteId: 'c' });
  assert.equal(metadataWrites, 3);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'cached');
  await fs.writeFile(data.configPath, (await fs.readFile(data.configPath, 'utf8')).replace('web_search = "cached"', 'web_search = "live"'));
  await direct(data);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'live');
});

test('backup rollback restores search recovery metadata with the disabled Gateway configuration', async () => {
  for (const exit of ['direct', 'responses']) {
    const data = await fixture({ original: 'web_search = "cached"\nprofile = "active"\n[profiles.active]\nweb_search = "live"\n' });
    await enable(data);
    const exited = exit === 'direct' ? await direct(data) : await enable(data, { mode: 'gateway', routeIds: ['c'], defaultRouteId: 'c' });
    assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'cached');
    const library = await data.service.getDirectProfiles();
    await data.service.saveDirectProfile({ expectedRevision: library.revision, name: 'Newer retained provider', baseUrl: 'https://newer.example.test/v1', models: ['newer'], defaultModel: 'newer', apiKey: 'newer-fixture-key' });
    await data.service.restore({ backupId: exited.backup.id, expectedRevision: exited.revision });
    assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'disabled');
    data.service = createCodexConfigService(data.options);
    await direct(data);
    const returned = parse(await fs.readFile(data.configPath, 'utf8'));
    assert.equal(returned.web_search, 'cached');
    assert.equal(returned.profiles.active.web_search, 'live');
    assert.ok((await data.service.getDirectProfiles()).profiles.some(profile => profile.name === 'Newer retained provider'));
  }
});

test('route changes during catalog publication abort the final config publication', async () => {
  for (const field of ['reasoning', 'outboundProtocol']) {
    let changed = false;
    const original = 'web_search = "cached"\nmodel = "before"\n';
    const data = await fixture({ original,
      getRoutes: async ids => ({ routes: ids.map(id => ({ ...routes.find(route => route.id === id), ...(id === 'c' && changed ? { [field]: field === 'reasoning' ? { min: 'high', max: 'max' } : 'Chat' } : {}) })), baseUrl: 'http://127.0.0.1:4318/v1' }),
      fsImpl: { ...fs, link: async (from, to) => { await fs.link(from, to); if (String(to).includes(path.sep + 'catalogs' + path.sep)) changed = true; } },
    });
    await assert.rejects(enable(data, { mode: 'gateway', routeIds: ['c'], defaultRouteId: 'c' }), { code: 'CODEX_ROUTE_UNAVAILABLE' });
    assert.equal(await fs.readFile(data.configPath, 'utf8'), original);
  }
});

test('a failed later save retains the currently restorable backup search state', async () => {
  let failOnce = false;
  const data = await fixture({ original: 'web_search = "cached"\n', fsImpl: { ...fs,
    rename: async (from, to) => {
      if (failOnce && path.basename(to) === 'config.toml') { failOnce = false; throw Object.assign(Error('fixture failure'), { code: 'EACCES' }); }
      return fs.rename(from, to);
    },
  } });
  await enable(data);
  const exited = await enable(data, { mode: 'gateway', routeIds: ['c'], defaultRouteId: 'c' });
  failOnce = true;
  await assert.rejects(enable(data), { code: 'CODEX_IO_FAILED' });
  const current = await data.service.getStatus();
  assert.equal(current.backup.id, exited.backup.id);
  await data.service.restore({ backupId: current.backup.id, expectedRevision: current.revision });
  await direct(data);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'cached');
});

test('failed backup config restore remains retryable with the matching encrypted search state', async () => {
  let failOnce = false;
  const data = await fixture({ original: 'web_search = "cached"\n', fsImpl: { ...fs,
    rename: async (from, to) => {
      if (failOnce && path.basename(to) === 'config.toml') { failOnce = false; throw Object.assign(Error('fixture failure'), { code: 'EACCES' }); }
      return fs.rename(from, to);
    },
  } });
  await enable(data);
  const exited = await direct(data);
  failOnce = true;
  await assert.rejects(data.service.restore({ backupId: exited.backup.id, expectedRevision: exited.revision }), { code: 'CODEX_IO_FAILED' });
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'cached');
  data.service = createCodexConfigService(data.options);
  await data.service.restore({ backupId: exited.backup.id, expectedRevision: exited.revision });
  await direct(data);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'cached');
});

test('search metadata replacement failure preserves TOML and existing backup recovery', async () => {
  let denyMetadata = false;
  const data = await fixture({ original: 'web_search = "cached"\n', fsImpl: { ...fs,
    rename: async (from, to) => {
      if (denyMetadata && path.basename(to) === 'profiles.enc') throw Object.assign(Error('fixture failure'), { code: 'EACCES' });
      return fs.rename(from, to);
    },
  } });
  await enable(data);
  const exited = await direct(data);
  denyMetadata = true;
  await assert.rejects(data.service.restore({ backupId: exited.backup.id, expectedRevision: exited.revision }), { code: 'CODEX_IO_FAILED' });
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'cached');
  denyMetadata = false;
  await data.service.restore({ backupId: exited.backup.id, expectedRevision: exited.revision });
  await direct(data);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'cached');
});

test('the final route read cannot overwrite a concurrent TOML edit', async () => {
  let routeReads = 0, data;
  const original = 'web_search = "cached"\n';
  const external = original + '\n[hooks]\nexternal = true\n';
  data = await fixture({ original, getRoutes: async ids => {
    if (++routeReads === 4) await fs.writeFile(data.configPath, external);
    return { routes: ids.map(id => structuredClone(routes.find(route => route.id === id))), baseUrl: 'http://127.0.0.1:4318/v1' };
  } });
  await assert.rejects(enable(data), { code: 'CODEX_CONFIG_CHANGED' });
  assert.equal(await fs.readFile(data.configPath, 'utf8'), external);
});

test('refused stale backup restore leaves encrypted search metadata unchanged and newer search usable', async () => {
  const data = await fixture({ original: 'web_search = "cached"\n' });
  await enable(data);
  await enable(data, { mode: 'gateway', routeIds: ['c'], defaultRouteId: 'c' });
  await fs.writeFile(data.configPath, (await fs.readFile(data.configPath, 'utf8')).replace('web_search = "cached"', 'web_search = "live"'));
  const current = await data.service.getStatus();
  const libraryBefore = await fs.readFile(data.options.profilesPath);
  await assert.rejects(data.service.restore({ backupId: current.backup.id, expectedRevision: current.revision }), { code: 'CODEX_CONFIG_CHANGED' });
  assert.deepEqual(await fs.readFile(data.options.profilesPath), libraryBefore);
  await direct(data);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'live');
});

test('external TOML edit after prepared search rollback never activates the uncommitted recovery state', async () => {
  let editAfterMetadata = false, configPath;
  const data = await fixture({ original: 'web_search = "cached"\n', fsImpl: { ...fs,
    rename: async (from, to) => {
      await fs.rename(from, to);
      if (editAfterMetadata && path.basename(to) === 'profiles.enc') {
        editAfterMetadata = false;
        await fs.writeFile(configPath, (await fs.readFile(configPath, 'utf8')).replace('web_search = "cached"', 'web_search = "live"'));
      }
    },
  } });
  configPath = data.configPath;
  await enable(data);
  const exited = await enable(data, { mode: 'gateway', routeIds: ['c'], defaultRouteId: 'c' });
  editAfterMetadata = true;
  await assert.rejects(data.service.restore({ backupId: exited.backup.id, expectedRevision: exited.revision }), { code: 'CODEX_CONFIG_CHANGED' });
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'live');
  data.service = createCodexConfigService(data.options);
  await direct(data);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'live');
});

test('native range vocabulary has seven wire levels and rejects the Ultra UI alias', () => {
  assert.deepEqual(REASONING_LEVELS, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(validReasoningRange({ min: 'none', max: 'ultra' }), false);
  assert.equal(validReasoningRange({ min: 'ultra', max: 'ultra' }), false);
});

test('committed backup rollback remains usable when pending search metadata finalization fails', async () => {
  let restoring = false, metadataWrites = 0;
  const data = await fixture({ original: 'web_search = "cached"\n', fsImpl: { ...fs,
    rename: async (from, to) => {
      if (restoring && path.basename(to) === 'profiles.enc' && ++metadataWrites === 2)
        throw Object.assign(Error('finalization failure'), { code: 'EACCES' });
      return fs.rename(from, to);
    },
  } });
  await enable(data);
  const exited = await direct(data);
  restoring = true;
  await data.service.restore({ backupId: exited.backup.id, expectedRevision: exited.revision });
  assert.equal(metadataWrites, 2);
  assert.equal(parse(await fs.readFile(data.configPath, 'utf8')).web_search, 'disabled');
  restoring = false;
  await fs.appendFile(data.configPath, '\n[hooks]\nnewer = true\n');
  data.service = createCodexConfigService(data.options);
  await direct(data);
  const returned = parse(await fs.readFile(data.configPath, 'utf8'));
  assert.equal(returned.web_search, 'cached');
  assert.equal(returned.hooks.newer, true);
});
