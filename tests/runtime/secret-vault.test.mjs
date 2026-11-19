import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SecretVault } from '../../packages/shared/src/secret-vault.mjs';

test('SecretVault encrypts values and rejects a wrong master key', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-vault-'));
  const file = path.join(dir, 'secrets.json');
  const vault = new SecretVault(file, 'correct-key');
  const ref = await vault.put('super-secret-value');
  assert.equal(await vault.get(ref), 'super-secret-value');
  assert.doesNotMatch(await fs.readFile(file, 'utf8'), /super-secret-value/);
  await assert.rejects(() => new SecretVault(file, 'wrong-key').get(ref), /Secret vault could not be opened/);
});
