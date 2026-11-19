import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoutesPage } from "./RoutesPage";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { workspaceFixtures } from "../data/fixtures";
import type { ModelRouteSelection, WorkspaceFixtures } from "../domain/types";

afterEach(() => vi.restoreAllMocks());

function liveWorkspace(): WorkspaceFixtures {
  return { ...structuredClone(workspaceFixtures), meta: { source: "runtime", live: true }, routes: [] };
}
async function selectModels(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "添加路由" }));
  expect(screen.queryByLabelText("客户端模型别名")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存路由" })).toBeDisabled();
  await user.click(screen.getByLabelText("Northstar AI"));
  await user.click(screen.getByLabelText("Lantern Labs"));
  await user.click(screen.getByRole("button", { name: "加载已选上游模型" }));
  await user.click(screen.getByRole("combobox", { name: "Northstar AI 模型" }));
  await user.click(screen.getByRole("option", { name: "northstar-fast" }));
  await user.click(screen.getByRole("option", { name: "northstar-large" }));
  await user.click(screen.getByRole("combobox", { name: "Lantern Labs 模型" }));
  await user.click(screen.getByRole("option", { name: "lantern-haiku" }));
}

describe("RoutesPage", () => {
  it("shows only a safe hostname and tolerates malformed upstream URLs", async () => {
    const data = structuredClone(workspaceFixtures);
    data.upstreams[0].baseUrl = "https://person:secret@api.northstar.example/v1?key=sensitive";
    data.upstreams[1].baseUrl = "not a URL";
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    render(<RoutesPage />);
    expect(await screen.findByText("api.northstar.example")).toBeVisible();
    expect(screen.getByText("地址不可用")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/secret|sensitive/);
    expect(screen.getByRole("region", { name: "模型路由列表" })).toHaveAttribute("tabindex", "0");
  });

  it("shows a useful empty state for a live workspace without routes", async () => {
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(liveWorkspace());
    render(<RoutesPage />);
    expect(await screen.findByText("还没有模型路由，添加路由以连接客户端与上游。")).toBeVisible();
    expect(screen.queryByText("northstar-large")).not.toBeInTheDocument();
    expect(screen.getByText("0 条路由")).toBeVisible();
  });

  it("does not display example routes while loading or after a failed runtime read", async () => {
    let rejectRead!: (error: Error) => void;
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockImplementation(() => new Promise((_resolve, reject) => { rejectRead = reject; }));
    render(<RoutesPage />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取工作区");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    rejectRead(new Error("连接已断开"));
    expect(await screen.findByRole("alert")).toHaveTextContent("连接已断开");
    expect(screen.queryByText("northstar-large")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加路由" })).not.toBeInTheDocument();
  });

  it("does not offer real route tests in fixture preview mode", async () => {
    render(<RoutesPage />);
    await screen.findByText("浏览器预览路由");
    expect(screen.queryByRole("button", { name: /^测试调用/ })).not.toBeInTheDocument();
  });

  it("shows one model name for a route with multiple upstreams", async () => {
    const data = liveWorkspace();
    data.routes = [{ id: "multi", alias: "northstar-fast", inboundProtocol: "Chat", outboundProtocol: "Chat", enabled: true, targets: [{ upstreamId: "up-northstar", upstreamModel: "northstar-fast" }, { upstreamId: "up-lantern", upstreamModel: "northstar-fast" }] }];
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    render(<RoutesPage />);
    expect(await screen.findByText("Res 入站 → Chat 出站 → Res 响应")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "客户端协议 / 入站" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "上游协议 / 出站" })).toBeVisible();
    expect(screen.getByText("本机运行时路由")).toBeVisible();
    const row = await screen.findByRole("row", { name: /northstar-fast/ });
    const cells = within(row).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent(/^northstar-fast$/);
    expect(cells[1].querySelector(".protocol-chat")).not.toBeNull();
    const targets = within(cells[2]).getByRole("list", { name: "上游优先级" });
    const priorities = within(targets).getAllByRole("listitem");
    expect(priorities).toHaveLength(2);
    expect(priorities[0]).toHaveTextContent("优先Northstar AI");
    expect(priorities[1]).toHaveTextContent("备用Lantern Labs");
    expect(cells[2]).toHaveTextContent("连续失败 3 次切换 · 4xx / 5xx");
  });

  it("opens an interactive real-request dialog for an enabled runtime route", async () => {
    const user = userEvent.setup();
    const data = liveWorkspace();
    data.routes = [{ id: "route-fast", alias: "gateway-fast", inboundProtocol: "Chat", outboundProtocol: "Chat", enabled: true, targets: [{ upstreamId: "up-northstar", upstreamModel: "northstar-fast" }] }];
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    const originalTestRoute = defaultWorkspaceClient.testRoute;
    const testRoute = vi.fn(async () => ({ routeAlias: "gateway-fast", text: "OK", requestId: "req-route-test", durationMs: 123, status: 200 }));
    defaultWorkspaceClient.testRoute = testRoute;
    try {
      render(<RoutesPage />);
      await screen.findByText("本机运行时路由");
      await user.click(screen.getByRole("button", { name: "测试调用 gateway-fast" }));
      const dialog = screen.getByRole("dialog", { name: "测试调用 · gateway-fast" });
      expect(dialog).toBeVisible();
      const prompt = within(dialog).getByRole("textbox", { name: "发送内容" });
      expect(prompt).toHaveValue("请回复OK");
      await user.click(within(dialog).getByRole("button", { name: "发送测试请求" }));
      expect(testRoute).toHaveBeenCalledWith("route-fast", "请回复OK");
      expect(await within(dialog).findByText("OK")).toBeVisible();
      expect(within(dialog).getByText("req-route-test")).toBeVisible();
    } finally {
      defaultWorkspaceClient.testRoute = originalTestRoute;
    }
  });

  it("creates one route per selected model across upstreams with no alias input", async () => {
    const user = userEvent.setup();
    render(<RoutesPage />);
    await screen.findByText("浏览器预览路由");
    await selectModels(user);
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(screen.getByRole("status")).toHaveTextContent("已添加 3 条");
    expect(screen.getAllByRole("row")).toHaveLength(workspaceFixtures.routes.length + 4);
    expect(screen.getByRole("columnheader", { name: "模型" })).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends all models in one runtime save and displays returned routes", async () => {
    const data = liveWorkspace();
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockImplementation(async () => structuredClone(data));
    const original = defaultWorkspaceClient.saveModelRoutes;
    const save = vi.fn(async (selection: ModelRouteSelection) => {
      data.routes = selection.targets.map((target, i) => ({ id: String(i), alias: target.modelId, inboundProtocol: selection.inboundProtocol, outboundProtocol: selection.outboundProtocol, enabled: true, targets: [{ upstreamId: target.upstreamId, upstreamModel: target.modelId }] }));
    });
    defaultWorkspaceClient.saveModelRoutes = save;
    try {
      const user = userEvent.setup();
      render(<RoutesPage />);
      await screen.findByText("本机运行时路由");
      await selectModels(user);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).queryByText(/示例|模拟|仅当前页面会话/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(await screen.findByText("已保存 3 个上游模型配置。")).toBeVisible();
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0].targets).toEqual([
        { upstreamId: "up-northstar", modelId: "northstar-fast" },
        { upstreamId: "up-northstar", modelId: "northstar-large" },
        { upstreamId: "up-lantern", modelId: "lantern-haiku" },
      ]);
      expect(await screen.findByRole("row", { name: /northstar-fast/ })).toBeVisible();
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });

  it("saves user-selected upstream priority and failure threshold", async () => {
    const data = liveWorkspace();
    data.upstreams[1].models = ["northstar-fast"];
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    const original = defaultWorkspaceClient.saveModelRoutes;
    const save = vi.fn(async () => ({}));
    defaultWorkspaceClient.saveModelRoutes = save;
    try {
      const user = userEvent.setup(); render(<RoutesPage />);
      await screen.findByText("本机运行时路由");
      await user.click(screen.getByRole("button", { name: "添加路由" }));
      await user.click(screen.getByLabelText("Northstar AI"));
      await user.click(screen.getByLabelText("Lantern Labs"));
      await user.click(screen.getByRole("button", { name: "加载已选上游模型" }));
      await user.click(screen.getByRole("combobox", { name: "Northstar AI 模型" }));
      await user.click(screen.getByRole("option", { name: "northstar-fast" }));
      await user.click(screen.getByRole("combobox", { name: "Lantern Labs 模型" }));
      await user.click(screen.getByRole("option", { name: "northstar-fast" }));
      await user.click(screen.getByRole("button", { name: "提高 Lantern Labs 优先级" }));
      const threshold = screen.getByRole("spinbutton", { name: "连续失败次数" });
      await user.clear(threshold); await user.type(threshold, "2");
      await user.click(screen.getByRole("checkbox", { name: "4xx" }));
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ targets: [{ upstreamId: "up-lantern", modelId: "northstar-fast" }, { upstreamId: "up-northstar", modelId: "northstar-fast" }], failover: { failureThreshold: 2, statusClasses: [5] } }));
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });

  it("keeps selections and an error visible when a batch conflicts", async () => {
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(liveWorkspace());
    const original = defaultWorkspaceClient.saveModelRoutes;
    defaultWorkspaceClient.saveModelRoutes = async () => { throw new Error("同一入站协议下已有同名模型"); };
    try {
      const user = userEvent.setup();
      render(<RoutesPage />);
      await screen.findByText("本机运行时路由");
      await selectModels(user);
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("同名模型");
      expect(screen.getByRole("dialog")).toBeVisible();
      expect(screen.getByRole("combobox", { name: "Northstar AI 模型" })).toHaveTextContent("已选 2 个模型");
      expect(screen.getByRole("button", { name: "保存路由" })).toBeEnabled();
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });

  it("edits an existing route with its model selected without requiring an alias", async () => {
    const data = liveWorkspace();
    data.routes = [{ id: "old", alias: "legacy", inboundProtocol: "Chat", outboundProtocol: "Chat", enabled: true, targets: [{ upstreamId: "up-northstar", upstreamModel: "northstar-fast" }] }];
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    const original = defaultWorkspaceClient.saveModelRoutes;
    const save = vi.fn(async () => ({}));
    defaultWorkspaceClient.saveModelRoutes = save;
    try {
      const user = userEvent.setup(); render(<RoutesPage />);
      await user.click(await screen.findByRole("button", { name: "编辑" }));
      expect(screen.queryByLabelText("客户端模型别名")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Northstar AI 模型" })).toHaveTextContent("northstar-fast");
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ editId: "old", targets: [{ upstreamId: "up-northstar", modelId: "northstar-fast" }] }));
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });
});
