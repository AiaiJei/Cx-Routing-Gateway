const { fail } = require("./codex-errors.cjs");
const crypto = require("node:crypto");
const { validateCapabilities, supportedEfforts } = require("./codex-model-capabilities.cjs");
const { validReasoningRange } = require("./codex-reasoning-range.cjs");

function createCodexRuntimeClient({
  getControlPort,
  getGatewayPort,
  getControlToken,
  isRuntimeReady,
  fetchImpl = fetch,
} = {}) {
  if (
    ![getControlPort, getGatewayPort, getControlToken, isRuntimeReady, fetchImpl].every(
      (value) => typeof value === "function",
    )
  )
    throw fail("CODEX_INPUT_INVALID");
  function portOf(getPort) {
    const port = getPort();
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw fail("CODEX_RUNTIME_UNAVAILABLE");
    return port;
  }
  async function request(port, endpoint, token, fallback, input) {
    if (!isRuntimeReady() || typeof token !== "string" || !token || !/^[\x21-\x7e]+$/.test(token))
      throw fail("CODEX_RUNTIME_UNAVAILABLE");
    try {
      const response = await fetchImpl("http://127.0.0.1:" + port + endpoint, {
        headers: {
          authorization: "Bearer " + token,
          ...(input === undefined ? {} : { "content-type": "application/json" }),
        },
        method: input === undefined ? "GET" : "POST",
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      const contentLength = response.headers.get("content-length");
      if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > 1024 * 1024)) {
        await response.body?.cancel();
        throw fail(fallback);
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body || []) {
        size += chunk.length;
        if (size > 1024 * 1024) throw fail(fallback);
        chunks.push(Buffer.from(chunk));
      }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!response.ok) {
        if (value?.error === "key_secret_mismatch") throw fail("CODEX_CREDENTIAL_MISMATCH");
        throw fail(fallback);
      }
      return value;
    } catch (error) {
      if (error?.code === "CODEX_CREDENTIAL_MISMATCH") throw error;
      throw fail(fallback);
    }
  }
  async function getRoutes(routeIds) {
    if (
      !Array.isArray(routeIds) ||
      routeIds.length < 1 ||
      routeIds.length > 100 ||
      new Set(routeIds).size !== routeIds.length ||
      routeIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 100 || /[\u0000-\u001f\u007f]/.test(id))
    )
      throw fail("CODEX_INPUT_INVALID");
    const state = await request(
      portOf(getControlPort),
      "/v1/control/state",
      getControlToken(),
      "CODEX_RUNTIME_UNAVAILABLE",
    );
    if (!state || !Array.isArray(state.routes) || !Array.isArray(state.upstreams))
      throw fail("CODEX_RUNTIME_UNAVAILABLE");
    const routes = routeIds.map((routeId) => {
      const route = state.routes.find((item) => item.id === routeId);
      if (
        !route ||
        route.enabled !== true ||
        route.inboundProtocol !== "Res" ||
        !["Res", "Mes", "Chat"].includes(route.outboundProtocol) ||
        (route.reasoning !== undefined && !validReasoningRange(route.reasoning)) ||
        typeof route.alias !== "string" ||
        !route.alias.trim() ||
        route.alias.length > 256 ||
        /[\u0000-\u001f\u007f]/.test(route.alias) ||
        state.routes.filter(
          (item) => item.enabled === true && item.inboundProtocol === "Res" && item.alias === route.alias,
        ).length !== 1
      )
        throw fail("CODEX_ROUTE_UNAVAILABLE");
      const targets =
        Array.isArray(route.targets) && route.targets.length
          ? route.targets
          : [{ upstreamId: route.upstreamId, modelId: route.modelId }];
      const available = targets.some(
        (target) =>
          target &&
          typeof target.modelId === "string" &&
          target.modelId.trim() &&
          state.upstreams.some((upstream) => upstream.id === target.upstreamId && upstream.enabled === true),
      );
      if (!available) throw fail("CODEX_ROUTE_UNAVAILABLE");
      let capabilities;
      if (route.capabilities !== undefined) {
        try { capabilities = validateCapabilities(route.capabilities); supportedEfforts(capabilities, route.reasoning); }
        catch { throw fail("CODEX_ROUTE_UNAVAILABLE"); }
        if (capabilities.tools === false) throw fail("CODEX_ROUTE_UNAVAILABLE");
      }
      return {
        ...(capabilities === undefined ? {} : { capabilities }),
        id: routeId, model: route.alias, outboundProtocol: route.outboundProtocol,
        ...(route.reasoning === undefined ? {} : { reasoning: { ...route.reasoning } }),
      };
    });
    if (new Set(routes.map((route) => route.model)).size !== routes.length) throw fail("CODEX_ROUTE_UNAVAILABLE");
    return { routes, baseUrl: "http://127.0.0.1:" + portOf(getGatewayPort) + "/v1" };
  }
  return {
    getRoutes,
    async getGatewayCredentials(currentKey) {
      const result = await request(
        portOf(getControlPort),
        "/v1/control/client-keys",
        getControlToken(),
        "CODEX_CREDENTIAL_UNAVAILABLE",
      );
      if (!result || !Array.isArray(result.credentials)) throw fail("CODEX_CREDENTIAL_UNAVAILABLE");
      let currentCredentialId;
      if (
        typeof currentKey === "string" &&
        currentKey.length >= 8 &&
        currentKey.length <= 512 &&
        /^[\x21-\x7e]+$/.test(currentKey)
      ) {
        const match = await request(
          portOf(getControlPort),
          "/v1/control/client-keys/match",
          getControlToken(),
          "CODEX_CREDENTIAL_UNAVAILABLE",
          { keyHash: crypto.createHash("sha256").update(currentKey).digest("hex") },
        );
        if (match?.credential?.enabled === true && typeof match.credential.id === "string")
          currentCredentialId = match.credential.id;
      }
      return { credentials: result.credentials, ...(currentCredentialId ? { currentCredentialId } : {}) };
    },
    async resolveGatewayCredential(id) {
      if (typeof id !== "string" || !id.trim() || id.length > 100 || /[\u0000-\u001f\u007f]/.test(id))
        throw fail("CODEX_INPUT_INVALID");
      return request(
        portOf(getControlPort),
        "/v1/control/client-keys/" + encodeURIComponent(id) + "/secret",
        getControlToken(),
        "CODEX_CREDENTIAL_UNAVAILABLE",
      );
    },
    async retainGatewayCredential(id, key) {
      if (
        typeof id !== "string" ||
        !id.trim() ||
        id.length > 100 ||
        /[\u0000-\u001f\u007f]/.test(id) ||
        typeof key !== "string" ||
        key.length < 8 ||
        key.length > 512 ||
        !/^[\x21-\x7e]+$/.test(key)
      )
        throw fail("CODEX_INPUT_INVALID");
      return request(
        portOf(getControlPort),
        "/v1/control/client-keys/" + encodeURIComponent(id) + "/secret",
        getControlToken(),
        "CODEX_CREDENTIAL_UNAVAILABLE",
        { key },
      );
    },
    async getRoute(routeId) {
      const result = await getRoutes([routeId]);
      return { model: result.routes[0].model, baseUrl: result.baseUrl };
    },
    async validateKey(clientKey, model) {
      if (
        typeof clientKey !== "string" ||
        clientKey.length < 8 ||
        clientKey.length > 512 ||
        !/^[\x21-\x7e]+$/.test(clientKey) ||
        typeof model !== "string" ||
        !model
      )
        throw fail("CODEX_INPUT_INVALID");
      const result = await request(portOf(getGatewayPort), "/v1/models", clientKey, "CODEX_KEY_REJECTED");
      if (!result || !Array.isArray(result.data) || !result.data.some((item) => item && item.id === model))
        throw fail("CODEX_KEY_REJECTED");
    },
  };
}
module.exports = { createCodexRuntimeClient };
