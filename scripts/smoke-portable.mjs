import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reservePortableSmokePorts } from './portable-smoke-config.mjs';

const executable = process.argv[2];
if (!executable) throw new Error('Usage: node scripts/smoke-portable.mjs <portable-executable>');
const ports = await reservePortableSmokePorts();
await ports.release();
const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-portable-userdata-'));
const environment = { ...process.env, ...ports.environment, CXRG_USER_DATA_DIR: userData, CODEX_HOME: path.join(userData, 'codex') };
for (const name of ['CXRG_MASTER_KEY', 'CXRG_CONTROL_TOKEN', 'CXRG_DEV_SERVER_URL', 'ELECTRON_RUN_AS_NODE']) delete environment[name];
const child = spawn(executable, [`--user-data-dir=${userData}`], {
  env: environment,
  stdio: 'ignore',
  windowsHide: true,
});
const endpoints = [
  ['control', ports.controlUrl],
  ['gateway', ports.gatewayUrl],
];

try {
  const pending = new Set(endpoints.map(([name]) => name));
  const services = {};
  const deadline = Date.now() + 45_000;
  while (pending.size && Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Portable app exited before health checks (code ${child.exitCode})`);
    for (const [name, endpoint] of endpoints) {
      if (!pending.has(name)) continue;
      try {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(1500) });
        const body = await response.json();
        if (response.ok && body.status === 'ok') {
          services[name] = body.service;
          pending.delete(name);
        }
      } catch {}
    }
    if (pending.size) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(pending.size, 0, `Services failed health checks: ${[...pending].join(', ')}`);
  console.log(JSON.stringify({ executable: path.resolve(executable), ok: true, services }));
} finally {
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    child.kill();
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(userData, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      break;
    } catch (error) {
      if (attempt === 4 || !['EBUSY', 'EPERM'].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
