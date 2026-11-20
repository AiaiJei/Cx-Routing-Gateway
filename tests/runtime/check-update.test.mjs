import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkUpdate, compareVersions, installUpdate, verifyGitHubToken } from '../../scripts/check-update.mjs';

const token = 'github_pat_fixture_token_123456789';
const repositoryContentsUrl = 'https://api.github.com/repos/AiaiJei/Cx-Routing-Gateway/contents';
const releaseUrl = 'https://api.github.com/repos/AiaiJei/Cx-Routing-Gateway/releases/latest';
const bytes = Buffer.from('verified installer bytes');
const digest = crypto.createHash('sha256').update(bytes).digest('hex');

function release(overrides = {}) {
  return {
    draft: false,
    prerelease: false,
    tag_name: 'v1.1.0',
    html_url: 'https://github.com/AiaiJei/Cx-Routing-Gateway/releases/tag/v1.1.0',
    assets: [{ name: 'Cx-Routing Gateway Setup 1.1.0.exe', digest: `sha256:${digest}`, browser_download_url: 'https://github.com/AiaiJei/Cx-Routing-Gateway/releases/download/v1.1.0/Cx-Routing%20Gateway%20Setup%201.1.0.exe' }],
    ...overrides,
  };
}

function fetchFixture(payload, assetBytes = bytes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const request = { url: String(url), options };
    calls.push(request);
    if (request.url.startsWith('https://github.com/')) return new Response(assetBytes, { status: 200 });
    if (payload instanceof Error) throw payload;
    const response = typeof payload === 'function' ? payload(request) : payload;
    return response instanceof Response ? response : new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

function assertBearerOnly(request) {
  assert.equal(new URL(request.url).search, '');
  assert.equal(request.options.headers.authorization, `Bearer ${token}`);
}

test('the standalone update command clearly directs users to encrypted Desktop settings', async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/check-update.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { output += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, output }));
  });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /configured in Desktop settings/i);
});

test('verifyGitHubToken confirms Contents read access without returning the credential', async () => {
  const { fetchImpl, calls } = fetchFixture([{ name: 'README.md', path: 'README.md', type: 'file' }]);
  const result = await verifyGitHubToken({ token, fetchImpl });
  assert.deepEqual(result, { valid: true });
  assert.equal(calls[0].url, repositoryContentsUrl);
  assertBearerOnly(calls[0]);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('verifyGitHubToken rejects unauthorized, forbidden and inaccessible repositories', async () => {
  for (const status of [401, 403, 404]) {
    const { fetchImpl } = fetchFixture(new Response('{}', { status }));
    await assert.rejects(() => verifyGitHubToken({ token, fetchImpl }), /cannot read repository contents/i);
  }
});

test('update operations require a token and never make unauthenticated requests', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('unexpected request'); };
  await assert.rejects(() => verifyGitHubToken({ fetchImpl }), /token is required/i);
  await assert.rejects(() => checkUpdate({ currentVersion: '1.0.3', fetchImpl }), /token is required/i);
  await assert.rejects(() => installUpdate({ currentVersion: '1.0.3', fetchImpl }), /token is required/i);
  assert.equal(called, false);
});

test('GitHub access cannot be redirected to an arbitrary repository', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('unexpected request'); };
  await assert.rejects(() => verifyGitHubToken({ token, repository: 'someone/else', fetchImpl }), /fixed for this application/i);
  await assert.rejects(() => checkUpdate({ currentVersion: '1.0.3', token, repository: 'someone/else', fetchImpl }), /fixed for this application/i);
  assert.equal(called, false);
});

