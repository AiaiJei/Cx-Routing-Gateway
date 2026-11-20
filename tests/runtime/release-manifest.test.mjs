import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function runVerifier(releaseDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-release.mjs', releaseDir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { error += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error || `exit ${code}`)));
  });
}

test('release manifest includes packaged runtime resources', async (t) => {
  const releaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-release-test-'));
  t.after(() => fs.rm(releaseDir, { recursive: true, force: true }));
  for (const relative of ['win-unpacked/Cx-Routing Gateway.exe', 'win-unpacked/resources/app.asar', 'win-unpacked/resources/runtime/services/local-control/src/server.mjs', 'win-unpacked/resources/runtime/services/gateway/src/server.mjs', 'win-unpacked/resources/runtime/services/gateway/src/request-metrics.mjs', 'win-unpacked/resources/runtime/packages/shared/src/config-store.mjs', 'win-unpacked/resources/runtime/packages/shared/src/secret-vault.mjs', 'win-unpacked/resources/runtime/scripts/check-update.mjs', 'Cx-Routing Gateway Setup 1.1.0.exe', 'Cx-Routing Gateway Setup 1.1.0.exe.blockmap', 'Cx-Routing Gateway Portable 1.1.0.exe']) {
    const file = path.join(releaseDir, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'test artifact');
  }
  const manifest = await runVerifier(releaseDir);
  assert.equal(manifest.version, '1.1.0');
  assert.equal(manifest.artifacts.some((item) => item.path === 'win-unpacked/resources/runtime/services/gateway/src/request-metrics.mjs'), true);
  const metricsModule = path.join(releaseDir, 'win-unpacked/resources/runtime/services/gateway/src/request-metrics.mjs');
  await fs.rename(metricsModule, `${metricsModule}.omitted`);
  await assert.rejects(() => runVerifier(releaseDir), /Missing or empty release artifact: .*request-metrics.mjs/);
  await fs.rename(`${metricsModule}.omitted`, metricsModule);
  const pkg = JSON.parse(await fs.readFile(new URL('../../apps/desktop/package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.artifacts.some((item) => item.path === 'win-unpacked/resources/runtime/services/local-control/src/server.mjs'), true);
  assert.equal(manifest.artifacts.some((item) => item.path === 'win-unpacked/resources/runtime/packages/shared/src/config-store.mjs'), true);
  assert.equal(manifest.artifacts.some((item) => item.path === 'Cx-Routing Gateway Portable 1.1.0.exe'), true);
  await fs.rm(path.join(releaseDir, 'Cx-Routing Gateway Portable 1.1.0.exe'));
  await assert.rejects(() => runVerifier(releaseDir), /Missing or empty release artifact: Cx-Routing Gateway Portable 1.1.0.exe/);
  await fs.writeFile(path.join(releaseDir, 'Cx-Routing Gateway Portable 1.1.0.exe'), 'test artifact');
  await fs.rename(path.join(releaseDir, 'Cx-Routing Gateway Setup 1.1.0.exe'), path.join(releaseDir, 'Cx-Routing Gateway Setup 0.1.0.exe'));
  await assert.rejects(() => runVerifier(releaseDir), /Missing or empty release artifact: Cx-Routing Gateway Setup 1.1.0.exe/);
});

test('release verifier rejects a missing runtime in an isolated package', async (t) => {
  const releaseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-release-test-'));
  t.after(() => fs.rm(releaseDir, { recursive: true, force: true }));
  await assert.rejects(() => runVerifier(releaseDir), /Missing or empty release artifact/);
});
