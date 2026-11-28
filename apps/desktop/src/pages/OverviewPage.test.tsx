import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

function chooseDropdownOption(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

describe("OverviewPage", () => {
  beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 10, 18, 12).getTime()); workspaceHook.mockReturnValue(defaultWorkspaceState); });
  afterEach(() => vi.restoreAllMocks());

  it("keeps both charts and provides shared overview controls above the analysis", async () => {
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    expect(await screen.findByText("示例数据 · 非实时")).toBeVisible();
    const controls = screen.getByRole("group", { name: "总览操作" });
    expect(within(controls).getByRole("combobox", { name: "统计范围" })).toBeVisible();
    expect(within(controls).getByRole("button", { name: "刷新数据" })).toBeEnabled();
    expect(screen.getByRole("img", { name: /请求趋势图，共 3 条/ })).toBeVisible();
    expect(screen.getByRole("img", { name: "模型调用分布图" })).toHaveAttribute("data-total", "3");
    const side = screen.getByRole("complementary", { name: "Gateway 状态与异常" });
    expect(within(side).getByRole("region", { name: "本机 Gateway" })).toHaveTextContent("运行时未接入");
    expect(within(side).getByRole("region", { name: "Token 构成" })).toBeVisible();
  });

  it("builds token composition only from requests with both input and output reported", () => {
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, data: { ...workspaceFixtures, logs: [
      { ...workspaceFixtures.logs[0], id: "paired", tokens: { input: 100, output: 20 } },
      { ...workspaceFixtures.logs[0], id: "input-only", tokens: { input: 50 } },
      { ...workspaceFixtures.logs[0], id: "output-only", tokens: { output: 40 } },
    ] } });
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    const tokens = screen.getByRole("region", { name: "Token 构成" });
    expect(within(tokens).getByRole("img", { name: /1 \/ 3 条请求.*输入 100.*输出 20/ })).toBeVisible();
    expect(tokens).toHaveTextContent("150");
    expect(tokens).toHaveTextContent("60");
    expect(tokens).toHaveTextContent("输入和输出均已上报");
  });

  it("distinguishes missing token composition from explicitly reported zero values", () => {
    const { rerender } = render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, data: { ...workspaceFixtures, logs: [
      { ...workspaceFixtures.logs[0], tokens: undefined },
    ] } });
    rerender(<MemoryRouter><OverviewPage /></MemoryRouter>);
    let tokens = screen.getByRole("region", { name: "Token 构成" });
    expect(within(tokens).queryByRole("img")).not.toBeInTheDocument();
    expect(tokens).toHaveTextContent("未上报完整输入和输出");
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, data: { ...workspaceFixtures, logs: [
      { ...workspaceFixtures.logs[0], tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    ] } });
    rerender(<MemoryRouter><OverviewPage /></MemoryRouter>);
    tokens = screen.getByRole("region", { name: "Token 构成" });
    expect(within(tokens).queryByRole("img")).not.toBeInTheDocument();
    expect(tokens).toHaveTextContent("已上报用量为 0");
    expect(tokens).not.toHaveTextContent("未上报完整输入和输出");
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
    expect(screen.getByRole("heading", { name: "用量统计" })).toBeVisible();
    expect(screen.getByRole("group", { name: "调用总数" })).toHaveTextContent("3");
    expect(screen.getByRole("group", { name: "调用结果" })).toHaveTextContent("2 / 1");
    expect(screen.getByText("730", { exact: true })).toBeVisible();
    expect(screen.getByText("ms", { exact: true })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "统计范围" })).toHaveTextContent("今天（本地时间）");
    expect(screen.getByRole("combobox", { name: "统计范围" })).toHaveClass("custom-select-trigger");
    expect(screen.getByRole("combobox", { name: "查看模型" })).toHaveClass("custom-select-trigger");
    expect(document.querySelectorAll("select")).toHaveLength(0);
    expect(screen.getByRole("img", { name: /请求趋势图，共 3 条/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "需要关注" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "最近调用" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "配置上游" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看上游" })).toBeVisible();
    expect(screen.getByRole("link", { name: "查看路由" })).toBeVisible();
  });

  it("keeps failure details readable and request IDs secondary", () => {
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    const failedLog = workspaceFixtures.logs.find(log => log.status.startsWith("失败"))!;
    const attention = screen.getByRole("heading", { name: "需要关注" }).closest(".attention-panel")!;
    const failureRow = [...attention.querySelectorAll(".attention-row")].find(row => row.querySelector(".attention-copy strong")?.textContent === failedLog.model);
    const requestId = failureRow?.querySelector("code");
    expect(failureRow?.querySelector(".attention-copy")).toHaveTextContent(failedLog.model);
    expect(failureRow?.querySelector(".attention-copy")).toHaveTextContent(failedLog.error ?? failedLog.status);
    expect(requestId).toHaveTextContent(failedLog.id);
    expect(requestId).toHaveAttribute("title", failedLog.id);
    expect(requestId?.parentElement).toBe(failureRow);
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
    expect(screen.getByRole("group", { name: "调用结果" })).toHaveTextContent("0 / 0");
    expect(screen.getByRole("group", { name: "调用总数" }).querySelector("strong")).toHaveTextContent("0");
    expect(screen.getByText("当前范围内没有模型调用记录")).toBeVisible();
  });

  it("shows reported token totals and model call results from the same logs", () => {
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    const usage = screen.getByRole("group", { name: "已上报 Token" });
    expect(usage).toHaveTextContent("1,854");
    expect(usage).toHaveTextContent("2 / 3 条上报");
    const reasoner = screen.getByRole("region", { name: "所选模型明细" });
    expect(reasoner).toHaveTextContent("100.0%");
    expect(reasoner).toHaveTextContent("1,854");
    fireEvent.click(screen.getByRole("button", { name: "查看 gateway-fast" }));
    const failed = screen.getByRole("region", { name: "所选模型明细" });
    expect(failed).toHaveTextContent("最近调用失败");
    expect(failed).toHaveTextContent("0.0%");
    expect(failed).toHaveTextContent("未上报");
    expect(screen.getByRole("img", { name: "模型调用分布图" })).toHaveAttribute("data-total", "3");
  });

  it("updates usage, model results and recent calls together when the range changes", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-26T12:00:00Z"));
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, data: {
      ...workspaceFixtures,
      logs: [
        { ...workspaceFixtures.logs[0], time: "2026-11-26T11:00:00Z", model: "recent-model" },
        { ...workspaceFixtures.logs[1], time: "2026-11-24T11:00:00Z", model: "old-model" },
      ],
    } });
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    chooseDropdownOption("统计范围", "最近 24 小时");
    expect(screen.getByRole("group", { name: "调用总数" }).querySelector("strong")).toHaveTextContent("1");
    expect(screen.queryByRole("button", { name: "查看 old-model" })).not.toBeInTheDocument();
    expect(screen.queryByText("需要关注")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /请求趋势图，共 1 条/ })).toBeVisible();
    chooseDropdownOption("统计范围", "已保留记录");
    expect(screen.getByRole("group", { name: "调用总数" }).querySelector("strong")).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "查看 old-model" })).toBeVisible();
  });

  it("defaults the shared distribution and usage totals to the local calendar day", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(2026, 10, 26, 12).getTime());
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, data: { ...workspaceFixtures, logs: [
      { ...workspaceFixtures.logs[0], model: "today-model", time: new Date(2026, 10, 26, 11).toISOString() },
      { ...workspaceFixtures.logs[1], model: "yesterday-model", time: new Date(2026, 10, 25, 23, 59).toISOString() },
    ] } });
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    expect(screen.getByRole("combobox", { name: "统计范围" })).toHaveTextContent("今天（本地时间）");
    expect(screen.getByRole("group", { name: "调用总数" }).querySelector("strong")).toHaveTextContent("1");
    expect(screen.getByRole("img", { name: "模型调用分布图" })).toHaveAttribute("data-total", "1");
    expect(screen.queryByRole("button", { name: "查看 yesterday-model" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /请求趋势图，共 2 条/ })).toBeVisible();
    chooseDropdownOption("统计范围", "最近 24 小时");
    expect(screen.getByRole("img", { name: "模型调用分布图" })).toHaveAttribute("data-total", "2");
    expect(screen.getByRole("button", { name: "查看 yesterday-model" })).toBeVisible();
  });

  it("shows refresh feedback and preserves existing data on refresh failure", () => {
    const refresh = vi.fn();
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, refresh });
    const { rerender } = render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "刷新数据" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, refresh, refreshing: true });
    rerender(<MemoryRouter><OverviewPage /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "刷新中…" })).toBeDisabled();
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, refreshError: "控制服务未响应" });
    rerender(<MemoryRouter><OverviewPage /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("当前仍显示上次数据");
    expect(screen.getByRole("group", { name: "调用总数" })).toHaveTextContent("3");
  });

  it("includes every model in one distribution without group controls", () => {
    workspaceHook.mockReturnValue({ ...defaultWorkspaceState, data: { ...workspaceFixtures,
      logs: Array.from({ length: 7 }, (_, index) => ({ ...workspaceFixtures.logs[0], id: `call-${index}`, model: `model-${index}` })),
    } });
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    const region = screen.getByRole("region", { name: "模型数据分析" });
    expect(within(region).queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一组模型" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "模型调用分布图" }).querySelectorAll("circle[data-model]")).toHaveLength(7);
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
