import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCodexConfigService } = require('../../apps/desktop/electron/codex-config-service.cjs');
const fixtureRoot = path.resolve('.tmp/codex-route-management-20261125');
const key = 'cxrg_test_key_for_local_config_only';
const route = { model: 'coding-model', baseUrl: 'http://127.0.0.1:4318/v1' };

async function fixture({ original, fsImpl = fs, getRoute = async () => route, validateKey = async () => {} } = {}) {
  await fs.mkdir(fixtureRoot, { recursive: true });
  const codexHome = await fs.mkdtemp(path.join(fixtureRoot, 'config-'));
  const configPath = path.join(codexHome, 'config.toml');
  if (original !== undefined) await fs.writeFile(configPath, original);
  const service = createCodexConfigService({ codexHome, fsImpl, getRoute, validateKey });
  return { service, codexHome, configPath };
}

async function apply(service, extra = {}) {
  const preview = await service.preview({ routeId: 'route-1', ...extra });
  return service.apply({ routeId: 'route-1', clientKey: key, expectedRevision: preview.revision, ...extra });
}

test('Codex status and preview never initialize files or expose existing credentials', async () => {
  const { service, codexHome } = await fixture();
  const status = await service.getStatus();
  assert.equal(status.exists, false);
  assert.equal(status.configured, false);
  assert.equal(status.credentialConfigured, false);
  const preview = await service.preview({ routeId: 'route-1' });
  assert.equal(preview.model, 'coding-model');
  assert.equal(preview.revision, status.revision);
  assert.match(preview.configPreview, /experimental_bearer_token = "<Gateway client Key>"/);
  assert.deepEqual(await fs.readdir(codexHome), []);
});

test('Codex apply preserves unrelated TOML semantics, replaces only managed provider auth and restores exact bytes after restart', async () => {
  const original = '# original comment\r\nmodel = "old-model"\r\nmodel_provider = "other"\r\nmodel_reasoning_effort = "high"\r\n[model_providers.other]\r\nname = "Other"\r\nbase_url = "https://example.test/v1"\r\n[model_providers.cx_routing_gateway]\r\nenv_key = "OLD_KEY"\r\nexperimental_bearer_token = "previous-secret"\r\n[model_providers.cx_routing_gateway.http_headers]\r\nAuthorization = "Bearer previous-secret"\r\nX-Trace = "keep"\r\n[mcp_servers.example]\r\ncommand = "node"\r\nargs = ["example.mjs"]\r\n[projects."C:\\\\work"]\r\ntrust_level = "trusted"\r\n';
  const { service, configPath, codexHome } = await fixture({ original });
  const status = await apply(service);
  const { parse } = require('../../apps/desktop/node_modules/smol-toml');
  const config = parse(await fs.readFile(configPath, 'utf8'));
  assert.equal(config.model, 'coding-model');
  assert.equal(config.model_provider, 'cx_routing_gateway');
  assert.equal(config.model_reasoning_effort, 'high');
  assert.equal(config.model_providers.other.base_url, 'https://example.test/v1');
  assert.deepEqual(config.mcp_servers.example.args, ['example.mjs']);
  assert.equal(Object.values(config.projects)[0].trust_level, 'trusted');
  assert.equal(config.model_providers.cx_routing_gateway.experimental_bearer_token, key);
  assert.equal(config.model_providers.cx_routing_gateway.env_key, undefined);
  assert.equal(config.model_providers.cx_routing_gateway.http_headers.Authorization, undefined);
  assert.equal(config.model_providers.cx_routing_gateway.http_headers['X-Trace'], 'keep');
  assert.equal(config.model_providers.cx_routing_gateway.wire_api, 'responses');
  assert.equal(config.model_providers.cx_routing_gateway.supports_websockets, false);
  assert.equal(status.configured, true);
  assert.equal(status.credentialConfigured, true);
  assert.ok(status.backup.id);
  assert.ok(!JSON.stringify(status).includes(key));
  assert.ok(!JSON.stringify(await service.preview({ routeId: 'route-1' })).includes(key));
  assert.ok(!JSON.stringify(status).includes('previous-secret'));
  const restarted = createCodexConfigService({ codexHome, getRoute: async () => route, validateKey: async () => {} });
  const restored = await restarted.restore({ backupId: status.backup.id, expectedRevision: status.revision });
  assert.equal(await fs.readFile(configPath, 'utf8'), original);
  assert.equal(restored.configured, false);
  assert.equal(restored.backup, undefined);
});

