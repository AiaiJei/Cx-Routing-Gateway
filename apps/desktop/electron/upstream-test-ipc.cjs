function upstreamTestFailure(status, body) {
  if (body?.error === "destination_changed") {
    return new Error("上游内网 DNS 地址已变化，或公网与内网目标发生切换。请确认目标可信后，编辑并重新保存 Base URL。");
  }
  if (body?.error === "destination_untrusted") return new Error("上游地址解析失败或包含未经允许的网络地址（HTTP 502）。请检查域名解析和内网信任设置。");
  if (body?.error === "timeout") return new Error("上游连通测试超时（HTTP 502）。");
  if (body?.error === "unavailable") return new Error(`上游模型列表接口暂不可用（HTTP ${status}）。请检查服务地址和凭证。`);
  return new Error(`上游连通测试失败（HTTP ${status}）。`);
}

function registerUpstreamTestIpc({ ipcMain, isTrustedSender, getControlPort, getControlToken, fetchImpl = fetch } = {}) {
  if (!ipcMain || typeof isTrustedSender !== "function" || typeof getControlPort !== "function" || typeof getControlToken !== "function" || typeof fetchImpl !== "function") {
    throw new Error("Upstream test IPC configuration is invalid");
  }

  ipcMain.handle("runtime:test-upstream", async (event, upstreamId) => {
    if (!isTrustedSender(event) || typeof upstreamId !== "string" || !upstreamId.trim() || upstreamId.length > 100) {
      throw new Error("Untrusted runtime request");
    }
    const response = await fetchImpl(`http://127.0.0.1:${getControlPort()}/v1/control/upstreams/${encodeURIComponent(upstreamId)}/test`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${getControlToken() || ""}` },
      body: "{}",
    });
    if (!response.ok) {
      let body = {};
      try { body = await response.json(); } catch {}
      throw upstreamTestFailure(response.status, body);
    }
    return response.json();
  });
}

module.exports = { registerUpstreamTestIpc };
