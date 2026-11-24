import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogsPage } from "./LogsPage";
import { defaultWorkspaceClient, mapRuntimeState } from "../data/workspace-client";
import { workspaceFixtures } from "../data/fixtures";
import type { WorkspaceFixtures } from "../domain/types";
import "../styles/app.css";

it.each([200, 201])("keeps a partially delivered HTTP %s stream failed and explains its interruption in the row and detail", async (gatewayStatus) => {
  const snapshot = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [{ requestId: "partial", createdAt: "2026-11-23T10:00:00.000Z", inboundProtocol: "Res", outboundProtocol: "Res", status: "failed", stream: true, upstreamStatus: 200, gatewayStatus, streamFailurePhase: "upstream_body", firstTokenMs: 25, durationMs: 100, errorCode: "upstream_connection_reset", providerMessage: "private-provider-error", responseBody: "private-body" }],
  });
  const getWorkspace = vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(snapshot);
  try {
    const user = userEvent.setup();
    render(<LogsPage />);
    const detail = await screen.findByRole("button", { name: "查看 partial" });
    const row = detail.closest("tr")!;
    expect(within(row).getByText(/流已中断/)).toHaveClass("status-negative");
    expect(row).not.toHaveTextContent("成功");
    await user.click(within(row).getByRole("button", { name: /状态.*流已中断/ }));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("上游 HTTP 200");
    expect(tooltip).toHaveTextContent(`下游 HTTP ${gatewayStatus}`);
    expect(tooltip).toHaveTextContent("读取上游响应体时");
    expect(tooltip).toHaveTextContent(`HTTP ${gatewayStatus} 不代表流完整完成`);
    if (gatewayStatus === 201) expect(tooltip).not.toHaveTextContent("HTTP 200 不代表流完整完成");
    expect(tooltip).not.toHaveTextContent("502");
    await user.keyboard("{Escape}");
    await user.click(detail);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("失败 · 流已中断");
    expect(dialog).toHaveTextContent("上游 HTTP 200");
    expect(dialog).toHaveTextContent(`下游 HTTP ${gatewayStatus}`);
    expect(dialog).toHaveTextContent(`HTTP ${gatewayStatus} 不代表流完整完成`);
    expect(dialog).toHaveTextContent("读取上游响应体时");
    expect(dialog).not.toHaveTextContent("502");
    expect(document.body).not.toHaveTextContent(/private-provider-error|private-body/);
  } finally {
    getWorkspace.mockRestore();
  }
});

it("shows a wire 502 after upstream headers as failure without claiming a partial downstream 200", async () => {
  const snapshot = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [{ requestId: "before-downstream", createdAt: "2026-11-23T10:00:00.000Z", inboundProtocol: "Res", outboundProtocol: "Res", status: "failed", stream: true, upstreamStatus: 200, gatewayStatus: 502, streamFailurePhase: "upstream_body", errorCode: "upstream_connection_reset" }],
  });
  const getWorkspace = vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(snapshot);
  try {
    const user = userEvent.setup();
    render(<LogsPage />);
    const detail = await screen.findByRole("button", { name: "查看 before-downstream" });
    const row = detail.closest("tr")!;
    expect(within(row).getByRole("button", { name: /状态/ })).toHaveTextContent(/^失败$/);
    await user.click(detail);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("上游 HTTP 200");
    expect(dialog).toHaveTextContent("下游 HTTP 502");
    expect(dialog).toHaveTextContent("读取上游响应体时");
    expect(dialog).not.toHaveTextContent(/流已中断|下游 HTTP 200|HTTP 200 不代表流完整完成/);
  } finally {
    getWorkspace.mockRestore();
  }
});

