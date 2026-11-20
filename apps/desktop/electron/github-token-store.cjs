const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function createGitHubTokenStore({ filePath, safeStorage, fsImpl = fs }) {
  if (typeof filePath !== "string" || !filePath || !safeStorage) throw new Error("GitHub token store configuration is invalid");

  function requireSecureStorage() {
    if (typeof safeStorage.isEncryptionAvailable !== "function" || !safeStorage.isEncryptionAvailable()) {
      throw new Error("GitHub token secure storage is unavailable");
    }
  }

  function validateToken(token) {
    if (typeof token !== "string" || !token || token.length > 8192 || token.trim() !== token || /[\r\n\0]/.test(token)) {
      throw new Error("Invalid GitHub token");
    }
  }

  async function hasToken() {
    requireSecureStorage();
    try {
      const stat = await fsImpl.stat(filePath);
      return stat.isFile() && stat.size > 0;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw new Error("Unable to inspect GitHub token storage");
    }
  }

  async function getToken() {
    requireSecureStorage();
    let encrypted;
    try {
      encrypted = await fsImpl.readFile(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw new Error("Unable to read GitHub token storage");
    }
    let token;
    try {
      token = safeStorage.decryptString(encrypted);
      validateToken(token);
    } catch {
      throw new Error("Invalid encrypted GitHub token storage");
    }
    return token;
  }

  async function setToken(token) {
    requireSecureStorage();
    validateToken(token);
    let encrypted;
    try {
      encrypted = safeStorage.encryptString(token);
    } catch {
      throw new Error("Unable to encrypt GitHub token");
    }
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
    return { configured: true };
  }

  async function removeToken() {
    await fsImpl.rm(filePath, { force: true });
    return { configured: false };
  }

  return { hasToken, getToken, setToken, removeToken };
}

module.exports = { createGitHubTokenStore };
