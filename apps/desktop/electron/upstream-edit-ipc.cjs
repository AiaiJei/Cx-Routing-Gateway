function registerUpstreamEditIpc({ ipcMain, isTrustedSender, getControlPort, getControlToken, fetchImpl = fetch } = {}) {
  if (!ipcMain || typeof isTrustedSender !== "function" || typeof getControlPort !== "function" || typeof getControlToken !== "function" || typeof fetchImpl !== "function") {
    throw new Error("Upstream edit IPC configuration is invalid");
  }

  ipcMain.handle("runtime:update-upstream", async (event, id, input) => {
    if (!isTrustedSender(event) || typeof id !== "string" || !id.trim() || id.length > 100 || !input || typeof input.name !== "string" || typeof input.baseUrl !== "string" || (input.apiKey !== undefined && typeof input.apiKey !== "string")) {
      throw new Error("Invalid upstream update");
    }
    const name = input.name.trim().slice(0, 80);
    const baseUrl = input.baseUrl.trim();
    if (!name || !baseUrl) throw new Error("Invalid upstream update");
    const body = { name, baseUrl };
    if (input.apiKey) body.apiKey = input.apiKey;
    const response = await fetchImpl(`http://127.0.0.1:${getControlPort()}/v1/control/upstreams/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${getControlToken() || ""}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Upstream update returned ${response.status}`);
    return response.json();
  });
}

module.exports = { registerUpstreamEditIpc };
