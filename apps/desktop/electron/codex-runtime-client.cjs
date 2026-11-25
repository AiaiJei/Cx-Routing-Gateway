const { fail } = require("./codex-errors.cjs");

function createCodexRuntimeClient({ getControlPort, getGatewayPort, getControlToken, isRuntimeReady, fetchImpl = fetch } = {}) {
  if (![getControlPort, getGatewayPort, getControlToken, isRuntimeReady, fetchImpl].every(value => typeof value === "function")) throw fail("CODEX_INPUT_INVALID");
  function portOf(getPort) {
    const port = getPort();
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw fail("CODEX_RUNTIME_UNAVAILABLE");
    return port;
  }
  async function request(port, endpoint, token, fallback) {
    if (!isRuntimeReady() || typeof token !== "string" || !token || !/^[\x21-\x7e]+$/.test(token)) throw fail("CODEX_RUNTIME_UNAVAILABLE");
    try {
      const response = await fetchImpl("http://127.0.0.1:" + port + endpoint, {
        headers: { authorization: "Bearer " + token }, redirect: "error", signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) { await response.body?.cancel(); throw fail(fallback); }
      const contentLength = response.headers.get("content-length");
      if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > 1024 * 1024)) {
        await response.body?.cancel(); throw fail(fallback);
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body || []) {
        size += chunk.length;
        if (size > 1024 * 1024) throw fail(fallback);
        chunks.push(Buffer.from(chunk));
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { throw fail(fallback); }
  }
  return {
    async getRoute(routeId) {
      if (typeof routeId !== "string" || !routeId.trim() || routeId.length > 100) throw fail("CODEX_INPUT_INVALID");
      const state = await request(portOf(getControlPort), "/v1/control/state", getControlToken(), "CODEX_RUNTIME_UNAVAILABLE");
      if (!state || !Array.isArray(state.routes) || !Array.isArray(state.upstreams)) throw fail("CODEX_RUNTIME_UNAVAILABLE");
      const route = state.routes.find(item => item.id === routeId);
      if (!route || route.enabled !== true || route.inboundProtocol !== "Res" || !["Res", "Mes", "Chat"].includes(route.outboundProtocol) ||
          typeof route.alias !== "string" || !route.alias.trim() || route.alias.length > 256 || /[\u0000-\u001f\u007f]/.test(route.alias) ||
          state.routes.filter(item => item.enabled === true && item.inboundProtocol === "Res" && item.alias === route.alias).length !== 1) throw fail("CODEX_ROUTE_UNAVAILABLE");
      const targets = Array.isArray(route.targets) && route.targets.length ? route.targets : [{ upstreamId: route.upstreamId, modelId: route.modelId }];
      const available = targets.some(target => target && typeof target.modelId === "string" && target.modelId.trim() && state.upstreams.some(upstream => upstream.id === target.upstreamId && upstream.enabled === true));
      if (!available) throw fail("CODEX_ROUTE_UNAVAILABLE");
      return { model: route.alias, baseUrl: "http://127.0.0.1:" + portOf(getGatewayPort) + "/v1" };
    },
    async validateKey(clientKey, model) {
      if (typeof clientKey !== "string" || clientKey.length < 8 || clientKey.length > 512 || !/^[\x21-\x7e]+$/.test(clientKey) || typeof model !== "string" || !model) throw fail("CODEX_INPUT_INVALID");
      const result = await request(portOf(getGatewayPort), "/v1/models", clientKey, "CODEX_KEY_REJECTED");
      if (!result || !Array.isArray(result.data) || !result.data.some(item => item && item.id === model)) throw fail("CODEX_KEY_REJECTED");
    },
  };
}
module.exports = { createCodexRuntimeClient };
