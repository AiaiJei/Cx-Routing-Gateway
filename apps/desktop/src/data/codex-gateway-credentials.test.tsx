import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCodexGatewayCredentials } from "./codex-gateway-credentials";
const original = window.desktopControls;
const legacy = {
  id: "legacy",
  name: "legacy",
  scope: ["one"],
  enabled: true,
  secretAvailable: false,
  current: true,
};
const list = {
  credentials: [legacy],
  currentCredentialId: "legacy",
  currentConfigured: true,
};
function setup() {
  const retain = vi
    .fn()
    .mockResolvedValue({
      ...list,
      credentials: [{ ...legacy, secretAvailable: true }],
    });
  window.desktopControls = {
    getCodexGatewayPreferences: vi.fn(),
    saveCodexGatewayPreferences: vi.fn(),
    getCodexGatewayCredentials: vi.fn().mockResolvedValue(list),
    retainCodexGatewayCredential: retain,
  } as unknown as NonNullable<typeof window.desktopControls>;
  return { retain };
}
afterEach(() => {
  window.desktopControls = original;
});
describe("Gateway credential metadata boundary", () => {
  it("retains legacy original only explicitly and validates unavailable, revoked and model scopes", async () => {
    const { retain } = setup();
    const { result } = renderHook(() => useCodexGatewayCredentials());
    await waitFor(() => expect(result.current.data).toEqual(list));
    expect(result.current.validate("legacy", ["one"])).toMatch(/旧凭证/);
    expect(retain).not.toHaveBeenCalled();
    await act(async () => {
      expect(
        await result.current.retain({ id: "legacy", key: "original-key" }),
      ).toBe(true);
    });
    expect(result.current.validate("legacy", ["one"])).toBe("");
    expect(result.current.validate("legacy", ["two"])).toMatch(/未授权/);
    expect(result.current.validate("removed", ["one"])).toMatch(/不可用/);
    expect(JSON.stringify(result.current.data)).not.toContain("original-key");
  });
  it("sanitizes wrong original Key failure and keeps legacy metadata unchanged", async () => {
    const { retain } = setup();
    retain.mockRejectedValue(
      new Error("CODEX_CREDENTIAL_MISMATCH: original-key"),
    );
    const { result } = renderHook(() => useCodexGatewayCredentials());
    await waitFor(() => expect(result.current.data).toEqual(list));
    await act(async () => {
      expect(
        await result.current.retain({ id: "legacy", key: "wrong-key" }),
      ).toBe(false);
    });
    expect(result.current.error).toMatch(/不匹配/);
    expect(result.current.error).not.toContain("original-key");
    expect(result.current.data).toEqual(list);
    expect(result.current.busy).toBe(false);
  });
});
