import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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
  await user.click(screen.getByRole("combobox", { name: "统一模型" }));
  await user.click(screen.getByRole("option", { name: "northstar-fast" }));
  await user.click(screen.getByRole("option", { name: "northstar-large" }));

  await user.click(screen.getByRole("option", { name: "lantern-haiku" }));
  await user.click(screen.getByRole("combobox", { name: "统一模型" }));
}

describe("route model families", () => {
  it("retains and shows per-model capabilities when saving a preview route", async () => {
    const user = userEvent.setup();
    const data = structuredClone(workspaceFixtures);
    data.routes = [];
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    render(<RoutesPage />);
    await user.click(await screen.findByRole("button", { name: "添加路由" }));
    await user.click(screen.getByRole("checkbox", { name: "Northstar AI" }));
    await user.click(screen.getByRole("button", { name: "加载已选上游模型" }));
    await user.click(screen.getByRole("combobox", { name: "统一模型" }));
    await user.click(screen.getByRole("option", { name: "northstar-fast" }));
    await user.click(screen.getByRole("combobox", { name: "统一模型" }));
    await user.type(screen.getByRole("textbox", { name: "northstar-fast 上下文窗口" }), "128000");
    await user.type(screen.getByRole("textbox", { name: "northstar-fast 最大输出" }), "32000");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(await screen.findByText(/上下文 128000 · 最大输出 32000/)).toBeVisible();
  });

  it("filters every family with correct counts and keeps an empty category recoverable", async () => {
    const user = userEvent.setup();
    const data = liveWorkspace();
    const models = ["gpt-6-astra", "openai/o3-mini", "claude-sonnet-5", "gemini-2.5-pro", "GLM-4.6", "deepseek-chat", "kimi-k2", "kling-3.0"];
    data.routes = models.map((model, index) => ({ id: String(index), alias: `custom-${index}`, inboundProtocol: "Res", outboundProtocol: "Chat", enabled: true, targets: [{ upstreamId: "up-northstar", upstreamModel: model }] }));
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    render(<RoutesPage />);
    const filters = await screen.findByRole("group", { name: "路由模型分类" });
    expect(within(filters).getAllByRole("button").map(button => button.textContent)).toEqual(["全部8", "gpt2", "claude1", "gemini1", "glm1", "deepseek1", "kimi1", "其他1"]);
    for (const [family, count, names] of [
      ["gpt", 2, models.slice(0, 2)], ["claude", 1, [models[2]]], ["gemini", 1, [models[3]]],
      ["glm", 1, [models[4]]], ["deepseek", 1, [models[5]]], ["kimi", 1, [models[6]]], ["其他", 1, [models[7]]],
    ] as const) {
      await user.click(within(filters).getByRole("button", { name: `${family} ${count}` }));
      expect(screen.getAllByRole("row")).toHaveLength(count + 1);
      names.forEach(name => expect(screen.getByRole("row", { name: new RegExp(name) })).toBeVisible());
    }
    await user.click(within(filters).getByRole("button", { name: "全部 8" }));
    expect(screen.getAllByRole("row")).toHaveLength(9);
  });

  it("updates category counts after deletion and distinguishes a filtered empty result", async () => {
    const user = userEvent.setup();
    const data = liveWorkspace();
    data.routes = ["gpt-6-astra", "custom-model"].map((model, index) => ({ id: String(index), alias: model, inboundProtocol: "Res", outboundProtocol: "Chat", enabled: true, targets: [{ upstreamId: "up-northstar", upstreamModel: model }] }));
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    const original = defaultWorkspaceClient.deleteRoute;
    defaultWorkspaceClient.deleteRoute = async () => ({});
    try {
      render(<RoutesPage />);
      const filters = await screen.findByRole("group", { name: "路由模型分类" });
      await user.click(within(filters).getByRole("button", { name: "gpt 1" }));
      await user.click(screen.getByRole("button", { name: "删除" }));
      expect(await screen.findByText("该分类暂无路由，可选择其他分类或添加路由。")).toBeVisible();
      expect(within(filters).getByRole("button", { name: "gpt 0" })).toHaveAttribute("aria-pressed", "true");
      await user.click(within(filters).getByRole("button", { name: "全部 1" }));
      expect(screen.getByRole("row", { name: /custom-model/ })).toBeVisible();
    } finally { defaultWorkspaceClient.deleteRoute = original; }
  });

  it("saves a unified model union across families and de-duplicates shared model IDs", async () => {
    const user = userEvent.setup();
    const data = liveWorkspace();
    data.upstreams[0].models = ["gpt-6-astra", "claude-sonnet-5"];
    data.upstreams[1].models = ["gemini-2.5-pro", "gpt-6-astra"];
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockImplementation(async () => structuredClone(data));
    const original = defaultWorkspaceClient.saveModelRoutes;
    const save = vi.fn(async (selection: ModelRouteSelection) => {
      data.routes = ["gpt-6-astra", "claude-sonnet-5", "gemini-2.5-pro"].map((model, index) => ({ id: String(index), alias: model, inboundProtocol: selection.inboundProtocol, outboundProtocol: selection.outboundProtocol, enabled: true, targets: [{ upstreamId: "up-northstar", upstreamModel: model }] }));
    });
    defaultWorkspaceClient.saveModelRoutes = save;
    try {
      render(<RoutesPage />);
      await user.click(await screen.findByRole("button", { name: "添加路由" }));
      await user.click(screen.getByLabelText("Northstar AI"));
      await user.click(screen.getByLabelText("Lantern Labs"));
      await user.click(screen.getByRole("button", { name: "加载已选上游模型" }));
      const first = screen.getByRole("group", { name: "统一模型分类" });
      await user.click(within(first).getByRole("button", { name: "gpt 1" }));
      await user.click(screen.getByRole("combobox", { name: "统一模型" }));
      await user.click(screen.getByRole("option", { name: "gpt-6-astra" }));
      await user.click(within(first).getByRole("button", { name: "claude 1" }));
      await user.click(screen.getByRole("combobox", { name: "统一模型" }));
      await user.click(screen.getByRole("option", { name: "claude-sonnet-5" }));
      await user.click(within(first).getByRole("button", { name: "gemini 1" }));
      await user.click(screen.getByRole("combobox", { name: "统一模型" }));

      await user.click(screen.getByRole("option", { name: "gemini-2.5-pro" }));
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(await screen.findByText(/已保存 3 个统一模型。/)).toHaveTextContent("如需更新 Codex 模型能力，请到 Codex 页面重新保存并启用网关，再完整退出并重启 Codex。");
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ targets: [
        { upstreamId: "up-northstar", modelId: "gpt-6-astra" },
        { upstreamId: "up-northstar", modelId: "claude-sonnet-5" },
        { upstreamId: "up-lantern", modelId: "gpt-6-astra" },
        { upstreamId: "up-lantern", modelId: "gemini-2.5-pro" },
      ] }));
      const filters = screen.getByRole("group", { name: "路由模型分类" });
      expect(within(filters).getByRole("button", { name: "全部 3" })).toBeVisible();
      expect(within(filters).getByRole("button", { name: "gpt 1" })).toBeVisible();
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });
});

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
      expect(await screen.findByText(/已保存 3 个统一模型。/)).toHaveTextContent("如需更新 Codex 模型能力，请到 Codex 页面重新保存并启用网关，再完整退出并重启 Codex。");
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
      await user.click(screen.getByRole("combobox", { name: "统一模型" }));
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
      expect(screen.getByRole("combobox", { name: "统一模型" })).toHaveTextContent("已选 3 个模型");
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
      expect(screen.getByRole("combobox", { name: "统一模型" })).toHaveTextContent("northstar-fast");
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ editId: "old", targets: [{ upstreamId: "up-northstar", modelId: "northstar-fast" }] }));
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });
});


