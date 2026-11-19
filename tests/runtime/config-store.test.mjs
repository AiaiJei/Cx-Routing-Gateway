import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';

test('ConfigStore creates a versioned empty configuration and persists updates atomically', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-config-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);
  const initial = await store.read();
  assert.equal(initial.version, 1);
  assert.deepEqual(initial.upstreams, []);
  const updated = await store.update((config) => ({
    ...config,
    upstreams: [{ id: 'up-1', name: 'Local', baseUrl: 'http://127.0.0.1:9999', protocol: 'Chat', enabled: true }],
  }));
  assert.equal(updated.upstreams[0].id, 'up-1');
  const reread = await new ConfigStore(file).read();
  assert.deepEqual(reread, updated);
  await assert.doesNotReject(fs.access(`${file}.bak`));
});

test('ConfigStore tolerates transient file replacement locks without replaying the mutation', async t => {
  await fs.mkdir(path.resolve('.task-evidence'), { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'config-lock-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);
  const initial = await store.read();
  const rename = fs.rename;
  let attempts = 0;
  let mutations = 0;
  t.mock.method(fs, 'rename', async (source, destination) => {
    attempts += 1;
    if (attempts <= 2) throw Object.assign(new Error('Temporary Windows file lock'), { code: attempts === 1 ? 'EPERM' : 'EBUSY' });
    return rename(source, destination);
  });
  await store.update(config => { mutations += 1; config.usage.push({ requestId: 'persist-once' }); return config; });
  assert.deepEqual((await store.read()).usage, [{ requestId: 'persist-once' }]);
  assert.deepEqual(JSON.parse(await fs.readFile(`${file}.bak`, 'utf8')), initial);
  assert.equal(mutations, 1);
  assert.equal(attempts, 3);
});

test('ConfigStore bounds repeated locks and preserves the old config on permanent write failure', async t => {
  await fs.mkdir(path.resolve('.task-evidence'), { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'config-lock-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);
  const initial = await store.read();
  const rename = fs.rename;
  let attempts = 0;
  const renameMock = t.mock.method(fs, 'rename', async () => {
    attempts += 1;
    throw Object.assign(new Error('File remains locked'), { code: 'EPERM' });
  });
  await assert.rejects(store.update(config => ({ ...config, usage: [{ requestId: 'uncommitted' }] })), { code: 'EPERM' });
  assert.equal(attempts, 6);
  assert.deepEqual(await store.read(), initial);
  assert.deepEqual(JSON.parse(await fs.readFile(`${file}.bak`, 'utf8')), initial);
  await assert.rejects(fs.access(`${file}.lock`), { code: 'ENOENT' });
  renameMock.mock.mockImplementation(rename);
  await store.update(config => ({ ...config, usage: [{ requestId: 'recovered' }] }));
  assert.deepEqual((await store.read()).usage, [{ requestId: 'recovered' }]);
});

test('ConfigStore does not retry unrelated rename failures', async t => {
  await fs.mkdir(path.resolve('.task-evidence'), { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'config-lock-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);
  const initial = await store.read();
  let attempts = 0;
  t.mock.method(fs, 'rename', async () => { attempts += 1; throw Object.assign(new Error('Disk I/O failed'), { code: 'EIO' }); });
  await assert.rejects(store.update(config => ({ ...config, usage: [{ requestId: 'uncommitted' }] })), { code: 'EIO' });
  assert.equal(attempts, 1);
  assert.deepEqual(await store.read(), initial);
});
