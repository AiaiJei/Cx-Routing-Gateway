function registerGitHubUpdateIpc({
  ipcMain,
  isTrustedSender,
  getTokenService,
  loadUpdater,
  getCurrentVersion,
  getDownloadDir,
  installDownloaded,
  publicRead = true,
}) {
  if (!ipcMain || typeof isTrustedSender !== "function" || typeof getTokenService !== "function" || typeof loadUpdater !== "function") {
    throw new Error("GitHub update IPC configuration is invalid");
  }

  function handle(channel, operation) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedSender(event)) throw new Error("Untrusted runtime request");
      return operation(...args);
    });
  }

  handle("runtime:get-update-token-status", async () => publicRead ? { configured: true, secureStorageAvailable: false, publicRead: true } : getTokenService().getStatus());
  handle("runtime:save-update-token", async (token) => {
    if (typeof token !== "string") throw new Error("Invalid GitHub token request");
    return getTokenService().save(token);
  });
  handle("runtime:remove-update-token", async () => getTokenService().remove());

  handle("runtime:check-update", async () => {
    if (publicRead) {
      const { checkUpdate } = await loadUpdater();
      return { ...(await checkUpdate({ currentVersion: getCurrentVersion() })), publicRead: true };
    }
    const service = getTokenService();
    const token = await service.getToken();
    if (!token) return { configured: false, available: false };
    const { checkUpdate } = await loadUpdater();
    try {
      return await checkUpdate({ currentVersion: getCurrentVersion(), token });
    } catch (error) {
      if (error?.code === "GITHUB_CREDENTIAL_RECHECK" && !(await service.verifyStoredToken())) {
        return { configured: false, available: false, tokenInvalid: true };
      }
      throw error;
    }
  });

  handle("runtime:install-update", async () => {
    if (publicRead) {
      const { installUpdate } = await loadUpdater();
      const result = await installUpdate({ currentVersion: getCurrentVersion(), downloadDir: getDownloadDir() });
      if (typeof installDownloaded !== "function") throw new Error("Verified installer launch is unavailable");
      await installDownloaded(result);
      return { configured: true, installed: true, version: result.version, publicRead: true };
    }
    const service = getTokenService();
    const token = await service.getToken();
    if (!token) return { configured: false, installed: false };
    const { installUpdate } = await loadUpdater();
    let result;
    try {
      result = await installUpdate({ currentVersion: getCurrentVersion(), token, downloadDir: getDownloadDir() });
    } catch (error) {
      if (error?.code === "GITHUB_CREDENTIAL_RECHECK" && !(await service.verifyStoredToken())) {
        return { configured: false, installed: false, tokenInvalid: true };
      }
      throw error;
    }
    if (typeof installDownloaded !== "function") throw new Error("Verified installer launch is unavailable");
    await installDownloaded(result);
    return { configured: true, installed: true, version: result.version };
  });
}

module.exports = { registerGitHubUpdateIpc };
