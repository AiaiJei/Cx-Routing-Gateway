const { fail, sanitize } = require("./codex-errors.cjs");

function registerCodexIpc({ ipcMain, isTrustedSender, getService } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== "function" || typeof isTrustedSender !== "function" || typeof getService !== "function") throw fail("CODEX_INPUT_INVALID");
  const methods = { status: "getStatus", preview: "preview", apply: "apply", restore: "restore" };
  for (const [channel, method] of Object.entries(methods)) {
    ipcMain.handle("runtime:codex-" + channel, async (event, input) => {
      try {
        if (!isTrustedSender(event)) throw fail("CODEX_INPUT_INVALID");
        const service = getService();
        if (!service || typeof service[method] !== "function") throw fail("CODEX_IO_FAILED");
        return await service[method](input);
      } catch (error) { throw sanitize(error); }
    });
  }
}
module.exports = { registerCodexIpc };