test('Codex apply can select a reasoning effort and missing-original restore removes only the generated config', async () => {
  const { service, configPath, codexHome } = await fixture();
  await fs.writeFile(path.join(codexHome, 'auth.json'), 'do-not-touch');
  const status = await apply(service, { reasoningEffort: 'xhigh' });
  assert.equal(status.reasoningEffort, 'xhigh');
  const restored = await service.restore({ backupId: status.backup.id, expectedRevision: status.revision });
  assert.equal(restored.exists, false);
  await assert.rejects(fs.readFile(configPath), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(codexHome, 'auth.json'), 'utf8'), 'do-not-touch');
});

test('Codex apply rejects stale preview and leaves externally changed content intact', async () => {
  const { service, configPath } = await fixture({ original: 'model = "before"\n' });
  const preview = await service.preview({ routeId: 'route-1' });
  await fs.writeFile(configPath, 'model = "external"\n');
  await assert.rejects(service.apply({ routeId: 'route-1', clientKey: key, expectedRevision: preview.revision }), { code: 'CODEX_CONFIG_CHANGED' });
  assert.equal(await fs.readFile(configPath, 'utf8'), 'model = "external"\n');
});

test('Codex restore rejects external changes and tampered backups', async () => {
  const { service, configPath, codexHome } = await fixture({ original: 'model = "before"\n' });
  const status = await apply(service);
  const backupPath = path.join(codexHome, '.cx-routing-gateway', 'backups', `${status.backup.id}.json`);
  const before = await fs.readFile(configPath, 'utf8');
  await fs.writeFile(configPath, before + '# external\n');
  await assert.rejects(service.restore({ backupId: status.backup.id, expectedRevision: status.revision }), { code: 'CODEX_CONFIG_CHANGED' });
  await fs.writeFile(configPath, before);
  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  backup.original = Buffer.from('model = "tampered"\n').toString('base64');
  await fs.writeFile(backupPath, JSON.stringify(backup));
  await assert.rejects(service.restore({ backupId: status.backup.id, expectedRevision: status.revision }), { code: 'CODEX_BACKUP_INVALID' });
  assert.equal(await fs.readFile(configPath, 'utf8'), before);
});

test('Codex malformed and oversized config failures do not expose source or overwrite files', async () => {
  for (const original of ['model = "private-secret\n', '#'.repeat(1024 * 1024 + 1)]) {
    const { service, configPath } = await fixture({ original });
    await assert.rejects(service.preview({ routeId: 'route-1' }), error => {
      assert.ok(['CODEX_CONFIG_INVALID', 'CODEX_CONFIG_TOO_LARGE'].includes(error.code));
      assert.ok(!error.message.includes('private-secret'));
      return true;
    });
    assert.equal(await fs.readFile(configPath, 'utf8'), original);
  }
});

test('Codex validation and key failures happen before any config or backup write', async () => {
  const { service, codexHome } = await fixture({ validateKey: async () => { throw new Error('provider-secret'); } });
  for (const input of [{ routeId: '' }, { routeId: 'route-1', reasoningEffort: 'bad' }, { routeId: 'route-1', clientKey: '\nsecret', expectedRevision: 'missing' }]) {
    await assert.rejects(service.apply(input), { code: 'CODEX_INPUT_INVALID' });
  }
  await assert.rejects(apply(service), error => error.code === 'CODEX_KEY_REJECTED' && !error.message.includes('provider-secret'));
  assert.deepEqual(await fs.readdir(codexHome), []);
});

test('Codex route is revalidated at apply and disabled routes cannot change config', async () => {
  let enabled = true;
  const { service, configPath } = await fixture({ original: 'model = "before"\n', getRoute: async () => { if (!enabled) throw Object.assign(new Error('disabled'), { code: 'CODEX_ROUTE_UNAVAILABLE' }); return route; } });
  const preview = await service.preview({ routeId: 'route-1' });
  enabled = false;
  await assert.rejects(service.apply({ routeId: 'route-1', clientKey: key, expectedRevision: preview.revision }), { code: 'CODEX_ROUTE_UNAVAILABLE' });
  assert.equal(await fs.readFile(configPath, 'utf8'), 'model = "before"\n');
});

