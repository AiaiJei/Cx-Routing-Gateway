import { describe, expect, it, vi } from "vitest";
import { fixtureWorkspaceClient, mapRuntimeState, runtimeWorkspaceClient } from "./workspace-client";

describe("fixtureWorkspaceClient", () => {
  it("marks workspace data as fixtures and returns independent copies", async () => {
    const first = await fixtureWorkspaceClient.getWorkspace();
    first.upstreams.pop();
    const second = await fixtureWorkspaceClient.getWorkspace();

    expect(second.meta).toEqual({ source: "fixture", live: false });
    expect(second.upstreams).toHaveLength(2);
    expect(second.gateway.state).toBe("未接入");
  });

  it("reports upstream checks as simulations without attempting a connection", async () => {
    const result = await fixtureWorkspaceClient.simulateUpstreamTest("up-northstar");
    expect(result.simulated).toBe(true);
    expect(result.message).toContain("未执行");
  });

  it("keeps credentials masked in the fixture data", async () => {
    const { credentials } = await fixtureWorkspaceClient.getWorkspace();
    expect(credentials.every(({ preview }) => preview.includes("••••"))).toBe(true);
    expect(credentials.some(({ preview }) => /[A-Za-z0-9]{24,}/.test(preview))).toBe(false);
  });

  it("does not expose destructive actions in fixture mode", () => {
    expect(fixtureWorkspaceClient).not.toHaveProperty("clearRequestLogs");
    expect(fixtureWorkspaceClient).not.toHaveProperty("permanentlyDeleteClientKey");
    expect(fixtureWorkspaceClient).not.toHaveProperty("deleteUpstream");
  });

  it("marks a checked runtime upstream as connected", () => {
    const workspace = mapRuntimeState({
      settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318, usageRetentionCount: 1000 },
      runtimeStatus: { state: "running" },
      metrics: {},
      upstreams: [{ id: "up-checked", name: "Checked", baseUrl: "https://api.example/v1", credentialRef: "cred", enabled: true, models: ["model"], lastCheckedAt: "2026-11-19T00:00:00.000Z" }],
      routes: [], usage: [], clientKeys: [],
    });
    expect(workspace.upstreams[0].status).toBe("已连接");
  });
});

it("forwards destructive commands and preserves structured upstream dependencies", async () => {
  const previous = Object.getOwnPropertyDescriptor(window, "desktopControls");
  const route = { id: "route-1", alias: "chat-model", inboundProtocol: "Chat" };
  const controls = {
    clearRequestLogs: vi.fn(async () => ({ deleted: true as const, removedCount: 4 })),
    permanentlyDeleteClientKey: vi.fn(async (id: string) => ({ id, deleted: true as const })),
    deleteUpstream: vi.fn(async () => ({ deleted: false as const, error: "upstream_in_use", routes: [route] })),
  };
  Object.defineProperty(window, "desktopControls", { configurable: true, value: controls });
  try {
    expect(await runtimeWorkspaceClient.clearRequestLogs!()).toEqual({ deleted: true, removedCount: 4 });
    expect(await runtimeWorkspaceClient.permanentlyDeleteClientKey!("key-1")).toEqual({ id: "key-1", deleted: true });
    expect(await runtimeWorkspaceClient.deleteUpstream!("up-1")).toEqual({ deleted: false, error: "upstream_in_use", routes: [route] });
    expect(controls.clearRequestLogs).toHaveBeenCalledOnce();
    expect(controls.permanentlyDeleteClientKey).toHaveBeenCalledWith("key-1");
    expect(controls.deleteUpstream).toHaveBeenCalledWith("up-1");
  } finally {
    if (previous) Object.defineProperty(window, "desktopControls", previous);
    else delete (window as Window & { desktopControls?: unknown }).desktopControls;
  }
});

