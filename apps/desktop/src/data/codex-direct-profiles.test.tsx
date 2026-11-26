import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCodexDirectProfiles } from "./codex-direct-profiles";
import type {
  CodexDirectProfiles,
  CodexStatus,
} from "../domain/codex-management";
const original = window.desktopControls;
const status: CodexStatus = {
  configPath: "C:/test/config.toml",
  configScope: "user",
  exists: true,
  revision: "config-before",
  configured: false,
  mode: "direct",
  direct: { kind: "custom", name: "current", importable: true },
  credentialConfigured: true,
  selectedRouteIds: [],
  selectedModelAliases: [],
  catalogStatus: "none",
};
const library: CodexDirectProfiles = {
  revision: "library-before",
  secureStorageAvailable: true,
  profiles: [
    {
      id: "official",
      kind: "official",
      name: "官方默认",
      models: [],
      credentialConfigured: false,
      editable: false,
      active: false,
    },
    {
      id: "one",
      kind: "custom",
      name: "one",
      baseUrl: "https://one.example/v1",
      models: ["one"],
      defaultModel: "one",
      credentialConfigured: true,
      editable: true,
      active: false,
    },
  ],
  lastDirectProfileId: "one",
};
beforeEach(() => {
  window.desktopControls = {
    getCodexDirectProfiles: vi.fn().mockResolvedValue(library),
    saveCodexDirectProfile: vi
      .fn()
      .mockResolvedValue({ ...library, revision: "saved" }),
    importCodexDirectProfile: vi.fn().mockResolvedValue(library),
    duplicateCodexDirectProfile: vi.fn().mockResolvedValue(library),
    deleteCodexDirectProfile: vi.fn().mockResolvedValue(library),
  } as unknown as NonNullable<typeof window.desktopControls>;
});
afterEach(() => {
  window.desktopControls = original;
});
describe("Codex direct profile library lifecycle", () => {
  it("does not infer official for unsaved current custom config and ignores late hydration over edited selection", async () => {
    let finish!: (value: CodexDirectProfiles) => void;
    window.desktopControls!.getCodexDirectProfiles = vi.fn(
      () =>
        new Promise<CodexDirectProfiles>((done) => {
          finish = done;
        }),
    );
    const { result } = renderHook(() => useCodexDirectProfiles(status));
    act(() => result.current.select("one"));
    await act(async () => finish(library));
    expect(result.current.selectedId).toBe("one");
  });
  it("recovers current profile list under StrictMode and discards stale first result", async () => {
    const finish: ((value: CodexDirectProfiles) => void)[] = [];
    window.desktopControls!.getCodexDirectProfiles = vi.fn(
      () => new Promise<CodexDirectProfiles>((done) => finish.push(done)),
    );
    const { result } = renderHook(() => useCodexDirectProfiles(status), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(finish).toHaveLength(2));
    await act(async () => finish[1](library));
    expect(result.current.library?.revision).toBe("library-before");
    expect(result.current.busy).toBe(false);
    await act(async () => finish[0]({ ...library, revision: "obsolete" }));
    expect(result.current.library?.revision).toBe("library-before");
  });
  it("returns failed save without losing library and sanitizes unsafe error content", async () => {
    window.desktopControls!.saveCodexDirectProfile = vi
      .fn()
      .mockRejectedValue(new Error("CODEX_PROFILES_CHANGED: private"));
    const { result } = renderHook(() => useCodexDirectProfiles(status));
    await waitFor(() => expect(result.current.library).toEqual(library));
    await act(async () => {
      expect(
        await result.current.mutate("save", {
          name: "draft",
          baseUrl: "https://example/v1",
          models: ["m"],
          defaultModel: "m",
          apiKey: "secret",
        }),
      ).toBe(false);
    });
    expect(result.current.error).toMatch(/方案库已被其他操作修改/);
    expect(result.current.error).not.toContain("private");
    expect(result.current.library).toEqual(library);
    expect(result.current.busy).toBe(false);
  });
  it("keeps a completed library mutation result when refresh is requested during its write", async () => {
    let finish!: (value: CodexDirectProfiles) => void;
    window.desktopControls!.saveCodexDirectProfile = vi.fn(
      () =>
        new Promise<CodexDirectProfiles>((done) => {
          finish = done;
        }),
    );
    const { result } = renderHook(() => useCodexDirectProfiles(status));
    await waitFor(() => expect(result.current.library).toEqual(library));
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.mutate("save", {
        id: "one",
        name: "one",
        baseUrl: "https://one.example/v1",
        models: ["one"],
        defaultModel: "one",
      });
    });
    await act(async () => result.current.refresh());
    await act(async () => {
      finish({ ...library, revision: "saved" });
      await pending;
    });
    expect(result.current.library?.revision).toBe("saved");
    expect(result.current.message).toMatch(/未启用/);
    expect(result.current.busy).toBe(false);
  });
});
