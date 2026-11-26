const { fail, sanitize } = require("./codex-errors.cjs");

function registerCodexIpc({ ipcMain, isTrustedSender, getService, getClientManager } = {}) {
  if (
    !ipcMain ||
    typeof ipcMain.handle !== "function" ||
    typeof isTrustedSender !== "function" ||
    typeof getService !== "function"
  )
    throw fail("CODEX_INPUT_INVALID");
  const methods = {
    status: [getService, "getStatus"],
    preview: [getService, "preview"],
    apply: [getService, "apply"],
    restore: [getService, "restore"],
  };
  Object.assign(methods, {
    "direct-profiles": [getService, "getDirectProfiles"],
    "direct-save": [getService, "saveDirectProfile"],
    "direct-import": [getService, "importDirectProfile"],
    "direct-duplicate": [getService, "duplicateDirectProfile"],
    "direct-delete": [getService, "deleteDirectProfile"],
  });
  Object.assign(methods, {
    "gateway-preferences": [getService, "getGatewayPreferences"],
    "gateway-preferences-save": [getService, "saveGatewayPreferences"],
    "gateway-credentials": [getService, "getGatewayCredentials"],
    "gateway-credential-retain": [getService, "retainGatewayCredential"],
  });
  if (getClientManager)
    Object.assign(methods, {
      "client-status": [getClientManager, "getStatus"],
      login: [getClientManager, "startLogin"],
      "cancel-login": [getClientManager, "cancelLogin"],
    });
  for (const [channel, [getTarget, method]] of Object.entries(methods)) {
    ipcMain.handle("runtime:codex-" + channel, async (event, input) => {
      try {
        if (!isTrustedSender(event)) throw fail("CODEX_INPUT_INVALID");
        const service = getTarget();
        if (!service || typeof service[method] !== "function") throw fail("CODEX_IO_FAILED");
        return await service[method](input);
      } catch (error) {
        const safe = sanitize(error);
        // Electron transports only Error.message across invoke(), so include the
        // allowlisted code after sanitizing; never format the original failure.
        safe.message = "[" + safe.code + "] " + safe.message;
        throw safe;
      }
    });
  }
}
module.exports = { registerCodexIpc };
