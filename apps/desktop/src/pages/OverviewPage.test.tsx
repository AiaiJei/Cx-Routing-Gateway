import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewPage } from "./OverviewPage";
import { MemoryRouter } from "react-router";
import { useWorkspace } from "../data/use-workspace";
import { workspaceFixtures } from "../data/fixtures";
import type { WorkspaceFixtures } from "../domain/types";

vi.mock("../data/use-workspace", () => ({ useWorkspace: vi.fn() }));

const workspaceHook = vi.mocked(useWorkspace);
const defaultWorkspaceState = {
  data: workspaceFixtures,
  loading: false,
  error: "",
  refreshing: false,
  refreshError: "",
  refresh: vi.fn(),
};

describe("OverviewPage", () => {
  beforeEach(() => workspaceHook.mockReturnValue(defaultWorkspaceState));

  it("shows truthful fixture status, retained summaries, recent failures and activity", async () => {
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    expect(await screen.findByText("示例数据 · 非实时")).toBeVisible();
    expect(screen.getByText("运行时未接入")).toBeVisible();
    expect(screen.getByRole("heading", { name: "上游最近检查" })).toBeVisible();
    expect(screen.getByText("最近测试通过 0 · 待测试 1 · 未连接 1")).toBeVisible();
    expect(screen.getByText("2 / 2 已启用")).toBeVisible();
    expect(screen.getByText("2 个示例凭证")).toBeVisible();
    expect(screen.getByText("已保留请求")).toBeVisible();
    expect(screen.getByText("3", { exact: true })).toBeVisible();
    expect(screen.getByText("2 / 1")).toBeVisible();
    expect(screen.getByText("730", { exact: true })).toBeVisible();
    expect(screen.getByText("ms", { exact: true })).toBeVisible();
    expect(screen.getByText("最近 24 小时没有可绘制的请求记录")).toBeVisible();
    expect(screen.getByRole("heading", { name: "需要关注" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "最近调用" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "配置上游" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看上游" })).toBeVisible();
    expect(screen.getByRole("link", { name: "查看路由" })).toBeVisible();
  });

  it("shows runtime statuses without a fixture label", () => {
    const liveData: WorkspaceFixtures = {
      ...workspaceFixtures,
      meta: { source: "runtime", live: true },
      gateway: {
        state: "启动失败",
        url: "http://127.0.0.1:8317",
        metrics: { total: 4, completed: 2, rejected: 1, failed: 1, avgDurationMs: null },
      },
      upstreams: [
        { ...workspaceFixtures.upstreams[0], status: "已连接" },
        { ...workspaceFixtures.upstreams[1], status: "待测试" },
      ],
      routes: [
        { ...workspaceFixtures.routes[0], enabled: true },
        { ...workspaceFixtures.routes[1], enabled: false },
      ],
      credentials: [
        { ...workspaceFixtures.credentials[0], status: "运行时" },
        { ...workspaceFixtures.credentials[1], status: "已撤销" },
      ],
      logs: [],
      usageRetentionCount: 4,
    };
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, data: liveData });

    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    expect(screen.getByText("启动失败")).toBeVisible();
    expect(screen.queryByText("示例数据 · 非实时")).not.toBeInTheDocument();
    expect(screen.getByText("最近测试通过 1 · 待测试 1 · 未连接 0")).toBeVisible();
    expect(screen.getByText("1 / 2 已启用")).toBeVisible();
    expect(screen.getByText("1 有效 · 1 已撤销")).toBeVisible();
    expect(screen.getByText("2 / 2")).toBeVisible();
  });

  it("shows the loading state before workspace data arrives", () => {
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, loading: true });

    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    expect(screen.getByRole("status")).toHaveTextContent("正在读取工作区…");
  });

  it("shows a recoverable error state when workspace data fails", () => {
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, error: "本机控制服务不可用" });

    render(<MemoryRouter><OverviewPage /></MemoryRouter>);

    expect(screen.getByRole("alert")).toHaveTextContent("工作区数据读取失败：本机控制服务不可用");
  });
});
