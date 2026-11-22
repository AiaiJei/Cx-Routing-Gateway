import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadOrCreateRuntimeMasterKey } from '../../apps/desktop/electron/runtime-master-key.cjs';

function storage({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString(value) { return Buffer.from('encrypted:' + value, 'utf8'); },
    decryptString(value) {
      const text = Buffer.from(value).toString('utf8');
      if (!text.startsWith('encrypted:')) throw new Error('cannot decrypt');
      return text.slice('encrypted:'.length);
    },
  };
}

test('runtime master key is reused across loads and new writes are versioned', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-master-key-'));
  const filePath = path.join(dir, 'runtime-master.key');
  const randomBytes = () => Buffer.from('12345678901234567890123456789012');
  const first = loadOrCreateRuntimeMasterKey({ filePath, safeStorage: storage(), randomBytes });
  assert.equal(first, 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI');
  assert.match(await fs.readFile(filePath, 'utf8'), /^v1:enc:/);
  const second = loadOrCreateRuntimeMasterKey({ filePath, safeStorage: storage(), randomBytes: () => { throw new Error('must not regenerate'); } });
  assert.equal(second, first);
});

test('legacy encrypted and plaintext master-key files remain readable', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-master-key-'));
  const encryptedPath = path.join(dir, 'legacy-encrypted.key');
  const legacyKey = 'legacy-secret-123456789012345678901234';
  await fs.writeFile(encryptedPath, Buffer.from('encrypted:' + legacyKey).toString('base64'));
  assert.equal(loadOrCreateRuntimeMasterKey({ filePath: encryptedPath, safeStorage: storage() }), legacyKey);
  const plainPath = path.join(dir, 'legacy-plain.key');
  const legacyPlain = 'legacy-plain-secret-123456789012345678';
  await fs.writeFile(plainPath, legacyPlain + '\n');
  assert.equal(loadOrCreateRuntimeMasterKey({ filePath: plainPath, safeStorage: storage({ available: false }) }), legacyPlain);
});

test('an unreadable existing master-key file is preserved and never replaced', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-master-key-'));
  const filePath = path.join(dir, 'runtime-master.key');
  const original = 'not-a-valid-master-key!';
  await fs.writeFile(filePath, original);
  assert.throws(() => loadOrCreateRuntimeMasterKey({ filePath, safeStorage: storage({ available: false }), randomBytes: () => { throw new Error('must not regenerate'); } }), /master key/i);
  assert.equal(await fs.readFile(filePath, 'utf8'), original);
});