test('Codex concurrent applies from separate service instances serialize and only one stale revision wins', async () => {
  const { service, codexHome } = await fixture({ original: 'model = "before"\n' });
  const other = createCodexConfigService({ codexHome, getRoute: async () => route, validateKey: async () => {} });
  const preview = await service.preview({ routeId: 'route-1' });
  const results = await Promise.allSettled([service, other].map(item => item.apply({ routeId: 'route-1', clientKey: key, expectedRevision: preview.revision })));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.code, 'CODEX_CONFIG_CHANGED');
});

test('Codex backup preparation failure leaves config intact and errors sanitized', async () => {
  const fsImpl = { ...fs, open: async (filePath, ...args) => { if (String(filePath).endsWith('.json') && String(filePath).includes('backups')) throw new Error('sensitive-content'); return fs.open(filePath, ...args); } };
  const { service, configPath } = await fixture({ original: 'model = "before"\n', fsImpl });
  await assert.rejects(apply(service), error => error.code === 'CODEX_IO_FAILED' && !error.message.includes('sensitive-content'));
  assert.equal(await fs.readFile(configPath, 'utf8'), 'model = "before"\n');
});

test('Codex failed config replacement preserves the previous recovery record across restart', async () => {
  const { service, configPath, codexHome } = await fixture({ original: 'model = "before"\n' });
  const first = await apply(service);
  const before = await fs.readFile(configPath, 'utf8');
  const fsImpl = { ...fs, rename: async (source, target) => { if (target === configPath) throw new Error('secret failure'); return fs.rename(source, target); } };
  const failing = createCodexConfigService({ codexHome, fsImpl, getRoute: async () => ({ ...route, model: 'another-model' }), validateKey: async () => {} });
  await assert.rejects(apply(failing), { code: 'CODEX_IO_FAILED' });
  assert.equal(await fs.readFile(configPath, 'utf8'), before);
  const restarted = createCodexConfigService({ codexHome, getRoute: async () => route, validateKey: async () => {} });
  const status = await restarted.getStatus();
  assert.equal(status.backup.id, first.backup.id);
  await restarted.restore({ backupId: status.backup.id, expectedRevision: status.revision });
  assert.equal(await fs.readFile(configPath, 'utf8'), 'model = "before"\n');
});

test('Codex failed restore replacement keeps the applied file and retryable backup', async () => {
  const { service, configPath, codexHome } = await fixture({ original: 'model = "before"\n' });
  const applied = await apply(service);
  const fsImpl = { ...fs, rename: async (source, target) => { if (target === configPath) throw new Error('secret failure'); return fs.rename(source, target); } };
  const failing = createCodexConfigService({ codexHome, fsImpl, getRoute: async () => route, validateKey: async () => {} });
  await assert.rejects(failing.restore({ backupId: applied.backup.id, expectedRevision: applied.revision }), { code: 'CODEX_IO_FAILED' });
  const status = await service.getStatus();
  assert.equal(status.backup.id, applied.backup.id);
  await service.restore({ backupId: status.backup.id, expectedRevision: status.revision });
  assert.equal(await fs.readFile(configPath, 'utf8'), 'model = "before"\n');
});

test('Codex apply catches edits made during backup preparation before replacing config', async () => {
  let configPath;
  let edited = false;
  const fsImpl = { ...fs, rename: async (source, target) => { const result = await fs.rename(source, target); if (String(target).endsWith('state.json') && !edited) { edited = true; await fs.writeFile(configPath, 'model = "external-during-prepare"\n'); } return result; } };
  const data = await fixture({ original: 'model = "before"\n', fsImpl });
  configPath = data.configPath;
  await assert.rejects(apply(data.service), { code: 'CODEX_CONFIG_CHANGED' });
  assert.equal(await fs.readFile(configPath, 'utf8'), 'model = "external-during-prepare"\n');
});

