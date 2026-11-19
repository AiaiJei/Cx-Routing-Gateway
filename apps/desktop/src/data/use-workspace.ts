import { useCallback, useEffect, useRef, useState } from "react";
import { defaultWorkspaceClient } from "./workspace-client";
import { workspaceFixtures } from "./fixtures";
import type { WorkspaceClient } from "./workspace-client";
import type { WorkspaceFixtures } from "../domain/types";

type WorkspaceState = {
  data: WorkspaceFixtures;
  loading: boolean;
  error: string;
  refreshing: boolean;
  refreshError: string;
};

type WorkspaceOptions = { pollIntervalMs?: number };

export function useWorkspace(client: WorkspaceClient = defaultWorkspaceClient, { pollIntervalMs }: WorkspaceOptions = {}) {
  const [state, setState] = useState<WorkspaceState>({ data: workspaceFixtures, loading: true, error: "", refreshing: false, refreshError: "" });
  const refreshRef = useRef<(() => void) | null>(null);
  const refresh = useCallback(() => { refreshRef.current?.(); }, []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let hasLoaded = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    setState({ data: workspaceFixtures, loading: true, error: "", refreshing: false, refreshError: "" });

    async function load(manual = false) {
      if (!active) return;
      // A click joins any pending poll; background reads stay visually quiet.
      if (manual) setState((current) => ({ ...current, refreshing: true }));
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await client.getWorkspace();
        if (active) {
          hasLoaded = true;
          setState({ data, loading: false, error: "", refreshing: false, refreshError: "" });
        }
      } catch (error: unknown) {
        if (active) {
          const message = error instanceof Error ? error.message : "无法读取工作区数据";
          setState((current) => ({ ...current, loading: false, refreshing: false,
            error: hasLoaded ? "" : message, refreshError: hasLoaded ? message : "" }));
        }
      } finally {
        inFlight = false;
      }
    }

    function schedule() {
      clearInterval(timer);
      if (document.visibilityState !== "hidden") {
        timer = setInterval(() => {
          if (document.visibilityState !== "hidden") void load();
        }, pollIntervalMs);
      }
    }
    function onVisibilityChange() {
      schedule();
      if (document.visibilityState !== "hidden") void load();
    }

    refreshRef.current = () => { void load(true); };
    void load();
    const polling = pollIntervalMs !== undefined && Number.isFinite(pollIntervalMs) && pollIntervalMs > 0;
    if (polling) {
      schedule();
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      active = false;
      refreshRef.current = null;
      clearInterval(timer);
      if (polling) document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [client, pollIntervalMs]);

  return { ...state, refresh };
}
