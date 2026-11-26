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

  it("places large purpose icons before primary numbers and quiet captions", async () => {
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    expect(await screen.findByText("示例数据 · 非实时")).toBeVisible();

    const gateway = screen.getByRole("region", { name: "本机 Gateway" });
    expect(gateway.querySelector(".overview-icon")).toHaveAttribute("data-size", "48");
    expect(gateway.querySelector(".overview-status__state")).toHaveTextContent("运行时未接入");

    const upstream = screen.getByRole("region", { name: "上游最近检查" });
    expect(upstream.querySelector(".overview-icon")).toHaveAttribute("data-size", "48");
    expect(upstream.querySelector(".overview-status__count")).toHaveTextContent("2");

    const route = screen.getByRole("group", { name: "模型路由" });
    expect(route.querySelector(".overview-icon")).toHaveAttribute("data-size", "40");
    expect(route.querySelector(".overview-status__count")).toHaveTextContent("2 / 2");
    expect(route.querySelector(".overview-status__caption")).toHaveTextContent("已启用");

    const requestMetric = screen.getByRole("group", { name: "已保留请求" });
    const icon = requestMetric.querySelector(".overview-icon");
    const value = requestMetric.querySelector(".overview-metric__value");
    const caption = requestMetric.querySelector(".overview-metric__caption");

    expect(icon).toHaveAttribute("data-size", "40");
    expect(value).toHaveTextContent("3");
    expect(caption).toHaveTextContent("已保留请求");
    expect(icon!.compareDocumentPosition(value!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(value!.compareDocumentPosition(caption!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows truthful fixture status, retained summaries, recent failures and activity", async () => {
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    expect(await screen.findByText("示例数据 · 非实时")).toBeVisible();
    expect(screen.getByText("运行时未接入")).toBeVisible();
    expect(screen.getByRole("heading", { name: "上游最近检查" })).toBeVisible();
    expect(screen.getByText("最近测试通过 0 · 待测试 1 · 未连接 1")).toBeVisible();
    expect(screen.getByRole("group", { name: "模型路由" })).toHaveTextContent("2 / 2");
    expect(screen.getByRole("group", { name: "模型路由" })).toHaveTextContent("已启用");
    expect(screen.getByRole("group", { name: "接入凭证" })).toHaveTextContent("2");
    expect(screen.getByRole("group", { name: "接入凭证" })).toHaveTextContent("示例凭证");
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
    expect(screen.getByRole("group", { name: "模型路由" })).toHaveTextContent("1 / 2");
    expect(screen.getByRole("group", { name: "模型路由" })).toHaveTextContent("已启用");
    expect(screen.getByRole("group", { name: "接入凭证" })).toHaveTextContent("1");
    expect(screen.getByRole("group", { name: "接入凭证" })).toHaveTextContent("已撤销");
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
