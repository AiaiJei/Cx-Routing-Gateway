import { StrictMode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceFixtures } from "./fixtures";
import { fixtureWorkspaceClient, type WorkspaceClient } from "./workspace-client";
import { useWorkspace } from "./use-workspace";
import type { WorkspaceFixtures } from "../domain/types";

function snapshot(id: string): WorkspaceFixtures {
  return { ...structuredClone(workspaceFixtures), logs: [{ ...workspaceFixtures.logs[0], id }] };
}

function deferred() {
  let resolve!: (data: WorkspaceFixtures) => void;
  const promise = new Promise<WorkspaceFixtures>((done) => { resolve = done; });
  return { promise, resolve };
}

async function tick(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe("workspace refresh lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("keeps default consumers one-shot but supports manual refresh", async () => {
    let latest = snapshot("old");
    const client = { ...fixtureWorkspaceClient, getWorkspace: vi.fn(async () => latest) };
    const { result } = renderHook(() => useWorkspace(client));
    await tick();
    latest = snapshot("new");
    await tick(5000);
    expect(result.current.data.logs[0].id).toBe("old");
    act(() => result.current.refresh());
    await tick();
    expect(result.current.data.logs[0].id).toBe("new");
  });

  it("shows a new snapshot at the next 1500 ms poll without first-load flicker", async () => {
    let latest = snapshot("old");
    const client = { ...fixtureWorkspaceClient, getWorkspace: async () => latest };
    const { result } = renderHook(() => useWorkspace(client, { pollIntervalMs: 1500 }));
    await tick();
    latest = snapshot("arrived");
    await tick(1499);
    expect(result.current.data.logs[0].id).toBe("old");
    await tick(1);
    expect(result.current.data.logs[0].id).toBe("arrived");
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(false);
  });

  it("joins a slow background read when clicked and skips overlapping ticks", async () => {
    const pending = deferred();
    const client = { ...fixtureWorkspaceClient, getWorkspace: vi.fn().mockResolvedValueOnce(snapshot("old")).mockReturnValue(pending.promise) };
    const { result } = renderHook(() => useWorkspace(client, { pollIntervalMs: 1500 }));
    await tick();
    await tick(1500);
    expect(result.current.refreshing).toBe(false);
    act(() => { result.current.refresh(); result.current.refresh(); });
    expect(result.current.refreshing).toBe(true);
    await tick(6000);
    expect(client.getWorkspace).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.data.logs[0].id).toBe("old");
    await act(async () => pending.resolve(snapshot("new")));
    expect(result.current.refreshing).toBe(false);
    expect(result.current.data.logs[0].id).toBe("new");
  });

  it("automatically retries an initial failure", async () => {
    const client = { ...fixtureWorkspaceClient, getWorkspace: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(snapshot("recovered")) };
    const { result } = renderHook(() => useWorkspace(client, { pollIntervalMs: 1500 }));
    await tick();
    expect(result.current.error).toBe("offline");
    await tick(1500);
    expect(result.current.error).toBe("");
    expect(result.current.data.logs[0].id).toBe("recovered");
  });

  it("retains the last successful snapshot on refresh failure and clears feedback on recovery", async () => {
    const client = { ...fixtureWorkspaceClient, getWorkspace: vi.fn().mockResolvedValueOnce(snapshot("old")).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(snapshot("recovered")) };
    const { result } = renderHook(() => useWorkspace(client, { pollIntervalMs: 1500 }));
    await tick();
    await tick(1500);
    expect(result.current.data.logs[0].id).toBe("old");
    expect(result.current.error).toBe("");
    expect(result.current.refreshError).toBe("offline");
    await tick(1500);
    expect(result.current.data.logs[0].id).toBe("recovered");
    expect(result.current.refreshError).toBe("");
  });

  it("pauses hidden-page reads and refreshes immediately when visible", async () => {
    let latest = snapshot("old");
    const client = { ...fixtureWorkspaceClient, getWorkspace: vi.fn(async () => latest) };
    const { result, unmount } = renderHook(() => useWorkspace(client, { pollIntervalMs: 1500 }));
    await tick();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    latest = snapshot("arrived-hidden");
    await tick(6000);
    expect(client.getWorkspace).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick();
    expect(result.current.data.logs[0].id).toBe("arrived-hidden");
    await tick(1500);
    expect(client.getWorkspace).toHaveBeenCalledTimes(3);
    unmount();
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick(6000);
    expect(client.getWorkspace).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a pending response and refresh calls after unmount", async () => {
    const pending = deferred();
    const client = { ...fixtureWorkspaceClient, getWorkspace: vi.fn(() => pending.promise) };
    const { result, unmount } = renderHook(() => useWorkspace(client, { pollIntervalMs: 1500 }));
    const previous = result.current;
    unmount();
    await act(async () => pending.resolve(snapshot("late")));
    act(() => previous.refresh());
    await tick(3000);
    expect(client.getWorkspace).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(previous);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("isolates old-client responses and directs manual refresh to the new client", async () => {
    const pending = deferred();
    const oldClient = { ...fixtureWorkspaceClient, getWorkspace: () => pending.promise };
    let latest = snapshot("current");
    const newClient = { ...fixtureWorkspaceClient, getWorkspace: async () => latest };
    const { result, rerender } = renderHook(({ client }: { client: WorkspaceClient }) => useWorkspace(client, { pollIntervalMs: 1500 }), { initialProps: { client: oldClient } });
    rerender({ client: newClient });
    await tick();
    await act(async () => pending.resolve(snapshot("obsolete")));
    expect(result.current.data.logs[0].id).toBe("current");
    latest = snapshot("manual");
    act(() => result.current.refresh());
    await tick();
    expect(result.current.data.logs[0].id).toBe("manual");
  });

  it("ignores the disposed StrictMode effect and leaves one polling timer", async () => {
    const pending = deferred();
    const client = { ...fixtureWorkspaceClient, getWorkspace: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(snapshot("current")) };
    const { result } = renderHook(() => useWorkspace(client, { pollIntervalMs: 1500 }), { wrapper: StrictMode });
    await tick();
    await act(async () => pending.resolve(snapshot("obsolete")));
    expect(result.current.data.logs[0].id).toBe("current");
    expect(vi.getTimerCount()).toBe(1);
    await tick(1500);
    expect(client.getWorkspace).toHaveBeenCalledTimes(3);
  });
});
