import { useEffect, useState } from "react";
import { fixtureWorkspaceClient } from "./workspace-client";
import { workspaceFixtures } from "./fixtures";
import type { WorkspaceClient } from "./workspace-client";
import type { WorkspaceFixtures } from "../domain/types";

type WorkspaceState = {
  data: WorkspaceFixtures;
  loading: boolean;
  error: string;
};

export function useWorkspace(client: WorkspaceClient = fixtureWorkspaceClient): WorkspaceState {
  const [state, setState] = useState<WorkspaceState>({ data: workspaceFixtures, loading: true, error: "" });

  useEffect(() => {
    let active = true;
    client.getWorkspace().then((data) => {
      if (active) setState({ data, loading: false, error: "" });
    }).catch((error: unknown) => {
      if (active) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "无法读取工作区数据" }));
    });
    return () => { active = false; };
  }, [client]);

  return state;
}
