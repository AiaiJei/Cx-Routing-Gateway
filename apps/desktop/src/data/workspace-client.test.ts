import { describe, expect, it } from "vitest";
import { fixtureWorkspaceClient, mapRuntimeState } from "./workspace-client";

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