it("shows stream-stage timings and keeps historical request details readable", async () => {
  const snapshot = mapRuntimeState({
    settings: { gatewayHost: "127.0.0.1", gatewayPort: 4318 }, upstreams: [], routes: [], clientKeys: [],
    usage: [
      { requestId: "timed", createdAt: "2026-11-24T10:00:00.000Z", inboundProtocol: "Res", outboundProtocol: "Chat", status: "completed", stream: true, durationMs: 400, firstTokenMs: 120, upstreamHeadersMs: 45, upstreamFirstByteMs: 95, upstreamBodyMs: 150, upstreamChunkCount: 4, gatewayProcessingMs: 3.5 },
      { requestId: "legacy-timing", createdAt: "2026-11-23T10:00:00.000Z", inboundProtocol: "Res", outboundProtocol: "Res", status: "completed", stream: true, durationMs: 220, firstTokenMs: 80 },
    ],
  });
  const getWorkspace = vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(snapshot);
  try {
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.click(await screen.findByRole("button", { name: "查看 timed" }));
    let dialog = screen.getByRole("dialog");
    for (const [label, value] of [["上游响应头", "45 ms"], ["上游首字节", "95 ms"], ["上游响应体", "150 ms"], ["上游数据块", "4"], ["网关处理", "4 ms"]]) {
      const term = within(dialog).getByText(label);
      expect(term.parentElement?.querySelector("dd")).toHaveTextContent(value);
    }
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "查看 legacy-timing" }));
    dialog = screen.getByRole("dialog");
    for (const label of ["上游响应头", "上游首字节", "上游响应体", "上游数据块", "网关处理"]) {
      const term = within(dialog).getByText(label);
      expect(term.parentElement?.querySelector("dd")).toHaveTextContent("—");
    }
  } finally {
    getWorkspace.mockRestore();
  }
});

describe("LogsPage", () => {
  it("filters sample logs and resets the filter", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByRole("searchbox", { name: "搜索请求日志" });
    const search = screen.getByRole("searchbox", { name: "搜索请求日志" });
    await user.type(search, "req-29ab");
    expect(screen.getByRole("button", { name: "查看 req-29ab10ce" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "查看 req-7d3a9f21" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getByRole("button", { name: "查看 req-7d3a9f21" })).toBeVisible();
  });

  it("filters sample logs by status", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByRole("searchbox", { name: "搜索请求日志" });
    expect(screen.getByText("失败（模拟）")).toHaveClass("status-badge", "status-negative");
    const failed = screen.getByRole("button", { name: "失败" });
    expect(failed).toHaveAttribute("aria-pressed", "false");
    await user.click(failed);
    expect(failed).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "查看 req-29ab10ce" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "查看 req-7d3a9f21" })).not.toBeInTheDocument();
  });

  it("shows an empty result for unmatched queries", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByRole("searchbox", { name: "搜索请求日志" });
    await user.type(screen.getByRole("searchbox", { name: "搜索请求日志" }), "absent");
    expect(screen.getByText("没有匹配的请求记录")).toBeVisible();
  });

  it("contains a wide log table within its horizontal scroll region", async () => {
    const { container } = render(<LogsPage />);
    await screen.findByRole("searchbox", { name: "搜索请求日志" });
    const tableViewport = container.querySelector(".table-scroll");
    expect(tableViewport).not.toBeNull();
    expect(getComputedStyle(tableViewport!).contain).toContain("paint");
    const table = container.querySelector(".logs-table")!;
    expect(table.querySelectorAll("col")).toHaveLength(10);
    expect(getComputedStyle(table).tableLayout).toBe("fixed");
    expect(table).toHaveClass("logs-table");
  });

  it("opens a redacted detail view without exposing request or response bodies", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByRole("searchbox", { name: "搜索请求日志" });
    await user.click(screen.getByRole("button", { name: "查看 req-7d3a9f21" }));
    const dialog = screen.getByRole("dialog", { name: "请求 req-7d3a9f21 详情" });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveClass("modal");
    expect(dialog).toHaveTextContent("Desktop client ·••••");
    expect(dialog).toHaveTextContent("请求和响应正文未记录");
    expect(screen.getByRole("button", { name: "关闭弹窗" })).toHaveTextContent("×");
  });

  it("shows the upstream service as 来源 and keeps the masked credential in details only", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByRole("searchbox", { name: "搜索请求日志" });
    const table = within(screen.getByRole("region", { name: "请求日志列表" })).getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "来源" })).toBeVisible();
    expect(within(table).queryByRole("columnheader", { name: "入口凭证" })).not.toBeInTheDocument();
    expect(within(table).getAllByText("Northstar AI")).toHaveLength(2);
    expect(within(table).queryByText(/Desktop client/)).not.toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "查看 req-7d3a9f21" }));
    const dialog = screen.getByRole("dialog", { name: "请求 req-7d3a9f21 详情" });
    expect(dialog).toHaveTextContent("入口凭证");
    expect(dialog).toHaveTextContent("Desktop client ·••••");
  });

  it("shows 推理 immediately after 来源 and uses a dash when absent", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByRole("searchbox", { name: "搜索请求日志" });
    const table = within(screen.getByRole("region", { name: "请求日志列表" })).getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((header) => header.textContent);
    expect(headers.indexOf("推理")).toBe(headers.indexOf("来源") + 1);
    const firstRow = within(table).getAllByRole("row")[1];
    expect(within(firstRow).getByText("high")).toBeVisible();
    const missingRow = within(table).getAllByRole("row")[2];
    expect(missingRow.textContent).toContain("-");
    await user.click(within(firstRow).getByRole("button", { name: "查看 req-7d3a9f21" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("推理");
    expect(screen.getByRole("dialog")).toHaveTextContent("high");
  });

  it("renames 结果 to 状态 and discloses HTTP status and sanitized error details", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await screen.findByRole("searchbox", { name: "搜索请求日志" });
    const table = within(screen.getByRole("region", { name: "请求日志列表" })).getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "状态" })).toBeVisible();
    expect(within(table).queryByRole("columnheader", { name: "结果" })).not.toBeInTheDocument();
    const failed = within(table).getByRole("button", { name: /失败/ });
    await user.hover(failed);
    expect(screen.getByRole("tooltip")).toHaveTextContent("HTTP");
    await user.unhover(failed);
    await user.click(within(table).getByRole("button", { name: "查看 req-29ab10ce" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("错误信息");
    expect(dialog).toHaveTextContent("上游响应超时（示例错误）");
  });
});

