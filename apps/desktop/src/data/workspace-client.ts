import { workspaceFixtures } from "./fixtures";
import type { WorkspaceFixtures } from "../domain/types";

export type WorkspaceClient = {
  getWorkspace(): Promise<WorkspaceFixtures>;
  simulateUpstreamTest(upstreamId: string): Promise<{ simulated: true; message: string }>;
};

export const fixtureWorkspaceClient: WorkspaceClient = {
  async getWorkspace() {
    return structuredClone(workspaceFixtures);
  },
  async simulateUpstreamTest(upstreamId) {
    const upstream = workspaceFixtures.upstreams.find((item) => item.id === upstreamId);
    if (!upstream) throw new Error("找不到该上游服务");
    return { simulated: true, message: `${upstream.name}：连通测试未执行，当前仅为界面演示` };
  },
};