it("forwards an upstream edit through the Desktop bridge without exposing a credential read", async () => {
  const previous = Object.getOwnPropertyDescriptor(window, "desktopControls");
  const controls = { updateUpstream: vi.fn(async () => ({ updated: true })) };
  Object.defineProperty(window, "desktopControls", { configurable: true, value: controls });
  try {
    const input = { name: "Renamed API", baseUrl: "https://new.example/v1" };
    expect(await runtimeWorkspaceClient.updateUpstream!("up/id", input)).toEqual({ updated: true });
    expect(controls.updateUpstream).toHaveBeenCalledWith("up/id", input);
    expect(fixtureWorkspaceClient).not.toHaveProperty("updateUpstream");
  } finally {
    if (previous) Object.defineProperty(window, "desktopControls", previous);
    else delete (window as Window & { desktopControls?: unknown }).desktopControls;
  }
});

it("maps measured metrics while preserving missing, zero and invalid historical values", () => {
  const state = { settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [], usage: [
    { requestId: "zero", createdAt: "2026-11-19T00:00:00.000Z", inboundProtocol: "Chat", outboundProtocol: "Res", status: "completed", stream: true, durationMs: 0, firstTokenMs: 0, upstreamHeadersMs: 0, upstreamFirstByteMs: 18, upstreamBodyMs: 72.5, upstreamChunkCount: 0, gatewayProcessingMs: 1.5, tokens: { input: 0, output: 12, cacheRead: 0, total: 12, private: "secret" } },
    { requestId: "legacy", status: "failed" },
    { requestId: "invalid", stream: "false", durationMs: -1, firstTokenMs: Infinity, upstreamHeadersMs: -2, upstreamFirstByteMs: Infinity, upstreamBodyMs: "72", upstreamChunkCount: 1.5, gatewayProcessingMs: NaN, tokens: { input: "100", output: -2, cacheWrite: 1.5 } },
  ] };
  const [zero, legacy, invalid] = mapRuntimeState(state).logs;
  expect(zero).toMatchObject({ stream: true, durationMs: 0, firstTokenMs: 0, upstreamHeadersMs: 0, upstreamFirstByteMs: 18, upstreamBodyMs: 72.5, upstreamChunkCount: 0, gatewayProcessingMs: 1.5, tokens: { input: 0, output: 12, cacheRead: 0, total: 12 } });
  expect(zero.tokens).not.toHaveProperty("private");
  expect(legacy.durationMs).toBeNull();
  expect(legacy.stream).toBeUndefined();
  expect(legacy.firstTokenMs).toBeUndefined();
  expect(legacy).not.toHaveProperty("upstreamHeadersMs");
  expect(invalid.durationMs).toBeNull();
  expect(invalid.stream).toBeUndefined();
  expect(invalid.firstTokenMs).toBeUndefined();
  expect(invalid).not.toHaveProperty("upstreamHeadersMs");
  expect(invalid).not.toHaveProperty("upstreamFirstByteMs");
  expect(invalid).not.toHaveProperty("upstreamBodyMs");
  expect(invalid).not.toHaveProperty("upstreamChunkCount");
  expect(invalid).not.toHaveProperty("gatewayProcessingMs");
  expect(invalid.tokens).toBeUndefined();
});

it("prefers the persisted upstream name, falls back by ID, and redacts unknown sources", () => {
  const workspace = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 },
    upstreams: [{ id: "up-current", name: "Current service", enabled: true, models: [] }],
    routes: [], clientKeys: [],
    usage: [
      { requestId: "snapshot", upstreamId: "up-current", upstreamName: "Renamed before display", status: "completed" },
      { requestId: "legacy", upstreamId: "up-current", status: "completed" },
      { requestId: "missing", upstreamId: "up-missing", status: "failed" },
    ],
  });

  expect(workspace.logs.map(({ id, upstream }) => [id, upstream])).toEqual([
    ["snapshot", "Renamed before display"],
    ["legacy", "Current service"],
    ["missing", "—"],
  ]);
});

it("maps an optional reasoning level and leaves legacy rows undefined", () => {
  const workspace = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 },
    upstreams: [], routes: [], clientKeys: [],
    usage: [
      { requestId: "reasoned", reasoningEffort: "high", status: "completed" },
      { requestId: "legacy", status: "completed" },
    ],
  });
  expect(workspace.logs.map(({ id, reasoning }) => [id, reasoning])).toEqual([["reasoned", "high"], ["legacy", undefined]]);
});

