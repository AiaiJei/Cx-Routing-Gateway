import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouteEditor } from "./RouteEditor";
import { CodexModelsPanel } from "./CodexModelsPanel";
import type { ModelRoute, ModelRouteSelection } from "../domain/types";

const baseRoute: ModelRoute = { id: "res", alias: "shared", inboundProtocol: "Res", outboundProtocol: "Chat", enabled: true, targets: [{ upstreamId: "up", upstreamModel: "shared" }] };
const upstreams = [{ id: "up", name: "Test upstream", models: ["shared"], baseUrl: "https://example.test", credentialLabel: "masked", status: "待测试" as const }];

function editor(route: ModelRoute = baseRoute, routes: ModelRoute[] = [route], failure?: string) {
  const save = vi.fn(async (_selection: ModelRouteSelection) => { if (failure) throw new Error(failure); });
  render(<RouteEditor route={structuredClone(route)} routes={structuredClone(routes)} upstreams={upstreams} live onSave={save} onClose={() => {}} />);
  return save;
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(screen.getByRole("option", { name: value }));
}

async function enter(user: ReturnType<typeof userEvent.setup>, name: string, value: string) {
  const input = screen.getByRole("textbox", { name });
  await user.clear(input);
  if (value) await user.type(input, value);
}

describe("route model capabilities", () => {
  it("keeps each selected model's saved capability and unknown models separate when creating a batch", async () => {
    const save = vi.fn(async (_selection: ModelRouteSelection) => {});
    render(<RouteEditor route={null} routes={[{ ...baseRoute, capabilities: { contextWindow: 64000, tools: true } }]} upstreams={[{ ...upstreams[0], models: ["shared", "other"] }]} live onSave={save} onClose={() => {}} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Test upstream" }));
    await user.click(screen.getByRole("button", { name: "加载已选上游模型" }));
    await user.click(screen.getByRole("combobox", { name: "统一模型" }));
    await user.click(screen.getByRole("option", { name: "shared" }));
    await user.click(screen.getByRole("option", { name: "other" }));
    await user.click(screen.getByRole("combobox", { name: "统一模型" }));
    expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue("64000");
    expect(screen.getByRole("textbox", { name: "other 上下文窗口" })).toHaveValue("");
    await enter(user, "other 最大输出", "4096");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelCapabilities: [
      { modelId: "shared", capabilities: { contextWindow: 64000, tools: true } },
      { modelId: "other", capabilities: { maxOutputTokens: 4096 } },
    ] }));
  });

  it("explains image and tool defaults and saves the operator's per-model choices", async () => {
    const save = editor(); const user = userEvent.setup();
    expect(screen.getByRole("combobox", { name: "shared 输入能力" })).toHaveTextContent("默认（文本和图片）");
    expect(screen.getByRole("combobox", { name: "shared 工具能力" })).toHaveTextContent("按上游处理");
    expect(screen.getByText(/工具请求继续转发/)).toHaveTextContent("不代表已确认上游支持");
    expect(screen.getByText(/按模型供应商官方资料填写/)).toBeVisible();
    await enter(user, "shared 上下文窗口", "128000");
    await enter(user, "shared 最大输出", "32000");
    await choose(user, "shared 输入能力", "文本和图片");
    await choose(user, "shared 工具能力", "支持");
    await user.click(screen.getByRole("checkbox", { name: "指定 shared 支持的推理强度" }));
    await user.click(screen.getByRole("checkbox", { name: "shared 支持 low" }));
    await user.click(screen.getByRole("checkbox", { name: "shared 支持 high" }));
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelCapabilities: [{ modelId: "shared", capabilities: { contextWindow: 128000, maxOutputTokens: 32000, inputModalities: ["text", "image"], tools: true, reasoningEfforts: ["low", "high"] } }] }));
  });

  it("loads false and empty reasoning without turning them into unknown, and can clear all fields", async () => {
    const save = editor({ ...baseRoute, capabilities: { contextWindow: 64000, maxOutputTokens: 16000, inputModalities: ["text"], tools: false, reasoningEfforts: [] } });
    const user = userEvent.setup();
    expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue("64000");
    expect(screen.getByRole("combobox", { name: "shared 工具能力" })).toHaveTextContent("不支持");
    expect(screen.getByRole("checkbox", { name: "指定 shared 支持的推理强度" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ modelCapabilities: [{ modelId: "shared", capabilities: { contextWindow: 64000, maxOutputTokens: 16000, inputModalities: ["text"], tools: false, reasoningEfforts: [] } }] }));
    await user.click(screen.getByRole("button", { name: "清空 shared 能力配置" }));
    expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "shared 输入能力" })).toHaveTextContent("默认（文本和图片）");
    expect(screen.getByRole("combobox", { name: "shared 工具能力" })).toHaveTextContent("按上游处理");
    expect(screen.getByRole("checkbox", { name: "指定 shared 支持的推理强度" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ modelCapabilities: [{ modelId: "shared", capabilities: null }] }));
  });

  it("preserves explicit text-only but omits modalities when restoring the default", async () => {
    const save = editor({ ...baseRoute, capabilities: { contextWindow: 64000, inputModalities: ["text"] } });
    const user = userEvent.setup();
    expect(screen.getByRole("combobox", { name: "shared 输入能力" })).toHaveTextContent("仅文本");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ modelCapabilities: [{ modelId: "shared", capabilities: { contextWindow: 64000, inputModalities: ["text"] } }] }));
    await choose(user, "shared 输入能力", "默认（文本和图片）");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ modelCapabilities: [{ modelId: "shared", capabilities: { contextWindow: 64000 } }] }));
  });

  it("keeps default image and forwarded tools absent from the stored capabilities", async () => {
    const save = editor(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelCapabilities: [{ modelId: "shared", capabilities: null }] }));
  });

  it("rejects invalid numeric limits and keeps the rejected input available to correct", async () => {
    const save = editor(); const user = userEvent.setup();
    for (const value of ["0", "-1", "1.5", "100000001", "9007199254740992"]) {
      await enter(user, "shared 上下文窗口", value);
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(screen.getByRole("alert")).toHaveTextContent("上下文窗口必须是 1 至 100000000 的整数");
      expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue(value);
      expect(save).not.toHaveBeenCalled();
    }
    await enter(user, "shared 上下文窗口", "64000");
    await enter(user, "shared 最大输出", "64001");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(screen.getByRole("alert")).toHaveTextContent("最大输出不能超过上下文窗口");
    expect(save).not.toHaveBeenCalled();
  });

  it("accepts the maximum safe configured limit and rejects malformed output values without losing edits", async () => {
    const save = editor(); const user = userEvent.setup();
    await enter(user, "shared 上下文窗口", "100000000");
    for (const value of ["0", "-1", "1.5", "1e3", "100000001"]) {
      await enter(user, "shared 最大输出", value);
      await user.click(screen.getByRole("button", { name: "保存路由" }));
      expect(screen.getByRole("alert")).toHaveTextContent("最大输出必须是 1 至 100000000 的整数");
      expect(save).not.toHaveBeenCalled();
    }
    await enter(user, "shared 最大输出", "100000000");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelCapabilities: [{ modelId: "shared", capabilities: { contextWindow: 100000000, maxOutputTokens: 100000000 } }] }));
  });

  it("keeps capability drafts including invalid text separate for each inbound protocol", async () => {
    const res = { ...baseRoute, capabilities: { contextWindow: 64000, tools: false } } satisfies ModelRoute;
    const chat = { ...baseRoute, id: "chat", inboundProtocol: "Chat", capabilities: { contextWindow: 128000, inputModalities: ["text", "image"] } } satisfies ModelRoute;
    const save = editor(res, [res, chat]); const user = userEvent.setup();
    await enter(user, "shared 上下文窗口", "1.5");
    await choose(user, "客户端协议 / 入站", "Chat");
    expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue("128000");
    await enter(user, "shared 上下文窗口", "256000");
    await choose(user, "客户端协议 / 入站", "Res");
    expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue("1.5");
    expect(screen.getByRole("combobox", { name: "shared 工具能力" })).toHaveTextContent("不支持");
    await choose(user, "客户端协议 / 入站", "Chat");
    expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue("256000");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ inboundProtocol: "Chat", modelCapabilities: [{ modelId: "shared", capabilities: { contextWindow: 256000, inputModalities: ["text", "image"] } }] }));
  });

  it("remembers an explicit clear for its own protocol and retains the edited source capability in a new protocol", async () => {
    const res = { ...baseRoute, enabled: false, capabilities: { contextWindow: 64000, tools: false } } satisfies ModelRoute;
    const chat = { ...baseRoute, id: "chat", inboundProtocol: "Chat", capabilities: { contextWindow: 128000 } } satisfies ModelRoute;
    const save = editor(res, [res, chat]); const user = userEvent.setup();
    await choose(user, "客户端协议 / 入站", "Mes");
    expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue("64000");
    await choose(user, "客户端协议 / 入站", "Chat");
    await user.click(screen.getByRole("button", { name: "清空 shared 能力配置" }));
    await choose(user, "客户端协议 / 入站", "Res");
    expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue("64000");
    await choose(user, "客户端协议 / 入站", "Chat");
    expect(screen.getByRole("textbox", { name: "shared 上下文窗口" })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ modelCapabilities: [{ modelId: "shared", capabilities: null }] }));
  });

  it("rejects a reasoning capability list with no allowed route level", async () => {
    const save = editor({ ...baseRoute, reasoning: { min: "medium", max: "high" }, capabilities: { reasoningEfforts: ["low"] } });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(screen.getByRole("alert")).toHaveTextContent("支持的推理强度与允许区间没有交集");
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "shared 支持 high" }));
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledOnce();
  });

  it("retains capability edits when saving fails", async () => {
    const save = editor(baseRoute, [baseRoute], "保存未成功，请重试"); const user = userEvent.setup();
    await enter(user, "shared 最大输出", "8192");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存未成功，请重试");
    expect(screen.getByRole("textbox", { name: "shared 最大输出" })).toHaveValue("8192");
    expect(save).toHaveBeenCalledOnce();
  });

  it("summarizes known and unknown capabilities and explains the startup catalog refresh", () => {
    render(<CodexModelsPanel routes={[
      { ...baseRoute, capabilities: { contextWindow: 128000, maxOutputTokens: 32000, inputModalities: ["text", "image"], tools: true, reasoningEfforts: ["low", "high"] } },
      { ...baseRoute, id: "legacy", alias: "legacy" },
    ]} upstreams={upstreams} routeIds={[]} defaultRouteId="" onModels={() => {}} onDefault={() => {}} locked={false} gatewayReady loading={false} />);
    expect(screen.getByText(/上下文 128000 · 最大输出 32000 · 文本和图片 · 工具支持 · 支持强度 low、high/)).toBeVisible();
    expect(screen.getByText(/上下文未知 · 最大输出未知 · 默认（文本和图片） · 工具按上游处理 · 支持强度未知/)).toBeVisible();
    expect(screen.getByText(/重新保存并启用网关/)).toHaveTextContent("完整退出并重启 Codex");
  });

  it("excludes models explicitly lacking tools while retaining unknown support and marks prior selections unavailable", () => {
    render(<CodexModelsPanel routes={[
      { ...baseRoute, id: "no-tools", alias: "no-tools", capabilities: { tools: false } },
      { ...baseRoute, id: "unknown", alias: "unknown-tools" },
    ]} upstreams={upstreams} routeIds={["no-tools"]} defaultRouteId="no-tools" onModels={() => {}} onDefault={() => {}} locked={false} gatewayReady loading={false} />);
    expect(screen.queryByRole("checkbox", { name: "选择 no-tools" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "选择 unknown-tools" })).toBeVisible();
    expect(screen.getByText(/已选模型中有 1 个/)).toHaveTextContent("明确不支持工具");
    expect(screen.getByRole("combobox", { name: "默认模型" })).toHaveTextContent("先选择模型");
  });
});