describe("unified route ranges", () => {
  async function selectRange(user: ReturnType<typeof userEvent.setup>, model: string, min: string, max: string) {
    await user.click(screen.getByRole("checkbox", { name: `限制 ${model} 推理区间` }));
    await user.click(screen.getByRole("combobox", { name: `${model} 最低强度` }));
    await user.click(screen.getByRole("option", { name: min }));
    await user.click(screen.getByRole("combobox", { name: `${model} 最高强度` }));
    await user.click(screen.getByRole("option", { name: max }));
  }

  it("shows one model choice for shared IDs and saves distinct explicit per-model policies", async () => {
    const data = liveWorkspace(); data.upstreams[1].models.push("northstar-fast");
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    const original = defaultWorkspaceClient.saveModelRoutes; const save = vi.fn(async (_selection: ModelRouteSelection) => ({})); defaultWorkspaceClient.saveModelRoutes = save;
    try {
      const user = userEvent.setup(); render(<RoutesPage />); await screen.findByText("本机运行时路由"); await selectModels(user);
      await user.click(screen.getByRole("combobox", { name: "统一模型" }));
      expect(screen.getAllByRole("option", { name: "northstar-fast" })).toHaveLength(1);
      await user.click(screen.getByRole("combobox", { name: "统一模型" }));
      const protocols = screen.getByRole("group", { name: "协议设置" });
      expect(within(protocols).getAllByRole("combobox")).toHaveLength(2);
      await selectRange(user, "northstar-fast", "low", "xhigh");
      await selectRange(user, "northstar-large", "high", "max");
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ replaceTargets: true, modelReasoning: [
        { modelId: "northstar-fast", min: "low", max: "xhigh" }, { modelId: "northstar-large", min: "high", max: "max" }, { modelId: "lantern-haiku", clear: true },
      ] }));
      expect(save.mock.calls[0][0].targets).toContainEqual({ upstreamId: "up-lantern", modelId: "northstar-fast" });
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });

  it("removes models with no remaining upstream and never adds a model-less upstream target", async () => {
    const data = liveWorkspace(); vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    const original = defaultWorkspaceClient.saveModelRoutes; const save = vi.fn(async (_selection: ModelRouteSelection) => ({})); defaultWorkspaceClient.saveModelRoutes = save;
    try {
      const user = userEvent.setup(); render(<RoutesPage />); await screen.findByText("本机运行时路由"); await selectModels(user);
      await user.click(screen.getByLabelText("Northstar AI"));
      expect(screen.getByRole("combobox", { name: "统一模型" })).toHaveTextContent("lantern-haiku");
      expect(screen.queryByRole("checkbox", { name: "限制 northstar-fast 推理区间" })).not.toBeInTheDocument();
      await user.click(screen.getByLabelText("Northstar AI"));
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ replaceTargets: true, targets: [{ upstreamId: "up-lantern", modelId: "lantern-haiku" }] }));
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });

  it("keeps original undiscovered targets visible, remembers edit policy and restores saved values after cancel", async () => {
    const data = liveWorkspace(); data.upstreams[0].models = [];
    data.routes = [{ id: "old", alias: "custom-alias", enabled: false, inboundProtocol: "Res", outboundProtocol: "Chat", reasoning: { min: "medium", max: "max" }, targets: [{ upstreamId: "up-northstar", upstreamModel: "old-model" }] }];
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    const original = defaultWorkspaceClient.saveModelRoutes; const save = vi.fn(async (_selection: ModelRouteSelection) => ({})); defaultWorkspaceClient.saveModelRoutes = save;
    try {
      const user = userEvent.setup(); render(<RoutesPage />); await user.click(await screen.findByRole("button", { name: "编辑" }));
      expect(screen.getByText(/未在当前发现列表中/)).toBeVisible();
      expect(screen.getByRole("combobox", { name: "old-model 最低强度" })).toHaveTextContent("medium");
      await user.click(screen.getByRole("checkbox", { name: "限制 old-model 推理区间" }));
      await user.click(screen.getByRole("button", { name: "取消" }));
      await user.click(screen.getByRole("button", { name: "编辑" }));
      expect(screen.getByRole("checkbox", { name: "限制 old-model 推理区间" })).toBeChecked();
      await user.click(screen.getByLabelText("Lantern Labs"));
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ editId: "old", targets: [{ upstreamId: "up-northstar", modelId: "old-model" }], modelReasoning: [{ modelId: "old-model", min: "medium", max: "max" }] }));
      expect(screen.getByRole("row", { name: /custom-alias/ })).toHaveTextContent("已停用");
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });

  it("blocks reversed ranges, omits persistent and preserves choices on save failure", async () => {
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(liveWorkspace());
    const original = defaultWorkspaceClient.saveModelRoutes; const save = vi.fn(async () => { throw new Error("写入失败，请重试"); }); defaultWorkspaceClient.saveModelRoutes = save;
    try {
      const user = userEvent.setup(); render(<RoutesPage />); await screen.findByText("本机运行时路由"); await selectModels(user);
      await selectRange(user, "northstar-fast", "max", "low");
      await user.click(screen.getByRole("combobox", { name: "northstar-fast 最高强度" }));
      expect(screen.getAllByRole("option").map(item => item.textContent)).toEqual(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);
      expect(screen.queryByRole("option", { name: "persistent" })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "ultra" })).not.toBeInTheDocument();
      expect(screen.getByText(/Ultra 是 Codex 界面别名/)).toBeVisible();
      await user.click(screen.getByRole("combobox", { name: "northstar-fast 最高强度" }));
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("最低强度不能高于最高强度"); expect(save).not.toHaveBeenCalled();
      await user.click(screen.getByRole("combobox", { name: "northstar-fast 最高强度" })); await user.click(screen.getByRole("option", { name: "max" }));
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("写入失败");
      expect(screen.getByRole("combobox", { name: "northstar-fast 最低强度" })).toHaveTextContent("max");
      expect(screen.getByRole("combobox", { name: "统一模型" })).toHaveTextContent("已选 3 个模型");
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });

  it("clears a legacy policy explicitly and prevents duplicate saves and closing while saving", async () => {
    const data = liveWorkspace(); data.routes = [{ id: "old", alias: "custom", enabled: true, inboundProtocol: "Res", outboundProtocol: "Res", reasoning: { min: "low", max: "high" }, targets: [{ upstreamId: "up-northstar", upstreamModel: "northstar-fast" }] }];
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(data);
    let finish!: (value: unknown) => void; const original = defaultWorkspaceClient.saveModelRoutes; const save = vi.fn(() => new Promise(resolve => { finish = resolve; })); defaultWorkspaceClient.saveModelRoutes = save;
    try {
      const user = userEvent.setup(); render(<RoutesPage />); await user.click(await screen.findByRole("button", { name: "编辑" }));
      await user.click(screen.getByRole("checkbox", { name: "限制 northstar-fast 推理区间" }));
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelReasoning: [{ modelId: "northstar-fast", clear: true }] }));
      expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "关闭弹窗" })).toBeDisabled();
      await user.keyboard("{Escape}"); expect(screen.getByRole("dialog")).toBeVisible(); expect(save).toHaveBeenCalledTimes(1);
      await act(async () => finish({})); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally { defaultWorkspaceClient.saveModelRoutes = original; }
  });
});


