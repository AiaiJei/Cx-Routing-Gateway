import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCodexClientManager, discoverCodexExecutable } = require('../../apps/desktop/electron/codex-client-manager.cjs');

test('missing official CLI returns an honest unavailable status without starting a process', async () => {
  assert.equal(typeof createCodexClientManager, 'function');
  const manager = createCodexClientManager({
    codexHome: path.resolve('.tmp/codex-modes-models-20261125/client-home'),
    resolveExecutable: async () => undefined,
    spawnImpl() { assert.fail('unavailable CLI must not spawn'); },
    getConfigStatus: async () => ({ mode: 'direct', direct: { kind: 'official' }, revision: 'missing' }),
  });
  assert.deepEqual(await manager.getStatus(), { available: false, auth: 'unknown', login: 'idle' });
  manager.dispose();
});

const codexHome = path.resolve('.tmp/codex-direct-management-20261126/client-home');
const executable = path.resolve('.tmp/codex-direct-management-20261126/bin/codex.exe');
const flush = async () => { for (let index = 0; index < 24; index++) await Promise.resolve(); };
function fakeSpawn({ status = { text: 'Not logged in\n', code: 1 }, version = { text: 'codex-cli 0.167.0\n', code: 0 }, login } = {}) {
  const calls = [];
  function spawn(file, args, options) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kills = [];
    child.kill = signal => { child.kills.push(signal); queueMicrotask(() => child.emit('close', null, signal)); return true; };
    calls.push({ file, args, options, child });
    const reply = args[0] === '--version' ? version : args.length === 2 ? status : login;
    queueMicrotask(() => {
      if (reply?.throwError) { child.emit('error', new Error('private-process-secret')); return; }
      child.emit('spawn');
      if (!reply) return;
      if (reply.text) (reply.stderr ? child.stderr : child.stdout).write(reply.text);
      child.emit('close', reply.code ?? 0, null);
    });
    return child;
  }
  return { spawn, calls };
}
function setup(t, responses, overrides = {}) {
  const fake = fakeSpawn(responses);
  const manager = createCodexClientManager({ codexHome, resolveExecutable: async () => executable, spawnImpl: fake.spawn, getConfigStatus: async () => ({ mode: 'direct', direct: { kind: 'official' }, revision: 'missing' }), ...overrides });
  t.after(() => manager.dispose());
  return { manager, ...fake };
}

test('CLI status classification exposes only enums and parsed version, never raw personal or credential output', async t => {
  for (const fixture of [
    { text: 'Logged in using ChatGPT\nuser@example.test\nhttps://secret.test/login\n', code: 0, auth: 'chatgpt' },
    { text: 'Logged in using an API key - sk-private-value\n', code: 0, auth: 'api', stderr: true },
    { text: 'Not logged in\n', code: 1, auth: 'signed_out', stderr: true },
    { text: 'sk-private-value https://secret.test/login', code: 0, auth: 'unknown' },
    { text: 'Logged in using ChatGPT\n', code: 2, auth: 'unknown' },
  ]) {
    const { manager, calls } = setup(t, { status: fixture });
    assert.deepEqual(await manager.getStatus(), { available: true, version: '0.167.0', auth: fixture.auth, login: 'idle' });
    assert.deepEqual(calls.map(call => call.args), [['--version'], ['login', 'status']]);
    for (const call of calls) {
      assert.equal(call.file, executable);
      assert.equal(call.options.shell, false);
      assert.equal(call.options.windowsHide, true);
      assert.equal(call.options.env.CODEX_HOME, codexHome);
      assert.equal(call.options.cwd, path.dirname(executable));
      assert.deepEqual(call.options.stdio, ['ignore', 'pipe', 'pipe']);
    }
  }
});

