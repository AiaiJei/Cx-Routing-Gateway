function createGitHubTokenService({ store, safeStorage, verifyToken }) {
  if (!store || !safeStorage || typeof verifyToken !== "function") throw new Error("GitHub token service configuration is invalid");

  async function getStatus() {
    const secureStorageAvailable = typeof safeStorage.isEncryptionAvailable === "function" && safeStorage.isEncryptionAvailable();
    if (!secureStorageAvailable) return { configured: false, secureStorageAvailable: false };
    return { configured: await store.hasToken(), secureStorageAvailable: true };
  }

  async function save(token) {
    if (typeof token !== "string" || !token || token.length > 8192 || token.trim() !== token || /[\r\n\0]/.test(token)) {
      throw new Error("Invalid GitHub token");
    }
    if (typeof safeStorage.isEncryptionAvailable !== "function" || !safeStorage.isEncryptionAvailable()) {
      throw new Error("GitHub token secure storage is unavailable");
    }
    try {
      const result = await verifyToken({ token });
      if (result?.valid !== true) throw new Error("GitHub token cannot access repository");
      return await store.setToken(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub token verification failed";
      throw new Error(token ? message.replaceAll(token, "[redacted]") : message);
    }
  }

  async function getToken() {
    return store.getToken();
  }

  async function remove() {
    return store.removeToken();
  }

  return { getStatus, save, getToken, remove };
}

module.exports = { createGitHubTokenService };
