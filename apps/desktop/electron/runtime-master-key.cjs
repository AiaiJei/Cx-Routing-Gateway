const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function defaultRandomBytes(size) {
  return crypto.randomBytes(size);
}

function validateKey(value) {
  if (typeof value !== 'string' || value.length < 16) throw new Error('Runtime master key is invalid');
  return value;
}

function readExisting(raw, safeStorage) {
  if (raw.startsWith('v1:enc:')) {
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('Runtime master key requires encrypted storage');
    try { return validateKey(safeStorage.decryptString(Buffer.from(raw.slice('v1:enc:'.length), 'base64'))); }
    catch { throw new Error('Runtime master key could not be decrypted'); }
  }
  if (raw.startsWith('v1:plain:')) return validateKey(raw.slice('v1:plain:'.length));
  if (safeStorage?.isEncryptionAvailable?.()) {
    try {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length > 0) return validateKey(safeStorage.decryptString(decoded));
    } catch {}
  }
  if (/^[A-Za-z0-9_-]{16,}$/.test(raw)) return validateKey(raw);
  throw new Error('Runtime master key is invalid');
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = filePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, value + '\n', { mode: 0o600 });
  try { fs.renameSync(temporary, filePath); }
  catch (error) { try { fs.rmSync(temporary, { force: true }); } catch {} throw error; }
}

function loadOrCreateRuntimeMasterKey({ filePath, safeStorage, envMasterKey, randomBytes = defaultRandomBytes } = {}) {
  if (typeof envMasterKey === 'string' && envMasterKey) return envMasterKey;
  if (!filePath) throw new Error('Runtime master key path is required');
  try {
    return readExisting(fs.readFileSync(filePath, 'utf8').trim(), safeStorage);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const key = randomBytes(32).toString('base64url');
  if (safeStorage?.isEncryptionAvailable?.()) {
    const encrypted = safeStorage.encryptString(key);
    atomicWrite(filePath, 'v1:enc:' + Buffer.from(encrypted).toString('base64'));
  } else {
    atomicWrite(filePath, 'v1:plain:' + key);
  }
  return key;
}

module.exports = { loadOrCreateRuntimeMasterKey };