test('malformed version, resolver errors and unsafe executable names cannot expose output or run a shell', async t => {
  const { manager } = setup(t, { version: { text: 'codex-cli sk-private-value', code: 0 } });
  assert.deepEqual(await manager.getStatus(), { available: true, auth: 'signed_out', login: 'idle' });
  for (const candidate of ['codex', 'codex.cmd', path.resolve('codex.cmd'), executable + '\0', undefined]) {
    const { manager: unavailable, calls } = setup(t, {}, { resolveExecutable: async () => candidate });
    assert.deepEqual(await unavailable.getStatus(), { available: false, auth: 'unknown', login: 'idle' });
    assert.equal(calls.length, 0);
  }
  const { manager: broken } = setup(t, {}, { resolveExecutable: async () => { throw new Error('private-path'); } });
  assert.deepEqual(await broken.getStatus(), { available: false, auth: 'unknown', login: 'idle' });
});

test('a unique exact CLI version line survives warning prefixes without exposing raw warning contents', async t => {
  for (const text of [
    'WARNING: proceeding, even though we could not update PATH: private detail\ncodex-cli 0.167.0\n',
    'private warning\r\ncodex-cli 0.167.0-alpha.1\r\nprivate suffix\r\n',
  ]) {
    const { manager } = setup(t, { version: { text, code: 0 } });
    const status = await manager.getStatus();
    assert.equal(status.version, text.includes('alpha') ? '0.167.0-alpha.1' : '0.167.0');
    assert.equal(status.available, true);
    assert.ok(!JSON.stringify(status).includes('private'));
  }
});

test('ambiguous, embedded or nonzero-exit version output stays unknown', async t => {
  for (const fixture of [
    { text: 'codex-cli 0.167.0\ncodex-cli 0.168.0\n', code: 0 },
    { text: 'codex-cli 0.167.0\ncodex-cli 0.167.0\n', code: 0 },
    { text: 'WARNING: codex-cli 0.167.0 private\n', code: 0 },
    { text: 'codex-cli 0.167.0 private\n', code: 0 },
    { text: 'codex-cli 0.167.0\n', code: 1 },
  ]) {
    const { manager } = setup(t, { version: fixture });
    assert.deepEqual(await manager.getStatus(), { available: true, auth: 'signed_out', login: 'idle' });
  }
});

test('oversized and failed status processes return unknown without leaking collected bytes', async t => {
  const { manager, calls } = setup(t, { status: { text: 'Logged in using ChatGPT\n' + 'private'.repeat(10000), code: 0 } });
  assert.deepEqual(await manager.getStatus(), { available: true, version: '0.167.0', auth: 'unknown', login: 'idle' });
  assert.ok(calls.find(call => call.args.length === 2).child.kills.length > 0);
  const { manager: error } = setup(t, { status: { throwError: true } });
  assert.equal((await error.getStatus()).auth, 'unknown');
});

test('hung status commands are bounded and dispose ends only the owned probes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { manager, calls } = setup(t, { status: null, version: null });
  const status = manager.getStatus();
  await flush();
  t.mock.timers.tick(60_000);
  await flush();
  t.mock.timers.tick(60_000);
  assert.deepEqual(await status, { available: true, auth: 'unknown', login: 'idle' });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.child.kills.length > 0));
  const waiting = manager.getStatus();
  await flush();
  manager.dispose();
  assert.deepEqual(await waiting, { available: false, auth: 'unknown', login: 'idle' });
  assert.ok(calls.slice(2).every(call => call.child.kills.length > 0));
  await assert.rejects(manager.getStatus(), { code: 'CODEX_CLIENT_DISPOSED' });
});

