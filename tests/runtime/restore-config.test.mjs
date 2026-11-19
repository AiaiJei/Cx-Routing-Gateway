import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

function run(script, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, cwd], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('exit', (code) => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error || `exit ${code}`)));
  });
}

test('restore-config preserves the current config before restoring the backup', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-restore-'));
  const configPath = path.join(dir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify({ version: 1, value: 'current' }));
  await fs.writeFile(`${configPath}.bak`, JSON.stringify({ version: 1, value: 'backup' }));
  const result = await run(path.resolve('scripts/restore-config.mjs'), dir);
  assert.equal(result.restored, configPath);
  assert.deepEqual(JSON.parse(await fs.readFile(configPath, 'utf8')), { version: 1, value: 'backup' });
  assert.deepEqual(JSON.parse(await fs.readFile(`${configPath}.before-rollback`, 'utf8')), { version: 1, value: 'current' });
});
