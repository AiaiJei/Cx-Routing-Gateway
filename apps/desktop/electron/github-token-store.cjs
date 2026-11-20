const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

async function isSecureStorageAvailable(safeStorage, platform = process.platform) {
  if (!safeStorage || !["win32", "darwin"].includes(platform) || typeof safeStorage.isAsyncEncryptionAvailable !== "function") return false;
  try {
    return await safeStorage.isAsyncEncryptionAvailable();
  } catch {
    return false;
  }
}

function createGitHubTokenStore({ filePath, safeStorage, fsImpl = fs, platform = process.platform }) {
  if (typeof filePath !== "string" || !filePath || !safeStorage) throw new Error("GitHub token store configuration is invalid");

  async function requireSecureStorage() {
    if (!(await isSecureStorageAvailable(safeStorage, platform))) {
      throw new Error("GitHub token secure storage is unavailable");
    }
  }

  function validateToken(token) {
    if (typeof token !== "string" || !token || token.length > 8192 || token.trim() !== token || /[\r\n\0]/.test(token)) {
      throw new Error("Invalid GitHub token");
    }
  }

  async function replaceEncrypted(encrypted) {
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) throw new Error("Unable to encrypt GitHub token");
    const directory = path.dirname(filePath);
    const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fsImpl.mkdir(directory, { recursive: true });
    try {
      await fsImpl.writeFile(temporaryPath, encrypted, { flag: "wx", mode: 0o600 });
      await fsImpl.rename(temporaryPath, filePath);
    } catch {
      await fsImpl.rm(temporaryPath, { force: true }).catch(() => {});
      throw new Error("Unable to save encrypted GitHub token");
    }
  }

  async function hasToken() {
    await requireSecureStorage();
    try {
      const stat = await fsImpl.stat(filePath);
      return stat.isFile() && stat.size > 0;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw new Error("Unable to inspect GitHub token storage");
    }
  }

  async function getToken() {
    await requireSecureStorage();
    let encrypted;
    try {
      encrypted = await fsImpl.readFile(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw new Error("Unable to read GitHub token storage");
    }
    try {
      let decrypted = await safeStorage.decryptStringAsync(encrypted);
      validateToken(decrypted?.result);
      if (decrypted.shouldReEncrypt) {
        const rotatedCiphertext = await safeStorage.encryptStringAsync(decrypted.result);
        await replaceEncrypted(rotatedCiphertext);
        decrypted = await safeStorage.decryptStringAsync(rotatedCiphertext);
        validateToken(decrypted?.result);
        if (decrypted.shouldReEncrypt) throw new Error("Token encryption key rotation did not complete");
      }
      return decrypted.result;
    } catch {
      throw new Error("Invalid encrypted GitHub token storage");
    }
  }

  async function setToken(token) {
    await requireSecureStorage();
    validateToken(token);
    let encrypted;
    try {
      encrypted = await safeStorage.encryptStringAsync(token);
    } catch {
      throw new Error("Unable to encrypt GitHub token");
    }
    await replaceEncrypted(encrypted);
    return { configured: true };
  }

  async function removeToken() {
    await fsImpl.rm(filePath, { force: true });
    return { configured: false };
  }

  return { hasToken, getToken, setToken, removeToken };
}

module.exports = { createGitHubTokenStore, isSecureStorageAvailable };