test('executable discovery prefers official installation and only searches bounded absolute PATH exe files', async t => {
  assert.equal(typeof discoverCodexExecutable, 'function');
  const root = path.resolve('.tmp/codex-direct-management-20261126');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'cli-discovery-'));
  const bin = path.join(directory, 'path-bin');
  await fs.mkdir(bin);
  const pathExe = path.join(bin, 'codex.exe');
  await fs.writeFile(pathExe, 'fake-executable-never-run');
  const official = path.join(directory, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
  await fs.mkdir(path.dirname(official), { recursive: true });
  await fs.writeFile(official, 'fake-executable-never-run');
  assert.equal(await discoverCodexExecutable({ env: { LOCALAPPDATA: directory, PATH: bin } }), official);
  assert.equal(await discoverCodexExecutable({ env: { PATH: 'relative' + path.delimiter + '"' + bin + '"' } }), pathExe);
  assert.equal(await discoverCodexExecutable({ env: { PATH: 'relative' + path.delimiter + '.' } }), undefined);
  assert.equal(await discoverCodexExecutable({ env: { PATH: 'x'.repeat(32769) + path.delimiter + bin } }), undefined);
  assert.equal(await discoverCodexExecutable({ env: { PATH: Array(65).fill(path.join(directory, 'missing')).concat(bin).join(path.delimiter) } }), undefined);
  await fs.mkdir(path.join(directory, 'cmd-only'));
  await fs.writeFile(path.join(directory, 'cmd-only', 'codex.cmd'), '@echo private');
  assert.equal(await discoverCodexExecutable({ env: { PATH: path.join(directory, 'cmd-only') } }), undefined);
});

test('browser login requires the exact saved official configuration and bounded input before it may spawn', async t => {
  for (const fixture of [
    { input: {}, code: 'CODEX_INPUT_INVALID' },
    { input: { expectedRevision: 'wrong' }, code: 'CODEX_INPUT_INVALID' },
    { input: { expectedRevision: 'missing', executable }, code: 'CODEX_INPUT_INVALID' },
    { input: { expectedRevision: 'missing' }, mode: 'gateway', code: 'CODEX_LOGIN_MODE_REQUIRED' },
    { input: { expectedRevision: 'missing' }, mode: 'unknown', code: 'CODEX_LOGIN_MODE_REQUIRED' },
    { input: { expectedRevision: 'missing' }, mode: 'direct', kind: 'custom', code: 'CODEX_LOGIN_MODE_REQUIRED' },
    { input: { expectedRevision: 'missing' }, mode: 'direct', kind: 'snapshot', code: 'CODEX_LOGIN_MODE_REQUIRED' },
    { input: { expectedRevision: 'missing' }, mode: 'direct', kind: null, code: 'CODEX_LOGIN_MODE_REQUIRED' },
    { input: { expectedRevision: 'a'.repeat(64) }, code: 'CODEX_CONFIG_CHANGED' },
  ]) {
    const { manager, calls } = setup(t, {}, { getConfigStatus: async () => ({ mode: fixture.mode || 'direct', direct: fixture.kind === null ? undefined : { kind: fixture.kind || 'official' }, revision: 'missing' }) });
    assert.equal(typeof manager.startLogin, 'function');
    await assert.rejects(manager.startLogin(fixture.input), { code: fixture.code });
    assert.equal(calls.length, 0);
  }
  const { manager, calls } = setup(t, {}, { resolveExecutable: async () => undefined });
  await assert.rejects(manager.startLogin({ expectedRevision: 'missing' }), { code: 'CODEX_CLI_NOT_FOUND' });
  assert.equal(calls.length, 0);
});

test('login rechecks saved configuration after asynchronous discovery and cannot launch after a changed mode', async t => {
  let config = { mode: 'direct', direct: { kind: 'official' }, revision: 'missing' };
  const { manager, calls } = setup(t, {}, {
    resolveExecutable: async () => { config = { mode: 'gateway', revision: 'b'.repeat(64) }; return executable; },
    getConfigStatus: async () => config,
  });
  await assert.rejects(manager.startLogin({ expectedRevision: 'missing' }), { code: 'CODEX_CONFIG_CHANGED' });
  assert.equal(calls.length, 0);
});

