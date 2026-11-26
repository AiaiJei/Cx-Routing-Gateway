import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCodexLogin } from "./codex-login";
import type { CodexClientStatus, CodexStatus } from "../domain/codex-management";

const original = window.desktopControls;
const signedOut: CodexClientStatus = { available: true, version: "0.167.0", auth: "signed_out", login: "idle" };
const official: CodexStatus = { configPath: "C:/test/config.toml", configScope: "user", exists: true, revision: "official-revision", mode: "direct", direct: { kind: "official", name: "官方默认", importable: false }, configured: false, credentialConfigured: false, catalogStatus: "none", selectedModelAliases: [], selectedRouteIds: [] };
beforeEach(() => {
  window.desktopControls = { getCodexClientStatus: vi.fn().mockResolvedValue(signedOut), startCodexLogin: vi.fn().mockResolvedValue({ ...signedOut, auth: "unknown", login: "pending" }), cancelCodexLogin: vi.fn().mockResolvedValue(signedOut) } as unknown as NonNullable<typeof window.desktopControls>;
});
afterEach(() => { window.desktopControls = original; vi.useRealTimers(); });

describe("Codex official login lifecycle", () => {
  it("settles initial login status under StrictMode and ignores only the discarded first read", async () => {
    const finish: ((value: CodexClientStatus) => void)[] = [];
    const check = vi.fn(() => new Promise<CodexClientStatus>(done => { finish.push(done); }));
    window.desktopControls!.getCodexClientStatus = check;
    const { result } = renderHook(() => useCodexLogin(), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    await act(async () => finish[0]({ ...signedOut, auth: "api" }));
    expect(result.current.status).toBeNull(); expect(result.current.busy).toBe(true);
    await act(async () => finish[1](signedOut));
    expect(result.current.status).toEqual(signedOut); expect(result.current.busy).toBe(false);
    await act(async () => result.current.login(official));
    expect(result.current.status?.login).toBe("pending");
    expect(window.desktopControls!.startCodexLogin).toHaveBeenCalledTimes(1);
  });

  it("requires saved direct official scheme and keeps pending distinct from authenticated", async () => {
    const { result } = renderHook(() => useCodexLogin());
    await waitFor(() => expect(result.current.status?.auth).toBe("signed_out"));
    await act(async () => result.current.login({ ...official, mode: "gateway" }));
    await act(async () => result.current.login({ ...official, mode: "unknown", direct: undefined }));
    await act(async () => result.current.login({ ...official, direct: { kind: "custom", name: "Third-party", importable: true } }));
    await act(async () => result.current.login({ ...official, direct: { kind: "snapshot", name: "Imported", importable: true } }));
    await act(async () => result.current.login({ ...official, direct: undefined }));
    expect(window.desktopControls!.startCodexLogin).not.toHaveBeenCalled();
    await act(async () => result.current.login(official));
    expect(result.current.status?.login).toBe("pending"); expect(result.current.status?.auth).toBe("unknown");
    expect(window.desktopControls!.startCodexLogin).toHaveBeenCalledWith({ expectedRevision: "official-revision" });
    await act(async () => result.current.cancel());
    expect(result.current.status).toEqual(signedOut);
  });

  it("polls a pending login to an independently checked final auth state", async () => {
    const check = vi.fn().mockResolvedValueOnce(signedOut).mockResolvedValueOnce({ ...signedOut, auth: "chatgpt", login: "succeeded" });
    window.desktopControls!.getCodexClientStatus = check;
    const { result } = renderHook(() => useCodexLogin());
    await waitFor(() => expect(result.current.status).toEqual(signedOut));
    vi.useFakeTimers();
    await act(async () => result.current.login(official));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(result.current.status?.auth).toBe("chatgpt"); expect(result.current.status?.login).toBe("succeeded");
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("recovers pending polling after a temporary status read failure without raw output", async () => {
    const check = vi.fn().mockResolvedValueOnce(signedOut).mockRejectedValueOnce(new Error("raw login token")).mockResolvedValueOnce({ ...signedOut, login: "succeeded" });
    window.desktopControls!.getCodexClientStatus = check;
    const { result } = renderHook(() => useCodexLogin());
    await waitFor(() => expect(result.current.status).toEqual(signedOut));
    vi.useFakeTimers(); await act(async () => result.current.login(official));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(result.current.error).not.toContain("raw login token");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(result.current.status?.login).toBe("succeeded"); expect(result.current.status?.auth).toBe("signed_out");
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("sanitizes login errors and keeps confirmation available for retry", async () => {
    window.desktopControls!.startCodexLogin = vi.fn().mockRejectedValue(new Error("CODEX_LOGIN_FAILED: private-code"));
    const { result } = renderHook(() => useCodexLogin());
    await waitFor(() => expect(result.current.status).toEqual(signedOut));
    act(() => result.current.setConfirming(true)); await act(async () => result.current.login(official));
    expect(result.current.error).toMatch(/官方 Codex 登录未完成/);
    expect(result.current.error).not.toContain("private-code"); expect(result.current.busy).toBe(false); expect(result.current.confirming).toBe(false);
  });
});
