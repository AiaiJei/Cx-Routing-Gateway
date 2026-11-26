import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouteEditor } from "./RouteEditor";
import type { ModelRoute, ModelRouteSelection, Protocol } from "../domain/types";

const routes: ModelRoute[] = [
  { id: "res", alias: "shared", inboundProtocol: "Res", outboundProtocol: "Chat", enabled: true, targets: [{ upstreamId: "up", upstreamModel: "shared" }], reasoning: { min: "low", max: "high" } },
  { id: "chat", alias: "shared", inboundProtocol: "Chat", outboundProtocol: "Chat", enabled: true, targets: [{ upstreamId: "up", upstreamModel: "shared" }], reasoning: { min: "xhigh", max: "max" } },
];

function editor(route: ModelRoute | null = null, availableRoutes = routes) {
  const save = vi.fn(async (_selection: ModelRouteSelection) => {});
  render(<RouteEditor route={route} routes={structuredClone(availableRoutes)} upstreams={[
    { id: "up", name: "Test upstream", models: ["shared"], baseUrl: "https://example.test", credentialLabel: "masked", status: "待测试" },
  ]} live onSave={save} onClose={() => {}} />);
  return save;
}

async function addModel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("checkbox", { name: "Test upstream" }));
  await user.click(screen.getByRole("button", { name: "加载已选上游模型" }));
  await user.click(screen.getByRole("combobox", { name: "统一模型" }));
  await user.click(screen.getByRole("option", { name: "shared" }));
  await user.click(screen.getByRole("combobox", { name: "统一模型" }));
}

async function switchInbound(user: ReturnType<typeof userEvent.setup>, protocol: Protocol) {
  await user.click(screen.getByRole("combobox", { name: "客户端协议 / 入站" }));
  await user.click(screen.getByRole("option", { name: protocol }));
}

async function minimum(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.click(screen.getByRole("combobox", { name: "shared 最低强度" }));
  await user.click(screen.getByRole("option", { name: value }));
}

describe("route policies across inbound protocols", () => {
  it("loads the target protocol's saved policy before saving a selected shared model", async () => {
    const save = editor(); const user = userEvent.setup(); await addModel(user);
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("low");
    await switchInbound(user, "Chat");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("xhigh");
    expect(screen.getByRole("combobox", { name: "shared 最高强度" })).toHaveTextContent("max");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ inboundProtocol: "Chat", modelReasoning: [{ modelId: "shared", min: "xhigh", max: "max" }] }));
  });

  it("keeps manual ranges separate when switching protocols in both directions", async () => {
    const save = editor(); const user = userEvent.setup(); await addModel(user);
    await minimum(user, "medium");
    await switchInbound(user, "Chat"); await minimum(user, "high");
    await switchInbound(user, "Res");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("medium");
    expect(screen.getByRole("combobox", { name: "shared 最高强度" })).toHaveTextContent("high");
    await switchInbound(user, "Chat");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("high");
    expect(screen.getByRole("combobox", { name: "shared 最高强度" })).toHaveTextContent("max");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelReasoning: [{ modelId: "shared", min: "high", max: "max" }] }));
  });

  it("remembers an explicit unrestricted choice for only that protocol", async () => {
    const save = editor(); const user = userEvent.setup(); await addModel(user);
    await switchInbound(user, "Chat");
    await user.click(screen.getByRole("checkbox", { name: "限制 shared 推理区间" }));
    await switchInbound(user, "Res");
    expect(screen.getByRole("checkbox", { name: "限制 shared 推理区间" })).toBeChecked();
    await switchInbound(user, "Chat");
    expect(screen.getByRole("checkbox", { name: "限制 shared 推理区间" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelReasoning: [{ modelId: "shared", clear: true }] }));
  });

  it("keeps edited route policy drafts on round trips and preserves the original when moving to a new protocol", async () => {
    const edited = { ...structuredClone(routes[0]), alias: "custom-alias", enabled: false };
    const save = editor(edited); const user = userEvent.setup();
    await minimum(user, "medium");
    await switchInbound(user, "Mes");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("low");
    await minimum(user, "high");
    await switchInbound(user, "Res");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("medium");
    await switchInbound(user, "Mes");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("high");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ editId: "res", inboundProtocol: "Mes", modelReasoning: [{ modelId: "shared", min: "high", max: "high" }] }));
    expect(screen.getByText(/原调用名“custom-alias”和停用状态会保留/)).toBeVisible();
  });

  it("loads an existing target protocol policy while editing and restores the source draft on return", async () => {
    const save = editor(structuredClone(routes[0])); const user = userEvent.setup();
    await minimum(user, "medium");
    await switchInbound(user, "Chat");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("xhigh");
    await switchInbound(user, "Res");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("medium");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ editId: "res", inboundProtocol: "Res", modelReasoning: [{ modelId: "shared", min: "medium", max: "high" }] }));
  });

  it("ignores a disabled same-alias route before the active route when loading a protocol policy", async () => {
    const historical = { ...structuredClone(routes[1]), id: "disabled-chat", enabled: false, reasoning: { min: "none", max: "minimal" } } satisfies ModelRoute;
    const save = editor(null, [historical, ...routes]); const user = userEvent.setup(); await addModel(user);
    await switchInbound(user, "Chat");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("xhigh");
    expect(screen.getByRole("combobox", { name: "shared 最高强度" })).toHaveTextContent("max");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelReasoning: [{ modelId: "shared", min: "xhigh", max: "max" }] }));
  });

  it("uses the edited disabled route's own policy over an active same-alias route", async () => {
    const disabled = { ...structuredClone(routes[0]), id: "disabled-res", enabled: false, reasoning: { min: "none", max: "minimal" } } satisfies ModelRoute;
    const save = editor(disabled, [...routes, disabled]); const user = userEvent.setup();
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("none");
    await switchInbound(user, "Chat");
    expect(screen.getByRole("combobox", { name: "shared 最低强度" })).toHaveTextContent("xhigh");
    await switchInbound(user, "Res");
    expect(screen.getByRole("combobox", { name: "shared 最高强度" })).toHaveTextContent("minimal");
    await user.click(screen.getByRole("button", { name: "保存路由" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ editId: "disabled-res", modelReasoning: [{ modelId: "shared", min: "none", max: "minimal" }] }));
  });
});