test('login rechecks direct kind before launch even if a stale config adapter reused the revision', async t => {
  let config = { mode: 'direct', direct: { kind: 'official' }, revision: 'missing' };
  const { manager, calls } = setup(t, {}, {
    resolveExecutable: async () => { config = { mode: 'direct', direct: { kind: 'custom' }, revision: 'missing' }; return executable; },
    getConfigStatus: async () => config,
  });
  await assert.rejects(manager.startLogin({ expectedRevision: 'missing' }), { code: 'CODEX_LOGIN_MODE_REQUIRED' });
  assert.equal(calls.length, 0);
});

test('confirmed login starts only the official browser flow in the fixed home and gates duplicate requests', async t => {
  const { manager, calls } = setup(t);
  assert.equal(manager.getLoginState(), 'idle');
  assert.equal(calls.length, 0);
  assert.deepEqual(await manager.startLogin({ expectedRevision: 'missing' }), { available: true, auth: 'unknown', login: 'pending' });
  assert.equal(manager.getLoginState(), 'pending');
  await assert.rejects(manager.startLogin({ expectedRevision: 'missing' }), { code: 'CODEX_LOGIN_PENDING' });
  assert.equal((await manager.getStatus()).login, 'pending');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['login']);
  assert.equal(calls[0].file, executable);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.env.CODEX_HOME, codexHome);
  assert.deepEqual(calls[0].options.stdio, ['ignore', 'ignore', 'ignore']);
  assert.deepEqual(await manager.cancelLogin(), { available: true, auth: 'unknown', login: 'idle' });
  assert.equal(manager.getLoginState(), 'idle');
  assert.ok(calls[0].child.kills.length > 0);
  calls[0].child.emit('close', 0);
  assert.equal((await manager.getStatus()).login, 'idle');
});

test('a successful CLI exit records completion but account state is independently classified on refresh', async t => {
  const { manager, calls } = setup(t, { status: { text: 'Logged in using ChatGPT\nuser@example.test\n', code: 0 } });
  await manager.startLogin({ expectedRevision: 'missing' });
  calls[0].child.emit('close', 0);
  assert.deepEqual(await manager.getStatus(), { available: true, version: '0.167.0', auth: 'chatgpt', login: 'succeeded' });
  const { manager: noAccount, calls: noAccountCalls } = setup(t);
  await noAccount.startLogin({ expectedRevision: 'missing' });
  noAccountCalls[0].child.emit('close', 0);
  assert.equal((await noAccount.getStatus()).auth, 'signed_out');
});

test('failed login and failed spawn return safe failure states without raw login URLs or tokens', async t => {
  const { manager, calls } = setup(t);
  await manager.startLogin({ expectedRevision: 'missing' });
  calls[0].child.stdout.write('https://private.test/login?token=private-value');
  calls[0].child.emit('close', 1);
  assert.deepEqual(await manager.getStatus(), { available: true, version: '0.167.0', auth: 'signed_out', login: 'failed' });
  const { manager: broken } = setup(t, { login: { throwError: true } });
  await assert.rejects(broken.startLogin({ expectedRevision: 'missing' }), error => error.code === 'CODEX_LOGIN_FAILED' && !error.message.includes('private-process-secret'));
  assert.equal((await broken.getStatus()).login, 'failed');
});

test('login has a bounded lifetime and cancellation or disposal cannot leave an owned login active', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { manager, calls } = setup(t);
  await manager.startLogin({ expectedRevision: 'missing' });
  t.mock.timers.tick(10 * 60_000);
  await flush();
  assert.equal((await manager.getStatus()).login, 'failed');
  assert.ok(calls[0].child.kills.length > 0);
  await manager.startLogin({ expectedRevision: 'missing' });
  const lastChild = calls.at(-1).child;
  manager.dispose();
  assert.ok(lastChild.kills.length > 0);
  await assert.rejects(manager.startLogin({ expectedRevision: 'missing' }), { code: 'CODEX_CLIENT_DISPOSED' });
  manager.dispose();
});

