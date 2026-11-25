import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
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

test('ConfigStore recovers an expired legacy lock during guarded startup recovery', { skip: process.platform !== 'win32' }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-config-stale-lock-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);
  await store.read();
  const lockPath = `${file}.lock`;
  await fs.writeFile(lockPath, '');
  const expiredAt = new Date(Date.now() - (os.uptime() + 120) * 1000);
  await fs.utimes(lockPath, expiredAt, expiredAt);

  assert.equal(await store.recoverStaleLock(), true);
  const updated = await store.update(config => ({ ...config, usage: [{ requestId: 'after-stale-lock' }] }));

  assert.deepEqual(updated.usage, [{ requestId: 'after-stale-lock' }]);
  await assert.rejects(fs.access(lockPath), { code: 'ENOENT' });
});

test('startup recovery preserves legacy locks created during the current boot even when old', async () => {
  await fs.mkdir('.task-evidence', { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'legacy-active-'));
  const file = path.join(dir, 'config.json');
  await fs.writeFile(`${file}.lock`, '');
  const earlierThisBoot = new Date(Date.now() - Math.min(120_000, os.uptime() * 500));
  await fs.utimes(`${file}.lock`, earlierThisBoot, earlierThisBoot);
  assert.equal(await new ConfigStore(file).recoverStaleLock(), false);
  await fs.access(`${file}.lock`);
});

test('startup recovery fails closed on unknown process probe errors and malformed owners', async t => {
  await fs.mkdir('.task-evidence', { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'unknown-lock-'));
  const file = path.join(dir, 'config.json');
  t.mock.method(process, 'kill', () => { throw Object.assign(new Error('Unknown probe error'), { code: 'EIO' }); });
  for (const contents of [JSON.stringify({ pid: 1234 }), '{broken']) {
    await fs.writeFile(`${file}.lock`, contents);
    const old = new Date(Date.now() - (os.uptime() + 120) * 1000);
    await fs.utimes(`${file}.lock`, old, old);
    assert.equal(await new ConfigStore(file).recoverStaleLock(), false);
    assert.equal(await fs.readFile(`${file}.lock`, 'utf8'), contents);
  }
});

test('competing startup recoveries reclaim a dead owner exactly once', { skip: process.platform !== 'win32' }, async t => {
  await fs.mkdir('.task-evidence', { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'competing-recovery-'));
  const file = path.join(dir, 'config.json');
  await fs.writeFile(`${file}.lock`, JSON.stringify({ pid: 1234 }));
  t.mock.method(process, 'kill', () => { throw Object.assign(new Error('Exited'), { code: 'ESRCH' }); });
  const results = await Promise.all(Array.from({ length: 8 }, () => new ConfigStore(file).recoverStaleLock()));
  assert.equal(results.filter(Boolean).length, 1);
});

test('separate processes serialize config initialization and updates without lost writes', async () => {
  await fs.mkdir('.task-evidence', { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'process-writers-'));
  const file = path.join(dir, 'config.json');
  const moduleUrl = new URL('../../packages/shared/src/config-store.mjs', import.meta.url).href;
  const script = `import { ConfigStore } from ${JSON.stringify(moduleUrl)};
    const store = new ConfigStore(process.argv[1]);
    await store.read();
    for (let i=0; i<20; i++) await store.update(async config => {
      await new Promise(resolve => setTimeout(resolve, 2));
      config.usage.push({requestId: process.pid + ':' + i}); return config;
    });`;
  const codes = await Promise.all([1, 2].map(async () => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, file], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let errors = ''; child.stderr.on('data', data => { errors += data; });
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, errors);
    return code;
  }));
  assert.deepEqual(codes, [0, 0]);
  assert.equal((await new ConfigStore(file).read()).usage.length, 40);
});

test('an exited process releases its mutex and its PID lock can be recovered', { skip: process.platform !== 'win32' }, async t => {
  await fs.mkdir('.task-evidence', { recursive: true });
  const dir = await fs.mkdtemp(path.resolve('.task-evidence', 'crashed-writer-'));
  const file = path.join(dir, 'config.json');
  const moduleUrl = new URL('../../packages/shared/src/config-store.mjs', import.meta.url).href;
  const script = `import { ConfigStore } from ${JSON.stringify(moduleUrl)};
    await new ConfigStore(process.argv[1]).acquireLock(); process.send('locked'); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, file], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  await once(child, 'message');
  const store = new ConfigStore(file);
  assert.equal(await store.recoverStaleLock(), false);
  const exited = once(child, 'exit'); child.kill(); await exited;
  assert.equal(await store.recoverStaleLock(), true);
  const release = await store.acquireLock();
  await release(); await release();
  const secondRelease = await store.acquireLock();
  await release();
  await fs.access(`${file}.lock`);
  await secondRelease();
});

test('ConfigStore preserves an old lock owned by a live process during startup recovery', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-config-live-lock-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);
  await store.read();
  const release = await store.acquireLock();
  const lockPath = `${file}.lock`;
  const expiredAt = new Date(Date.now() - 120_000);
  await fs.utimes(lockPath, expiredAt, expiredAt);

  try {
    assert.equal(await store.recoverStaleLock(), false);
    await assert.doesNotReject(fs.access(lockPath));
  } finally {
    await release();
  }
});

test('ConfigStore does not reclaim an old lock owned by a live process', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-config-live-lock-'));
  const file = path.join(dir, 'config.json');
  const store = new ConfigStore(file);
  await store.read();
  let markStarted;
  let releaseMutation;
  const started = new Promise(resolve => { markStarted = resolve; });
  const hold = new Promise(resolve => { releaseMutation = resolve; });
  const currentUpdate = store.update(async config => {
    markStarted();
    await hold;
    return { ...config, usage: [{ requestId: 'active-lock' }] };
  });
  await started;
  const lockPath = `${file}.lock`;
  const expiredAt = new Date(Date.now() - 120_000);
  await fs.utimes(lockPath, expiredAt, expiredAt);

  const competingUpdate = new ConfigStore(file).update(config => ({ ...config, usage: [{ requestId: 'competing-lock' }] }));
  try {
    await assert.rejects(competingUpdate, /Configuration store is busy/);
  } finally {
    releaseMutation();
  }
  await currentUpdate;
  assert.deepEqual((await store.read()).usage, [{ requestId: 'active-lock' }]);
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
