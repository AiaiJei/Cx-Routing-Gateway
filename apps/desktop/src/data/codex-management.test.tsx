import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCodexManagement } from "./codex-management";
import { defaultWorkspaceClient } from "./workspace-client";
import type { ModelRoute } from "../domain/types";
import type { CodexStatus, CodexPreview } from "../domain/codex-management";
const original = window.desktopControls;
const client = { ...defaultWorkspaceClient };
const routes: ModelRoute[] = [
  {
    id: "one",
    alias: "model-one",
    enabled: true,
    inboundProtocol: "Res",
    outboundProtocol: "Chat",
    targets: [{ upstreamId: "up", upstreamModel: "model" }],
  },
  {
    id: "two",
    alias: "model-two",
    enabled: true,
    inboundProtocol: "Res",
    outboundProtocol: "Res",
    targets: [{ upstreamId: "up", upstreamModel: "second" }],
  },
];
const status: CodexStatus = {
  configPath: "C:/test/config.toml",
  configScope: "user",
  exists: true,
  revision: "before",
  configured: true,
  mode: "gateway",
  model: "model-one",
  selectedRouteIds: ["one"],
  selectedModelAliases: ["model-one"],
  defaultRouteId: "one",
  catalogStatus: "managed",
  credentialConfigured: true,
  backup: { id: "backup-one", createdAt: "2026-11-26T00:00:00Z" },
};
const saved: CodexStatus = { ...status, revision: "after" };
const preview: CodexPreview = {
  configPath: status.configPath,
  revision: status.revision,
  mode: "gateway",
  model: "model-one",
  baseUrl: "http://127.0.0.1:4318/v1",
  configPreview: "redacted",
  selectedModelAliases: ["model-one"],
  replacesCurrentProvider: true,
  changes: [],
};
beforeEach(() => {
  window.desktopControls = {
    getCodexStatus: vi.fn().mockResolvedValue(status),
    previewCodexConfig: vi.fn().mockResolvedValue(preview),
    applyCodexConfig: vi.fn().mockResolvedValue(saved),
    restoreCodexConfig: vi.fn().mockResolvedValue(status),
  } as unknown as NonNullable<typeof window.desktopControls>;
});
afterEach(() => {
  window.desktopControls = original;
  Object.assign(defaultWorkspaceClient, client);
});
describe("Codex inline activation lifecycle", () => {
  it("keeps committed apply result and releases the operation after invalidation", async () => {
    let finish!: (value: CodexStatus) => void;
    window.desktopControls!.applyCodexConfig = vi.fn(
      () =>
        new Promise<CodexStatus>((done) => {
          finish = done;
        }),
    );
    const { result } = renderHook(() => useCodexManagement(routes, true));
    await waitFor(() => expect(result.current.routeIds).toEqual(["one"]));
    await act(async () =>
      result.current.beginEnable(result.current.gatewaySelection()),
    );
    let operation!: Promise<boolean>;
    act(() => {
      operation = result.current.confirmAction();
    });
    act(() => result.current.invalidate());
    await act(async () => {
      finish(saved);
      await operation;
    });
    expect(result.current.status).toEqual(saved);
    expect(result.current.message).toMatch(/网关配置已保存并启用/);
    expect(result.current.busy).toBeNull();
    expect(result.current.confirmation).toBeNull();
  });
  it("retains newly-created all-model scoped Key after invalidation", async () => {
    let finish!: (value: { id: string; key: string }) => void;
    defaultWorkspaceClient.createClientKey = vi.fn(
      () =>
        new Promise<{ id: string; key: string }>((done) => {
          finish = done;
        }),
    );
    const { result } = renderHook(() => useCodexManagement(routes, true));
    await waitFor(() => expect(result.current.routeIds).toEqual(["one"]));
    act(() => result.current.changeModels(["one", "two"]));
    act(() => result.current.setConfirmation("create"));
    let operation!: Promise<boolean>;
    act(() => {
      operation = result.current.confirmAction();
    });
    act(() => result.current.invalidate());
    await act(async () => {
      finish({ id: "key", key: "cxrg_test" });
      await operation;
    });
    expect(result.current.keyScope).toEqual(["model-one", "model-two"]);
    expect(result.current.clientKey).toBe("cxrg_test");
    expect(result.current.busy).toBeNull();
  });
  it("uses selected direct profile and library revision while Gateway is unavailable", async () => {
    const { result } = renderHook(() => useCodexManagement(routes, false));
    await waitFor(() => expect(result.current.status).toEqual(status));
    await act(async () =>
      result.current.beginEnable({
        mode: "direct",
        profileId: "profile",
        profilesRevision: "library",
      }),
    );
    expect(window.desktopControls!.previewCodexConfig).toHaveBeenCalledWith({
      mode: "direct",
      profileId: "profile",
      profilesRevision: "library",
    });
  });
  it("blocks Gateway activation during workspace refresh with a readable error", async () => {
    const { result } = renderHook(() => useCodexManagement(routes, false));
    await waitFor(() => expect(result.current.status).toEqual(status));
    await act(async () =>
      result.current.beginEnable(result.current.gatewaySelection()),
    );
    expect(result.current.error).toMatch(/Gateway 工作区尚未就绪/);
    expect(window.desktopControls!.previewCodexConfig).not.toHaveBeenCalled();
  });
  it("bounds models and constrains default", async () => {
    const many = Array.from({ length: 120 }, (_, index) => ({
      ...routes[0],
      id: "r" + index,
      alias: "m" + index,
    }));
    const { result } = renderHook(() => useCodexManagement(many, true));
    await waitFor(() => expect(result.current.status).toEqual(status));
    act(() => result.current.changeModels(many.map((route) => route.id)));
    expect(result.current.routeIds).toHaveLength(100);
    expect(result.current.defaultRouteId).toBe("r0");
    act(() => result.current.changeDefault("bad"));
    expect(result.current.defaultRouteId).toBe("r0");
  });
  it("releases a failed restore after invalidation with safe error", async () => {
    let fail!: (error: Error) => void;
    window.desktopControls!.restoreCodexConfig = vi.fn(
      () =>
        new Promise<CodexStatus>((_, reject) => {
          fail = reject;
        }),
    );
    const { result } = renderHook(() => useCodexManagement(routes, true));
    await waitFor(() => expect(result.current.status).toEqual(status));
    act(() => result.current.setConfirmation("restore"));
    let operation!: Promise<boolean>;
    act(() => {
      operation = result.current.confirmAction();
    });
    act(() => result.current.invalidate());
    await act(async () => {
      fail(new Error("CODEX_CONFIG_CHANGED: raw"));
      await operation;
    });
    expect(result.current.error).toMatch(/已被其他程序修改/);
    expect(result.current.busy).toBeNull();
  });
});
