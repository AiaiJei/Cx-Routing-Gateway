import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

function runVerifier() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-release.mjs', 'apps/desktop/release'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.stderr.on('data', (chunk) => { error += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error || `exit ${code}`)));
  });
}

test('release manifest includes packaged runtime resources', async () => {
  const manifest = await runVerifier();
  assert.equal(manifest.artifacts.some((item) => item.path === 'win-unpacked/resources/runtime/services/local-control/src/server.mjs'), true);
  assert.equal(manifest.artifacts.some((item) => item.path === 'win-unpacked/resources/runtime/packages/shared/src/config-store.mjs'), true);
});