it("keeps Escape inside an open selector, then closes the editor and restores trigger focus", async () => {
  vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(liveWorkspace());
  const user = userEvent.setup(); render(<RoutesPage />);
  const trigger = await screen.findByRole("button", { name: "添加路由" }); await user.click(trigger);
  const protocol = screen.getByRole("combobox", { name: "客户端协议 / 入站" });
  protocol.focus(); await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(protocol).toHaveTextContent("Mes");
  await user.keyboard("{ArrowDown}{Escape}");
  expect(screen.getByRole("dialog")).toBeVisible(); expect(protocol).toHaveAttribute("aria-expanded", "false");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
});


it("starts a newly enabled interval at none through max without offering ultra", async () => {
  vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue(liveWorkspace());
  const user = userEvent.setup(); render(<RoutesPage />); await screen.findByText("本机运行时路由"); await selectModels(user);
  await user.click(screen.getByRole("checkbox", { name: "限制 northstar-fast 推理区间" }));
  expect(screen.getByRole("combobox", { name: "northstar-fast 最低强度" })).toHaveTextContent("none");
  expect(screen.getByRole("combobox", { name: "northstar-fast 最高强度" })).toHaveTextContent("max");
  await user.click(screen.getByRole("combobox", { name: "northstar-fast 最高强度" }));
  const values = screen.getAllByRole("option").map(option => option.textContent);
  expect(values.at(-1)).toBe("max");
  expect(values).not.toContain("ultra");
});
