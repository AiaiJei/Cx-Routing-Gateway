import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import tokenStoreModule from '../../apps/desktop/electron/github-token-store.cjs';

const { createGitHubTokenStore } = tokenStoreModule;
const { isSecureStorageAvailable } = tokenStoreModule;
const token = 'github_pat_example_token_value_123456789';

function encryptedStorage(available = true) {
  const key = Buffer.alloc(32, 0x5a);
  return {
    isAsyncEncryptionAvailable: async () => available,
    getSelectedStorageBackend: () => 'win32',
    encryptStringAsync: async (value) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptStringAsync: async (value) => {
      if (value.length < 28) throw new Error('Invalid encrypted token');
      const iv = value.subarray(0, 12);
      const tag = value.subarray(12, 28);
      const encrypted = value.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return { result: Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'), shouldReEncrypt: false };
    },
  };
}

async function temporaryStore(t, safeStorage = encryptedStorage()) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cxrg-token-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return {
    filePath: path.join(directory, 'github-update-token.bin'),
    store: createGitHubTokenStore({ filePath: path.join(directory, 'github-update-token.bin'), safeStorage }),
  };
}

test('token store encrypts credentials at rest and decrypts only for the caller', async (t) => {
  const { filePath, store } = await temporaryStore(t);
  await store.setToken(token);
  const savedBytes = await fs.readFile(filePath);
  assert.equal(savedBytes.includes(Buffer.from(token)), false);
  assert.equal(await store.hasToken(), true);
  assert.equal(await store.getToken(), token);
});

test('token store replaces and removes credentials without returning them', async (t) => {
  const { filePath, store } = await temporaryStore(t);
  const replacement = 'github_pat_replacement_0987654321';
  assert.deepEqual(await store.setToken(token), { configured: true });
  assert.deepEqual(await store.setToken(replacement), { configured: true });
  assert.equal(await store.getToken(), replacement);
  assert.deepEqual(await store.removeToken(), { configured: false });
  assert.equal(await store.hasToken(), false);
  await assert.rejects(() => fs.access(filePath));
});

test('token store refuses plaintext fallback when OS encryption is unavailable', async (t) => {
  const { filePath, store } = await temporaryStore(t, encryptedStorage(false));
  await assert.rejects(() => store.setToken(token), /secure storage is unavailable/i);
  await assert.rejects(() => store.getToken(), /secure storage is unavailable/i);
  await assert.rejects(() => store.hasToken(), /secure storage is unavailable/i);
  await assert.rejects(() => fs.access(filePath));
});

test('token store migrates ciphertext when safeStorage requests re-encryption', async (t) => {
  const { filePath } = await temporaryStore(t);
  const storage = encryptedStorage();
  let reencrypt = true;
  const decrypt = storage.decryptStringAsync;
  storage.decryptStringAsync = async (value) => {
    const result = await decrypt(value);
    const shouldReEncrypt = reencrypt;
    reencrypt = false;
    return { ...result, shouldReEncrypt };
  };
  const store = createGitHubTokenStore({ filePath, safeStorage: storage });
  await fs.writeFile(filePath, await storage.encryptStringAsync(token));
  const originalCiphertext = await fs.readFile(filePath);
  assert.equal(await store.getToken(), token);
  const migratedCiphertext = await fs.readFile(filePath);
  assert.notDeepEqual(migratedCiphertext, originalCiphertext);
  assert.equal(migratedCiphertext.includes(Buffer.from(token)), false);
});

test('secure storage rejects Linux and unknown platforms instead of assuming an OS-backed provider', async () => {
  assert.equal(await isSecureStorageAvailable({ isAsyncEncryptionAvailable: async () => true, getSelectedStorageBackend: () => 'basic_text' }, 'linux'), false);
  assert.equal(await isSecureStorageAvailable({ isAsyncEncryptionAvailable: async () => true, getSelectedStorageBackend: () => 'gnome_libsecret' }, 'linux'), false);
  assert.equal(await isSecureStorageAvailable({ isAsyncEncryptionAvailable: async () => true, getSelectedStorageBackend: () => 'unknown' }, 'linux'), false);
  assert.equal(await isSecureStorageAvailable({ isAsyncEncryptionAvailable: async () => true }, 'win32'), true);
  assert.equal(await isSecureStorageAvailable({ isAsyncEncryptionAvailable: async () => false }, 'win32'), false);
});

test('token store rejects empty, non-string, and oversized credentials', async (t) => {
  const { store } = await temporaryStore(t);
  await assert.rejects(() => store.setToken('  '), /invalid GitHub token/i);
  await assert.rejects(() => store.setToken({ value: token }), /invalid GitHub token/i);
  await assert.rejects(() => store.setToken('t'.repeat(8193)), /invalid GitHub token/i);
});

test('token store reports encrypted data that cannot be decrypted as an error', async (t) => {
  const { filePath, store } = await temporaryStore(t);
  await fs.writeFile(filePath, Buffer.from('not-encrypted-token-data'));
  await assert.rejects(() => store.getToken(), /invalid encrypted GitHub token storage/i);
});