it("reveals request IDs, protocol direction and exact tokens through accessible disclosures", async () => {
  const user = userEvent.setup();
  render(<LogsPage />);
  await screen.findByRole("searchbox", { name: "搜索请求日志" });
  expect(screen.queryByText("req-7d3a9f21")).not.toBeInTheDocument();
  const row = screen.getByRole("button", { name: "查看 req-7d3a9f21" }).closest("tr")!;
  expect(within(row).getByText("流")).toBeVisible();
  expect(within(row).getByText("首字")).toBeVisible();
  expect(within(row).getByText("总耗时")).toBeVisible();
  await user.click(within(row).getByRole("button", { name: /请求时间/ }));
  expect(screen.getByRole("tooltip")).toHaveTextContent("req-7d3a9f21");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  const protocol = within(row).getByRole("button", { name: /入站协议/ });
  expect(protocol).toHaveTextContent("Res");
  expect(protocol).not.toHaveTextContent("Chat");
  await user.hover(protocol);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Res → Chat → Res");
  await user.unhover(protocol);
  await user.click(within(row).getByRole("button", { name: /Token 用量/ }));
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("输入");
  expect(tooltip).toHaveTextContent("缓存读取");
  expect(tooltip).toHaveTextContent("缓存写入");
  expect(tooltip).toHaveTextContent("推理");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

describe("request log refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  async function tick(ms = 0) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  }
  function liveSnapshot(): WorkspaceFixtures {
    return { ...structuredClone(workspaceFixtures), meta: { live: true, source: "runtime" } };
  }

  it("manually refreshes while preserving filters, existing rows and the open detail", async () => {
    const initial = liveSnapshot();
    let resolve!: (data: WorkspaceFixtures) => void;
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValueOnce(initial).mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<LogsPage />);
    await tick();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索请求日志" }), { target: { value: "req-" } });
    fireEvent.click(screen.getByRole("button", { name: "失败" }));
    const refresh = screen.getByRole("button", { name: "刷新请求日志" });
    fireEvent.click(refresh);
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveTextContent("刷新中");
    fireEvent.click(screen.getByRole("button", { name: "查看 req-29ab10ce" }));
    const dialog = screen.getByRole("dialog");
    const updated = liveSnapshot();
    updated.logs.unshift({ ...initial.logs.find((log) => log.id === "req-29ab10ce")!, id: "req-new-failure" });
    await act(async () => resolve(updated));
    expect(screen.getByRole("searchbox", { name: "搜索请求日志" })).toHaveValue("req-");
    expect(screen.getByRole("button", { name: "失败" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "查看 req-new-failure" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "查看 req-7d3a9f21" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(refresh).toBeEnabled();
  });

  it("automatically displays the first new record from an empty list within 1500 ms", async () => {
    let latest: WorkspaceFixtures = { ...liveSnapshot(), logs: [] };
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockImplementation(async () => latest);
    render(<LogsPage />);
    await tick();
    expect(screen.getByText("没有匹配的请求记录")).toBeVisible();
    latest = liveSnapshot();
    await tick(1500);
    expect(screen.getByRole("button", { name: "查看 req-7d3a9f21" })).toBeVisible();
    expect(screen.queryByText("正在读取工作区…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新请求日志" })).toBeEnabled();
  });

  it("offers manual recovery after an initial failure without showing sample logs", async () => {
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockRejectedValueOnce(new Error("连接已断开")).mockResolvedValue(liveSnapshot());
    render(<LogsPage />);
    await tick();
    expect(screen.getByRole("alert")).toHaveTextContent("连接已断开");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新请求日志" }));
    await tick();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看 req-7d3a9f21" })).toBeVisible();
  });

  it("keeps rows and details through a failed poll and recovers at the next poll", async () => {
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValueOnce(liveSnapshot()).mockRejectedValueOnce(new Error("连接已断开")).mockResolvedValue(liveSnapshot());
    render(<LogsPage />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "查看 req-7d3a9f21" }));
    const dialog = screen.getByRole("dialog");
    await tick(1500);
    expect(screen.getByRole("alert")).toHaveTextContent("连接已断开");
    expect(screen.getByRole("button", { name: "查看 req-7d3a9f21" })).toBeVisible();
    expect(screen.getByRole("dialog")).toBe(dialog);
    await tick(1500);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBe(dialog);
  });

  it("displays newest rows first and prepends later arrivals without changing the source array", async () => {
    const initial = liveSnapshot();
    initial.logs = [
      { ...initial.logs[0], id: "older", time: "2026-11-19T09:00:00Z" },
      { ...initial.logs[0], id: "newer", time: "2026-11-20T09:00:00Z" },
    ];
    let latest = initial;
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockImplementation(async () => latest);
    render(<LogsPage />);
    await tick();
    expect(screen.getAllByRole("button", { name: /^查看 / }).map((button) => button.getAttribute("aria-label"))).toEqual(["查看 newer", "查看 older"]);
    latest = { ...initial, logs: [...initial.logs, { ...initial.logs[0], id: "newest", time: "2026-11-20T09:00:01Z" }] };
    await tick(1500);
    expect(screen.getAllByRole("button", { name: /^查看 / }).map((button) => button.getAttribute("aria-label"))).toEqual(["查看 newest", "查看 newer", "查看 older"]);
    expect(initial.logs.map(({ id }) => id)).toEqual(["older", "newer"]);
  });

  it("combines all four date ranges with search and status, and resets everything to realtime", async () => {
    vi.setSystemTime(new Date(2026, 10, 20, 12));
    const latest = liveSnapshot();
    latest.logs = [
      { ...latest.logs[0], id: "today-match", time: new Date(2026, 10, 20, 9).toISOString(), status: "失败" },
      { ...latest.logs[0], id: "week-match", time: new Date(2026, 10, 14).toISOString(), status: "失败" },
      { ...latest.logs[0], id: "month-match", time: new Date(2026, 9, 22).toISOString(), status: "失败" },
      { ...latest.logs[0], id: "old-match", time: new Date(2026, 9, 21).toISOString(), status: "失败" },
      { ...latest.logs[0], id: "today-success-match", time: new Date(2026, 10, 20, 10).toISOString(), status: "成功" },
      { ...latest.logs[0], id: "today-other", time: new Date(2026, 10, 20, 11).toISOString(), status: "失败" },
    ];
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(latest);
    render(<LogsPage />);
    await tick();
    const dates = within(screen.getByRole("group", { name: "按日期筛选" }));
    expect(dates.getByRole("button", { name: "实时" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "match" } });
    fireEvent.click(screen.getByRole("button", { name: "失败" }));
    for (const [range, count] of [["今日", 1], ["近7天", 2], ["近30天", 3], ["实时", 4]] as const) {
      fireEvent.click(dates.getByRole("button", { name: range }));
      expect(screen.getAllByRole("button", { name: /^查看 / })).toHaveLength(count);
      expect(dates.getByRole("button", { name: range })).toHaveAttribute("aria-pressed", "true");
    }
    fireEvent.click(dates.getByRole("button", { name: "今日" }));
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(dates.getByRole("button", { name: "实时" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getAllByRole("button", { name: /^查看 / })).toHaveLength(6);
    fireEvent.click(dates.getByRole("button", { name: "今日" }));
    expect(screen.getByRole("button", { name: "清除筛选" })).toBeVisible();
  });

  it("keeps today's selection across polling and recalculates the day at midnight", async () => {
    vi.setSystemTime(new Date(2026, 10, 20, 23, 59, 59));
    const initial = liveSnapshot();
    initial.logs = [{ ...initial.logs[0], id: "before-midnight", time: new Date(2026, 10, 20, 23, 58).toISOString() }];
    let latest = initial;
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockImplementation(async () => latest);
    render(<LogsPage />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "今日" }));
    expect(screen.getByRole("button", { name: "查看 before-midnight" })).toBeVisible();
    latest = { ...initial, logs: [...initial.logs, { ...initial.logs[0], id: "after-midnight", time: new Date(2026, 10, 21).toISOString() }] };
    await tick(1500);
    expect(screen.getByRole("button", { name: "今日" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "查看 after-midnight" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "查看 before-midnight" })).not.toBeInTheDocument();
  });
});

