import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { checkUpdate, installUpdate } from '../../scripts/check-update.mjs';

test('update operations require the actual current product version before making requests', async () => {
  await assert.rejects(() => checkUpdate({ manifestUrl: 'http://127.0.0.1:1/unused' }), /currentVersion is required/);
  await assert.rejects(() => installUpdate({ manifestUrl: 'http://127.0.0.1:1/unused' }), /currentVersion is required/);
});

test('update CLI reads the Desktop version when no override is supplied', async (t) => {
  const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const payload = { product: 'Cx-Routing Gateway', version: '0.2.0', signed: true, artifacts: [] };
  const manifest = { ...payload, signature: crypto.sign(null, Buffer.from(JSON.stringify(payload)), keyPair.privateKey).toString('base64'), publicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) };
  const server = http.createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(manifest)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/check-update.mjs'], { env: { ...process.env, CXRG_CURRENT_VERSION: '', CXRG_UPDATE_MANIFEST_URL: `http://127.0.0.1:${server.address().port}/manifest.json` } });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
  });
  assert.notEqual(output.trim(), '', 'CLI must run from a workspace path containing spaces');
  assert.equal(JSON.parse(output).available, false, '0.2.0 is older than installed 1.0.1');
});

test('checkUpdate only reports signed higher versions as available', async (t) => {
  const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const payload = { product: 'Cx-Routing Gateway', version: '0.2.0', signed: true, artifacts: [{ path: 'setup.exe' }] };
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), keyPair.privateKey).toString('base64');
  const manifest = { ...payload, signature, publicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) };
  const server = http.createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(manifest)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const result = await checkUpdate({ currentVersion: "0.1.0", manifestUrl: `http://127.0.0.1:${server.address().port}/manifest.json` });
  assert.equal(result.available, true);
  assert.equal(result.version, '0.2.0');
  const newerInstallation = await checkUpdate({ manifestUrl: `http://127.0.0.1:${server.address().port}/manifest.json`, currentVersion: '1.0.1' });
  assert.equal(newerInstallation.available, false);
});

test('checkUpdate rejects a tampered signed manifest', async (t) => {
  const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const payload = { product: 'Cx-Routing Gateway', version: '0.2.0', signed: true, artifacts: [] };
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), keyPair.privateKey).toString('base64');
  const manifest = { ...payload, version: '0.3.0', signature, publicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) };
  const server = http.createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(manifest)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const result = await checkUpdate({ currentVersion: "0.1.0", manifestUrl: `http://127.0.0.1:${server.address().port}/manifest.json` });
  assert.equal(result.available, false);
  assert.equal(result.signed, false);
});

test('checkUpdate rejects product mismatch', async (t) => {
  const server = http.createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ product: 'Other', version: '9.0.0', signed: true })); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  await assert.rejects(() => checkUpdate({ currentVersion: "0.1.0", manifestUrl: `http://127.0.0.1:${server.address().port}/manifest.json` }), /product mismatch/);
});

test('installUpdate downloads and verifies a signed installer artifact', async (t) => {
  const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const payloadBytes = Buffer.from('installer-bytes');
  const payload = { product: 'Cx-Routing Gateway', version: '0.2.0', signed: true, artifacts: [{ path: 'Cx-Routing Gateway Setup 0.2.0.exe', sha256: crypto.createHash('sha256').update(payloadBytes).digest('hex') }] };
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), keyPair.privateKey).toString('base64');
  const manifest = { ...payload, signature, publicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) };
  const server = http.createServer((req, res) => {
    if (req.url === '/manifest.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(manifest)); return; }
    if (req.url?.endsWith('.exe')) { res.setHeader('content-type', 'application/octet-stream'); res.end(payloadBytes); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-update-'));
  const result = await installUpdate({ currentVersion: "0.1.0", manifestUrl: `http://127.0.0.1:${server.address().port}/manifest.json`, downloadDir: dir });
  assert.equal(result.version, '0.2.0');
  assert.deepEqual(await fs.readFile(result.path), payloadBytes);
});

test('installUpdate rejects path traversal in a signed artifact manifest', async (t) => {
  const keyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const payload = { product: 'Cx-Routing Gateway', version: '0.2.0', signed: true, artifacts: [{ path: '../evil.exe', sha256: '00' }] };
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(payload)), keyPair.privateKey).toString('base64');
  const manifest = { ...payload, signature, publicKey: keyPair.publicKey.export({ type: 'spki', format: 'pem' }) };
  const server = http.createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(manifest)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-update-traversal-'));
  await assert.rejects(() => installUpdate({ currentVersion: "0.1.0", manifestUrl: `http://127.0.0.1:${server.address().port}/manifest.json`, downloadDir: dir }), /path/);
});