test('Codex rejects symlink config and backup directories without following them', async t => {
  const { service, configPath, codexHome } = await fixture();
  const outside = path.join(codexHome, 'outside.toml');
  await fs.writeFile(outside, 'model = "outside"\n');
  try { await fs.symlink(outside, configPath, 'file'); } catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('Host does not allow file symlink creation'); throw error; }
  await assert.rejects(service.preview({ routeId: 'route-1' }), { code: 'CODEX_PATH_UNSAFE' });
  assert.equal(await fs.readFile(outside, 'utf8'), 'model = "outside"\n');
  const second = await fixture();
  const externalDir = path.join(second.codexHome, 'external');
  await fs.mkdir(externalDir);
  await fs.symlink(externalDir, path.join(second.codexHome, '.cx-routing-gateway'), 'junction');
  await assert.rejects(apply(second.service), { code: 'CODEX_PATH_UNSAFE' });
  assert.deepEqual(await fs.readdir(externalDir), []);
});

test('Codex committed apply and restore do not become failures when a following status read is unavailable', async () => {
  let configPath;
  let failReads = false;
  const fsImpl = { ...fs,
    rename: async (source, target) => { const result = await fs.rename(source, target); if (target === configPath) failReads = true; return result; },
    open: async (target, ...args) => { if (failReads && target === configPath) throw new Error('sensitive-scanner-error'); return fs.open(target, ...args); },
  };
  const data = await fixture({ original: 'model = "before"\n', fsImpl });
  configPath = data.configPath;
  const applied = await apply(data.service);
  assert.equal(applied.configured, true);
  assert.match(await fs.readFile(configPath, 'utf8'), /coding-model/);
  failReads = false;
  const restored = await data.service.restore({ backupId: applied.backup.id, expectedRevision: applied.revision });
  assert.equal(restored.configured, false);
  assert.equal(await fs.readFile(configPath, 'utf8'), 'model = "before"\n');
});

test('Codex status hides unrelated or credential-bearing provider URLs and preview identifies a managed-name collision', async () => {
  const { service } = await fixture({ original: 'model = "old"\nmodel_provider = "cx_routing_gateway"\n[model_providers.cx_routing_gateway]\nname = "Some other service"\nbase_url = "http://user:secret@127.0.0.1:4318/v1?key=private"\nexperimental_bearer_token = "another-private-key"\n' });
  const status = await service.getStatus();
  assert.equal(status.baseUrl, undefined);
  assert.equal(status.configured, false);
  assert.ok(!JSON.stringify(status).includes('secret'));
  assert.ok(!JSON.stringify(status).includes('private'));
  const preview = await service.preview({ routeId: 'route-1' });
  assert.equal(preview.replacesCurrentProvider, true);
  assert.ok(!JSON.stringify(preview).includes('another-private-key'));
});

test('Codex rejects nonregular config, unknown renderer paths and gateway endpoints outside loopback', async () => {
  const directory = await fixture();
  await fs.mkdir(directory.configPath);
  await assert.rejects(directory.service.getStatus(), { code: 'CODEX_PATH_UNSAFE' });
  const normal = await fixture();
  await assert.rejects(normal.service.preview({ routeId: 'route-1', configPath: 'other-file' }), { code: 'CODEX_INPUT_INVALID' });
  await assert.rejects(normal.service.restore({ backupId: '../other-file', expectedRevision: 'missing' }), { code: 'CODEX_INPUT_INVALID' });
  const remote = await fixture({ getRoute: async () => ({ model: 'coding-model', baseUrl: 'https://remote.example/v1' }) });
  await assert.rejects(remote.service.preview({ routeId: 'route-1' }), { code: 'CODEX_ROUTE_UNAVAILABLE' });
});

test('Codex successful rename is not reported failed by temporary cleanup after commit', async () => {
  const fsImpl = { ...fs, unlink: async (filePath) => { if (String(filePath).endsWith('.tmp')) throw new Error('scanner-denied-cleanup'); return fs.unlink(filePath); } };
  const { service, configPath } = await fixture({ fsImpl });
  const status = await apply(service);
  assert.equal(status.configured, true);
  assert.match(await fs.readFile(configPath, 'utf8'), /coding-model/);
});
