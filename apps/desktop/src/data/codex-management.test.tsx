import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCodexManagement } from "./codex-management";
import { defaultWorkspaceClient } from "./workspace-client";
import type { ModelRoute } from "../domain/types";

const originalControls = window.desktopControls;
const originalClient = { ...defaultWorkspaceClient };
const route: ModelRoute = { id: "one", alias: "model-one", enabled: true, inboundProtocol: "Res", outboundProtocol: "Chat", targets: [{ upstreamId: "up", upstreamModel: "model" }] };
const status = { configPath: "C:/test/config.toml", exists: true, revision: "before", configured: false, credentialConfigured: false, backup: { id: "backup-one", createdAt: "2026-11-25T00:00:00Z" } };
const saved = { ...status, revision: "after", configured: true, model: "model-one", credentialConfigured: true };
const preview = { configPath: status.configPath, revision: status.revision, model: "model-one", baseUrl: "http://127.0.0.1:4318/v1", configPreview: "redacted", replacesCurrentProvider: true };

beforeEach(() => {
  window.desktopControls = {
    getCodexStatus: vi.fn().mockResolvedValue(status), previewCodexConfig: vi.fn().mockResolvedValue(preview),
    applyCodexConfig: vi.fn().mockResolvedValue(saved), restoreCodexConfig: vi.fn().mockResolvedValue(status),
  } as unknown as NonNullable<typeof window.desktopControls>;
});
afterEach(() => { window.desktopControls = originalControls; Object.assign(defaultWorkspaceClient, originalClient); });

describe("Codex mutation result handling", () => {
  it("keeps a committed apply result and releases the operation after preview invalidation", async () => {
    let finish!: (value: typeof saved) => void;
    window.desktopControls!.applyCodexConfig = vi.fn(() => new Promise<typeof saved>(done => { finish = done; }));
    const { result } = renderHook(() => useCodexManagement(true, route));
    await waitFor(() => expect(result.current.status).toEqual(status));
    act(() => result.current.changeClientKey("cxrg_test"));
    await act(async () => result.current.requestPreview());
    act(() => result.current.setConfirmation("apply"));
    let operation!: Promise<void>;
    act(() => { operation = result.current.confirmAction(); });
    act(() => result.current.invalidate());
    await act(async () => { finish(saved); await operation; });
    expect(result.current.status).toEqual(saved);
    expect(result.current.message).toMatch(/配置已保存/);
    expect(result.current.clientKey).toBe("");
    expect(result.current.busy).toBeNull();
    expect(result.current.confirmation).toBeNull();
  });

  it("keeps a committed restore result and releases the operation after preview invalidation", async () => {
    let finish!: (value: typeof saved) => void;
    window.desktopControls!.restoreCodexConfig = vi.fn(() => new Promise<typeof saved>(done => { finish = done; }));
    const { result } = renderHook(() => useCodexManagement(true, route));
    await waitFor(() => expect(result.current.status).toEqual(status));
    act(() => result.current.setConfirmation("restore"));
    let operation!: Promise<void>;
    act(() => { operation = result.current.confirmAction(); });
    act(() => result.current.invalidate());
    await act(async () => { finish(saved); await operation; });
    expect(result.current.status).toEqual(saved);
    expect(result.current.message).toMatch(/已恢复备份/);
    expect(result.current.busy).toBeNull();
    expect(result.current.confirmation).toBeNull();
  });

  it("retains a newly created Key with its original model scope when the route changes", async () => {
    let finish!: (value: { id: string; key: string }) => void;
    defaultWorkspaceClient.createClientKey = vi.fn(() => new Promise<{ id: string; key: string }>(done => { finish = done; }));
    const { result, rerender } = renderHook(({ selected }) => useCodexManagement(true, selected), { initialProps: { selected: route } });
    await waitFor(() => expect(result.current.status).toEqual(status));
    act(() => result.current.setConfirmation("create"));
    let operation!: Promise<void>;
    act(() => { operation = result.current.confirmAction(); });
    rerender({ selected: { ...route, id: "two", alias: "model-two" } });
    act(() => result.current.invalidate());
    await act(async () => { finish({ id: "key-one", key: "cxrg_created_test" }); await operation; });
    expect(result.current.clientKey).toBe("cxrg_created_test");
    expect(result.current.message).toMatch(/model-one/);
    expect(result.current.busy).toBeNull();
    expect(result.current.confirmation).toBeNull();
  });

  it("releases a failed mutation after invalidation and retains a safe actionable error", async () => {
    let fail!: (error: Error) => void;
    window.desktopControls!.restoreCodexConfig = vi.fn(() => new Promise<typeof status>((_, reject) => { fail = reject; }));
    const { result } = renderHook(() => useCodexManagement(true, route));
    await waitFor(() => expect(result.current.status).toEqual(status));
    act(() => result.current.setConfirmation("restore"));
    let operation!: Promise<void>;
    act(() => { operation = result.current.confirmAction(); });
    act(() => result.current.invalidate());
    await act(async () => { fail(new Error("CODEX_CONFIG_CHANGED: raw-content")); await operation; });
    expect(result.current.status).toEqual(status);
    expect(result.current.error).toMatch(/配置已被其他程序修改/);
    expect(result.current.error).not.toContain("raw-content");
    expect(result.current.busy).toBeNull();
    expect(result.current.confirmation).toBeNull();
  });
});
