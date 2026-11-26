import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCodexGatewayPreferences } from "./codex-gateway-preferences";
import type {
  CodexGatewayPreferences,
  CodexStatus,
} from "../domain/codex-management";
const original = window.desktopControls;
const saved: CodexGatewayPreferences = {
  revision: "p1",
  exists: true,
  routeIds: ["two"],
  defaultRouteId: "two",
  credentialSource: "stored",
  credentialId: "key-two",
};
const status = {
  configPath: "C:/isolated/config.toml",
  configScope: "user",
  mode: "gateway",
  selectedRouteIds: ["one"],
  defaultRouteId: "one",
} as CodexStatus;
afterEach(() => {
  window.desktopControls = original;
  vi.useRealTimers();
});
function setup() {
  let value = saved;
  const get = vi.fn(async () => value);
  const save = vi.fn(async (input: any) => {
    value = {
      ...input,
      revision: "p" + (Number(value.revision.slice(1)) + 1),
      exists: true,
    };
    return value;
  });
  window.desktopControls = {
    getCodexGatewayPreferences: get,
    saveCodexGatewayPreferences: save,
  } as unknown as NonNullable<typeof window.desktopControls>;
  return { get, save };
}
describe("remembered Gateway draft", () => {
  it("restores saved unfinished model/default/credential choices instead of active config and survives remount", async () => {
    const { save } = setup();
    const first = renderHook(() => useCodexGatewayPreferences(status));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(first.result.current.draft).toMatchObject({
      routeIds: ["two"],
      defaultRouteId: "two",
      credentialSource: "stored",
      credentialId: "key-two",
    });
    act(() =>
      first.result.current.change({
        routeIds: ["one", "two"],
        defaultRouteId: "two",
        credentialSource: "manual",
      }),
    );
    first.unmount();
    const second = renderHook(() =>
      useCodexGatewayPreferences({ ...status, mode: "direct" }),
    );
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.draft).toEqual({
      routeIds: ["one", "two"],
      defaultRouteId: "two",
      credentialSource: "manual",
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(save.mock.calls)).not.toContain("clientKey");
  });
  it("does not overwrite newly edited choices with a delayed initial read", async () => {
    let finish!: (value: CodexGatewayPreferences) => void;
    const { save } = setup();
    window.desktopControls!.getCodexGatewayPreferences = vi.fn(
      () =>
        new Promise<CodexGatewayPreferences>((done) => {
          finish = done;
        }),
    );
    const { result } = renderHook(() => useCodexGatewayPreferences(status));
    act(() =>
      result.current.change({
        routeIds: ["new"],
        defaultRouteId: "new",
        credentialSource: "current",
      }),
    );
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    await act(async () => finish(saved));
    expect(result.current.draft.routeIds).toEqual(["new"]);
    await act(async () => result.current.flush());
    expect(save).toHaveBeenCalledWith({
      expectedRevision: "p1",
      routeIds: ["new"],
      defaultRouteId: "new",
      credentialSource: "current",
    });
  });
  it("seeds first use from active catalogue only when no draft exists", async () => {
    setup();
    window.desktopControls!.getCodexGatewayPreferences = vi
      .fn()
      .mockResolvedValue({
        ...saved,
        exists: false,
        routeIds: [],
        defaultRouteId: "",
        credentialSource: "current",
        credentialId: undefined,
      });
    const { result } = renderHook(() => useCodexGatewayPreferences(status));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.draft.routeIds).toEqual(["one"]);
    expect(result.current.draft.defaultRouteId).toBe("one");
  });
  it("shows corruption without overwriting the file or resetting selected user edits", async () => {
    const { save } = setup();
    window.desktopControls!.getCodexGatewayPreferences = vi
      .fn()
      .mockRejectedValue(new Error("CODEX_PREFERENCES_INVALID: private"));
    const { result } = renderHook(() => useCodexGatewayPreferences(status));
    await waitFor(() => expect(result.current.error).toMatch(/草稿/));
    act(() =>
      result.current.change({
        routeIds: ["new"],
        defaultRouteId: "new",
        credentialSource: "manual",
      }),
    );
    await act(async () => result.current.flush());
    expect(save).not.toHaveBeenCalled();
    expect(result.current.error).not.toContain("private");
  });
  it("hydrates in StrictMode and serializes debounced saves with newest choices retained", async () => {
    const { save } = setup();
    const { result } = renderHook(() => useCodexGatewayPreferences(status), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.useFakeTimers();
    act(() =>
      result.current.change({
        routeIds: ["one"],
        defaultRouteId: "one",
        credentialSource: "current",
      }),
    );
    act(() =>
      result.current.change({
        routeIds: ["one", "two"],
        defaultRouteId: "two",
        credentialSource: "stored",
        credentialId: "key-two",
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.message).toMatch(/草稿已记住.*未应用/);
    expect(result.current.draft.routeIds).toEqual(["one", "two"]);
  });
  it("queues a later draft behind an in-flight save and uses the returned revision", async () => {
    const { save } = setup();
    let finish!: (value: CodexGatewayPreferences) => void;
    save.mockImplementationOnce(
      () =>
        new Promise<CodexGatewayPreferences>((done) => {
          finish = done;
        }),
    );
    const { result } = renderHook(() => useCodexGatewayPreferences(status));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.change({
        routeIds: ["one"],
        defaultRouteId: "one",
        credentialSource: "current",
      }),
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.flush();
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    act(() =>
      result.current.change({
        routeIds: ["one", "two"],
        defaultRouteId: "two",
        credentialSource: "manual",
      }),
    );
    await act(async () => {
      finish({
        ...saved,
        revision: "p2",
        routeIds: ["one"],
        defaultRouteId: "one",
        credentialSource: "current",
        credentialId: undefined,
      });
      await first;
    });
    expect(save).toHaveBeenLastCalledWith({
      expectedRevision: "p2",
      routeIds: ["one", "two"],
      defaultRouteId: "two",
      credentialSource: "manual",
    });
  });
  it("reports failed save without claiming memory success and retries only after fresh revision read", async () => {
    const { save } = setup();
    save.mockRejectedValueOnce(new Error("CODEX_PREFERENCES_CHANGED: raw"));
    const { result } = renderHook(() => useCodexGatewayPreferences(status));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.change({
        routeIds: ["one"],
        defaultRouteId: "one",
        credentialSource: "manual",
      }),
    );
    await act(async () => result.current.flush());
    expect(result.current.error).toMatch(/草稿保存失败/);
    expect(result.current.message).not.toMatch(/已记住/);
    expect(result.current.error).not.toContain("raw");
    await act(async () => result.current.retry());
    await act(async () => result.current.flush());
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.draft.credentialSource).toBe("manual");
  });
  it("flushes an edit made before the initial read completes when navigation unmounts the page", async () => {
    let finish!: (value: CodexGatewayPreferences) => void;
    const { get, save } = setup();
    get.mockImplementationOnce(
      () =>
        new Promise<CodexGatewayPreferences>((done) => {
          finish = done;
        }),
    );
    const first = renderHook(() => useCodexGatewayPreferences(status));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    act(() =>
      first.result.current.change({
        routeIds: ["early"],
        defaultRouteId: "early",
        credentialSource: "manual",
      }),
    );
    first.unmount();
    const second = renderHook(() => useCodexGatewayPreferences(status));
    await act(async () => finish(saved));
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.draft.routeIds).toEqual(["early"]);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("drains A then pending B before a remount reads, and saves later C against B's revision", async () => {
    let value: CodexGatewayPreferences = { ...saved };
    let finishA!: () => void;
    let calls = 0;
    const get = vi.fn(async () => ({
      ...value,
      routeIds: [...value.routeIds],
    }));
    const save = vi.fn(async (input: any) => {
      calls += 1;
      if (calls === 1)
        await new Promise<void>((done) => {
          finishA = done;
        });
      if (input.expectedRevision !== value.revision)
        throw new Error("CODEX_PREFERENCES_CHANGED");
      value = {
        ...input,
        exists: true,
        revision: "p" + (Number(value.revision.slice(1)) + 1),
      };
      return value;
    });
    window.desktopControls = {
      getCodexGatewayPreferences: get,
      saveCodexGatewayPreferences: save,
    } as unknown as NonNullable<typeof window.desktopControls>;
    const first = renderHook(() => useCodexGatewayPreferences(status));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    act(() =>
      first.result.current.change({
        routeIds: ["A"],
        defaultRouteId: "A",
        credentialSource: "current",
      }),
    );
    let drain!: Promise<void>;
    act(() => {
      drain = first.result.current.flush();
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    act(() =>
      first.result.current.change({
        routeIds: ["B"],
        defaultRouteId: "B",
        credentialSource: "manual",
      }),
    );
    first.unmount();
    const second = renderHook(() => useCodexGatewayPreferences(status));
    await act(async () => {
      finishA();
      await drain;
    });
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.draft.routeIds).toEqual(["B"]);
    expect(value.routeIds).toEqual(["B"]);
    act(() =>
      second.result.current.change({
        routeIds: ["C"],
        defaultRouteId: "C",
        credentialSource: "current",
      }),
    );
    await act(async () => second.result.current.flush());
    expect(save).toHaveBeenLastCalledWith({
      expectedRevision: "p3",
      routeIds: ["C"],
      defaultRouteId: "C",
      credentialSource: "current",
    });
    expect(second.result.current.error).toBe("");
    expect(value.routeIds).toEqual(["C"]);
  });
  it("persists an untouched first-use active Gateway seed before switching to direct and remounting", async () => {
    let value: CodexGatewayPreferences = {
      revision: "p0",
      exists: false,
      routeIds: [],
      defaultRouteId: "",
      credentialSource: "current",
    };
    const save = vi.fn(async (input: any) => {
      value = { ...input, exists: true, revision: "p1" };
      return value;
    });
    window.desktopControls = {
      getCodexGatewayPreferences: vi.fn(async () => value),
      saveCodexGatewayPreferences: save,
    } as unknown as NonNullable<typeof window.desktopControls>;
    const first = renderHook(
      ({ config }) => useCodexGatewayPreferences(config),
      { initialProps: { config: status } },
    );
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    first.rerender({ config: { ...status, mode: "direct" } });
    first.unmount();
    const second = renderHook(() =>
      useCodexGatewayPreferences({ ...status, mode: "direct" }),
    );
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.draft.routeIds).toEqual(["one"]);
    expect(second.result.current.draft.defaultRouteId).toBe("one");
    expect(save).toHaveBeenCalledTimes(1);
    expect(value.exists).toBe(true);
  });
  it("persists the first-use Gateway seed when native configuration status arrives after memory", async () => {
    let value: CodexGatewayPreferences = {
      revision: "p0",
      exists: false,
      routeIds: [],
      defaultRouteId: "",
      credentialSource: "current",
    };
    const save = vi.fn(async (input: any) => {
      value = { ...input, exists: true, revision: "p1" };
      return value;
    });
    window.desktopControls = {
      getCodexGatewayPreferences: vi.fn(async () => value),
      saveCodexGatewayPreferences: save,
    } as unknown as NonNullable<typeof window.desktopControls>;
    const first = renderHook(
      ({ config }: { config: CodexStatus | null }) =>
        useCodexGatewayPreferences(config),
      { initialProps: { config: null as CodexStatus | null } },
    );
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    first.rerender({ config: status });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    first.unmount();
    const second = renderHook(() =>
      useCodexGatewayPreferences({ ...status, mode: "direct" }),
    );
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.draft.routeIds).toEqual(["one"]);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("a repeated flush waits for the active save even when it has no new pending draft", async () => {
    const { save } = setup();
    let finish!: (value: CodexGatewayPreferences) => void;
    save.mockImplementationOnce(
      () =>
        new Promise<CodexGatewayPreferences>((done) => {
          finish = done;
        }),
    );
    const { result } = renderHook(() => useCodexGatewayPreferences(status));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() =>
      result.current.change({
        routeIds: ["one"],
        defaultRouteId: "one",
        credentialSource: "current",
      }),
    );
    let first!: Promise<void>;
    act(() => {
      first = result.current.flush();
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    let secondSettled = false;
    let second!: Promise<void>;
    act(() => {
      second = result.current.flush().then(() => {
        secondSettled = true;
      });
    });
    await act(async () => {});
    expect(secondSettled).toBe(false);
    await act(async () => {
      finish({
        ...saved,
        revision: "p2",
        routeIds: ["one"],
        defaultRouteId: "one",
        credentialSource: "current",
        credentialId: undefined,
      });
      await Promise.all([first, second]);
    });
    expect(secondSettled).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