it("maps HTTP, upstream, and gateway status details without raw provider text", () => {
  const workspace = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [
      { requestId: "ok", status: "completed", httpStatus: 200 },
      { requestId: "upstream", status: "failed", upstreamStatus: 429, errorCode: "upstream_error" },
      { requestId: "adapter", status: "rejected", gatewayStatus: 400, errorCode: "unsupported_feature", errorField: "input.content", errorDirection: "Res->Chat" },
      { requestId: "reset", status: "failed", gatewayStatus: 502, errorCode: "upstream_connection_reset" },
      { requestId: "gateway", status: "failed", gatewayStatus: 400, errorCode: "unsupported_feature", providerMessage: "secret provider detail" },
    ],
  });
  expect(workspace.logs.map(({ id, httpStatus, upstreamStatus, gatewayStatus, error }) => [id, httpStatus, upstreamStatus, gatewayStatus, error])).toEqual([
    ["ok", 200, undefined, undefined, undefined],
    ["upstream", undefined, 429, undefined, "上游请求失败，请检查上游状态和日志"],
    ["adapter", undefined, undefined, 400, "当前目标协议无法表达该字段（字段 input.content，方向 Res->Chat）"],
    ["reset", undefined, undefined, 502, "上游连接被重置，请检查上游服务或网络"],
    ["gateway", undefined, undefined, 400, "当前请求包含不支持的协议特性"],
  ]);
  expect(JSON.stringify(workspace.logs)).not.toContain("secret provider detail");
});

it("preserves actual partial-stream statuses and only the three supported failure phases", () => {
  const { logs } = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [
      { status: "failed", stream: true, upstreamStatus: 200, gatewayStatus: 200, streamFailurePhase: "upstream_body", errorCode: "upstream_connection_reset", providerMessage: "private-provider-error", responseBody: "private-body" },
      { status: "failed", stream: true, gatewayStatus: 502, streamFailurePhase: "upstream_headers" },
      { status: "failed", stream: true, upstreamStatus: 200, gatewayStatus: 200, streamFailurePhase: "downstream_closed" },
      { status: "failed", gatewayStatus: 502 },
    ],
  });
  expect(logs[0]).toMatchObject({ status: "失败", stream: true, upstreamStatus: 200, gatewayStatus: 200, streamFailurePhase: "upstream_body" });
  expect(logs[1]).toMatchObject({ gatewayStatus: 502, streamFailurePhase: "upstream_headers" });
  expect(logs[2]).toMatchObject({ streamFailurePhase: "downstream_closed" });
  expect(logs[3].gatewayStatus).toBe(502);
  expect(logs[3]).not.toHaveProperty("streamFailurePhase");
  expect(JSON.stringify(logs)).not.toMatch(/private-provider-error|private-body|providerMessage|responseBody/);
});

it.each([100, 200, 502, 599])("accepts valid integer HTTP status %s at each log boundary", (code) => {
  const { logs } = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [{ httpStatus: code, upstreamStatus: code, gatewayStatus: code }],
  });
  expect(logs[0]).toMatchObject({ httpStatus: code, upstreamStatus: code, gatewayStatus: code });
});

it.each([0, 99, 600, -1, 200.5, NaN, Infinity, "200", null, {}, true, undefined])("omits invalid HTTP status %s instead of coercing it", (code) => {
  const { logs } = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [{ httpStatus: code, upstreamStatus: code, gatewayStatus: code }],
  });
  expect(logs[0].httpStatus).toBeUndefined();
  expect(logs[0].upstreamStatus).toBeUndefined();
  expect(logs[0].gatewayStatus).toBeUndefined();
});

it.each(["unknown", "UPSTREAM_BODY", "__proto__", "private-provider-error", "", null, 1, {}, undefined])("omits unknown failure phase %s", (phase) => {
  const { logs } = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [{ status: "failed", streamFailurePhase: phase }],
  });
  expect(logs[0]).not.toHaveProperty("streamFailurePhase");
});