describe("request log clearing", () => {
  function liveSnapshot(): WorkspaceFixtures {
    return { ...structuredClone(workspaceFixtures), meta: { live: true, source: "runtime" } };
  }

  function restoreClient(original: Partial<typeof defaultWorkspaceClient>) {
    for (const key of Object.keys(defaultWorkspaceClient)) {
      if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
    }
    Object.assign(defaultWorkspaceClient, original);
  }

  it("keeps clearing unavailable in fixture mode", async () => {
    render(<LogsPage />);
    await screen.findByRole("searchbox", { name: "搜索请求日志" });
    expect(screen.queryByRole("button", { name: "清空日志" })).not.toBeInTheDocument();
  });

  it("confirms clearing all logs regardless of filters, then refreshes the list", async () => {
    const original = { ...defaultWorkspaceClient };
    let latest = liveSnapshot();
    const clearRequestLogs = vi.fn(async () => {
      latest = { ...latest, logs: [] };
      return { deleted: true as const, removedCount: 3 };
    });
    Object.assign(defaultWorkspaceClient, { getWorkspace: async () => latest, clearRequestLogs });
    try {
      const user = userEvent.setup();
      render(<LogsPage />);
      const search = await screen.findByRole("searchbox", { name: "搜索请求日志" });
      await user.type(search, "req-29ab");
      await user.click(screen.getByRole("button", { name: "清空日志" }));
      const dialog = screen.getByRole("dialog", { name: "清空请求日志" });
      expect(dialog).toHaveTextContent("全部请求日志");
      expect(dialog).toHaveTextContent("当前筛选不会限制清空范围");
      await user.click(within(dialog).getByRole("button", { name: "取消" }));
      expect(clearRequestLogs).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "查看 req-29ab10ce" })).toBeVisible();

      await user.click(screen.getByRole("button", { name: "清空日志" }));
      await user.click(screen.getByRole("button", { name: "确认清空" }));
      expect(clearRequestLogs).toHaveBeenCalledOnce();
      expect(await screen.findByRole("status")).toHaveTextContent("已清空全部请求日志，共移除 3 条");
      expect(await screen.findByText("没有匹配的请求记录")).toBeVisible();
      expect(screen.getByRole("searchbox", { name: "搜索请求日志" })).toHaveValue("req-29ab");
    } finally {
      restoreClient(original);
    }
  });

  it("keeps request rows and reports a useful error when clearing fails", async () => {
    const original = { ...defaultWorkspaceClient };
    Object.assign(defaultWorkspaceClient, {
      getWorkspace: async () => liveSnapshot(),
      clearRequestLogs: vi.fn(async () => { throw new Error("磁盘只读"); }),
    });
    try {
      const user = userEvent.setup();
      render(<LogsPage />);
      await screen.findByRole("searchbox", { name: "搜索请求日志" });
      await user.click(screen.getByRole("button", { name: "清空日志" }));
      await user.click(screen.getByRole("button", { name: "确认清空" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("清空请求日志失败：磁盘只读");
      expect(screen.getByRole("button", { name: "查看 req-7d3a9f21" })).toBeVisible();
    } finally {
      restoreClient(original);
    }
  });
});

it("scopes a single focus indicator to the request-log search", async () => {
  render(<LogsPage />);
  const search = await screen.findByRole("searchbox", { name: "搜索请求日志" });
  search.focus();
  expect(search.closest(".request-logs-toolbar")).not.toBeNull();
  const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules)) as CSSStyleRule[];
  const fieldFocus = rules.find((rule) => rule.selectorText === ".request-logs-toolbar .search-field:focus-within");
  const inputFocus = rules.find((rule) => rule.selectorText === ".request-logs-toolbar .search-field .geist-input:focus-visible");
  expect(fieldFocus?.style.outline).toBe("none");
  expect(fieldFocus?.style.getPropertyValue("border-color")).toBe("var(--accent)");
  expect(inputFocus?.style.outline).toBe("none");
});