test('cancel during login preflight blocks its delayed spawn and a second request cannot overtake it', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { manager, calls } = setup(t, {}, { resolveExecutable: async () => { await gate; return executable; } });
  const login = manager.startLogin({ expectedRevision: 'missing' });
  await flush();
  await assert.rejects(manager.startLogin({ expectedRevision: 'missing' }), { code: 'CODEX_LOGIN_PENDING' });
  assert.equal((await manager.cancelLogin()).login, 'idle');
  release();
  assert.equal((await login).login, 'idle');
  assert.equal(calls.length, 0);
});

test('unlaunchable CLI is unavailable while all native launch errors stay private', async t => {
  const { manager } = setup(t, { version: { throwError: true }, status: { throwError: true } });
  assert.deepEqual(await manager.getStatus(), { available: false, auth: 'unknown', login: 'idle' });
  const { manager: synchronous } = setup(t, {}, { spawnImpl() { throw new Error('private-executable-path'); } });
  assert.deepEqual(await synchronous.getStatus(), { available: false, auth: 'unknown', login: 'idle' });
  await assert.rejects(synchronous.startLogin({ expectedRevision: 'missing' }), error => error.code === 'CODEX_LOGIN_FAILED' && !error.message.includes('private-executable-path'));
});

test('fixed CODEX_HOME cannot be shadowed by inherited Windows environment key casing', async t => {
  const inherited = Object.entries(process.env).filter(([key]) => key.toLowerCase() === 'codex_home');
  for (const [key] of inherited) delete process.env[key];
  process.env.Codex_Home = path.resolve('.tmp/codex-direct-management-20261126/wrong-home');
  t.after(() => {
    for (const key of Object.keys(process.env)) if (key.toLowerCase() === 'codex_home') delete process.env[key];
    for (const [key, value] of inherited) process.env[key] = value;
  });
  const { manager, calls } = setup(t);
  await manager.startLogin({ expectedRevision: 'missing' });
  assert.deepEqual(Object.entries(calls[0].options.env).filter(([key]) => key.toLowerCase() === 'codex_home'), [['CODEX_HOME', codexHome]]);
});

test('stale unavailable status cannot replace availability learned by an explicit login action', async t => {
  let finishOldDiscovery;
  let requests = 0;
  const { manager } = setup(t, {}, { resolveExecutable: async () => ++requests === 1 ? new Promise(resolve => { finishOldDiscovery = resolve; }) : executable });
  const oldStatus = manager.getStatus();
  await flush();
  await manager.startLogin({ expectedRevision: 'missing' });
  finishOldDiscovery(undefined);
  assert.deepEqual(await oldStatus, { available: true, auth: 'unknown', login: 'pending' });
});

test('dispose during preflight stops delayed login and leaves no usable-client claim', async t => {
  let release;
  const { manager, calls } = setup(t, {}, { resolveExecutable: () => new Promise(resolve => { release = resolve; }) });
  const pending = manager.startLogin({ expectedRevision: 'missing' });
  await flush();
  manager.dispose();
  release(executable);
  assert.deepEqual(await pending, { available: false, auth: 'unknown', login: 'idle' });
  assert.equal(calls.length, 0);
});

test('cancelled login remains reserved until its child closes so a retry cannot overlap it', async t => {
  const { manager, calls } = setup(t);
  await manager.startLogin({ expectedRevision: 'missing' });
  calls[0].child.kill = signal => { calls[0].child.kills.push(signal); return true; };
  assert.equal((await manager.cancelLogin()).login, 'idle');
  await assert.rejects(manager.startLogin({ expectedRevision: 'missing' }), { code: 'CODEX_LOGIN_PENDING' });
  assert.equal(calls.length, 1);
  calls[0].child.emit('close', null, 'SIGTERM');
  assert.equal((await manager.startLogin({ expectedRevision: 'missing' })).login, 'pending');
  assert.equal(calls.length, 2);
});