test('checkUpdate finds a higher stable GitHub release using the token header only', async () => {
  const { fetchImpl, calls } = fetchFixture(release());
  const result = await checkUpdate({ currentVersion: '1.0.3', token, fetchImpl });
  assert.equal(result.configured, true);
  assert.equal(result.available, true);
  assert.equal(result.version, '1.1.0');
  assert.equal(result.releaseUrl, release().html_url);
  assert.equal(result.installer.name, 'Cx-Routing Gateway Setup 1.1.0.exe');
  assert.equal(calls[0].url, releaseUrl);
  assertBearerOnly(calls[0]);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('four-part product versions compare numerically and accept four-part release assets', async () => {
  assert.equal(compareVersions('1.1.1.1', '1.1.1'), 1);
  assert.equal(compareVersions('1.1.1', '1.1.1.0'), 0);
  assert.equal(compareVersions('1.1.1.1', '1.1.2'), -1);
  const fourPart = release({
    tag_name: 'v1.1.1.1',
    html_url: 'https://github.com/AiaiJei/Cx-Routing-Gateway/releases/tag/v1.1.1.1',
    assets: [{ name: 'Cx-Routing Gateway Setup 1.1.1.1.exe', digest: `sha256:${digest}`, browser_download_url: 'https://github.com/AiaiJei/Cx-Routing-Gateway/releases/download/v1.1.1.1/Cx-Routing%20Gateway%20Setup%201.1.1.1.exe' }],
  });
  const { fetchImpl } = fetchFixture(fourPart);
  const result = await checkUpdate({ currentVersion: '1.1.1', token, fetchImpl });
  assert.equal(result.available, true);
  assert.equal(result.version, '1.1.1.1');
  assert.equal(result.installer.name, 'Cx-Routing Gateway Setup 1.1.1.1.exe');
});

test('checkUpdate reports no update for equal or newer installed versions', async () => {
  const { fetchImpl } = fetchFixture(release());
  assert.equal((await checkUpdate({ currentVersion: '1.1.0', token, fetchImpl })).available, false);
  assert.equal((await checkUpdate({ currentVersion: '1.2.0', token, fetchImpl })).available, false);
});

test('checkUpdate rejects drafts, prereleases, malformed tags and missing installer digests', async () => {
  const invalidReleases = [
    release({ draft: true }),
    release({ prerelease: true }),
    release({ tag_name: 'release-1.1.0' }),
    release({ assets: [] }),
    release({ assets: [{ name: 'Cx-Routing Gateway Setup 1.1.0.exe', browser_download_url: release().assets[0].browser_download_url }] }),
    release({ assets: [{ name: 'Cx-Routing Gateway Setup 1.1.0.exe', digest: 'sha1:bad', browser_download_url: release().assets[0].browser_download_url }] }),
  ];
  for (const value of invalidReleases) {
    const { fetchImpl } = fetchFixture(value);
    await assert.rejects(() => checkUpdate({ currentVersion: '1.0.3', token, fetchImpl }));
  }
});

test('checkUpdate rejects a URL whose filename does not match the expected installer asset', async () => {
  const mismatched = release({ assets: [{ ...release().assets[0], browser_download_url: 'https://github.com/AiaiJei/Cx-Routing-Gateway/releases/download/v1.1.0/Other.exe' }] });
  const { fetchImpl } = fetchFixture(mismatched);
  await assert.rejects(() => checkUpdate({ currentVersion: '1.0.3', token, fetchImpl }), /installer URL is invalid/i);
});

test('checkUpdate rejects invalid JSON, malformed API responses and fetch failures', async () => {
  await assert.rejects(() => checkUpdate({ currentVersion: '1.0.3', token, fetchImpl: async () => new Response('{', { status: 200 }) }));
  await assert.rejects(() => checkUpdate({ currentVersion: '1.0.3', token, fetchImpl: async () => new Response('missing', { status: 500 }) }));
  const { fetchImpl } = fetchFixture(new Error('network unavailable'));
  await assert.rejects(() => checkUpdate({ currentVersion: '1.0.3', token, fetchImpl }), /Unable to contact GitHub Releases API/);
});

test('checkUpdate marks HTTP authorization or private-resource failures for token revalidation', async () => {
  for (const status of [401, 403, 404]) {
    const { fetchImpl } = fetchFixture(new Response('{}', { status }));
    await assert.rejects(() => checkUpdate({ currentVersion: '1.0.3', token, fetchImpl }), (error) => error.code === 'GITHUB_CREDENTIAL_RECHECK');
  }
});

test('installUpdate authenticates the asset request and verifies GitHub SHA-256 before writing', async (t) => {
  const { fetchImpl, calls } = fetchFixture(release());
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-update-'));
  t.after(() => fs.rm(downloadDir, { recursive: true, force: true }));
  const result = await installUpdate({ currentVersion: '1.0.3', token, fetchImpl, downloadDir });
  assert.equal(result.version, '1.1.0');
  assert.deepEqual(await fs.readFile(result.path), bytes);
  assert.equal(calls.length, 2);
  for (const call of calls) assertBearerOnly(call);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('installUpdate rejects tampered installer bytes before writing them', async (t) => {
  const { fetchImpl } = fetchFixture(release(), Buffer.from('tampered installer bytes'));
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-update-tampered-'));
  t.after(() => fs.rm(downloadDir, { recursive: true, force: true }));
  await assert.rejects(() => installUpdate({ currentVersion: '1.0.3', token, fetchImpl, downloadDir }), /SHA-256 mismatch/);
  assert.deepEqual(await fs.readdir(downloadDir), []);
});

test('installUpdate marks private asset authorization failures for token revalidation', async () => {
  for (const status of [401, 403, 404]) {
    const { fetchImpl } = fetchFixture(release());
    const deniedFetch = async (url, options) => {
      if (String(url).includes('/releases/download/')) return new Response('{}', { status });
      return fetchImpl(url, options);
    };
    await assert.rejects(() => installUpdate({ currentVersion: '1.0.3', token, fetchImpl: deniedFetch }), (error) => error.code === 'GITHUB_CREDENTIAL_RECHECK');
  }
});
