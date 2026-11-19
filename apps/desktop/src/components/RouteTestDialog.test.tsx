import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouteTestDialog } from "./RouteTestDialog";

const route = {
  id: "route-fast",
  alias: "gateway-fast",
  inboundProtocol: "Res" as const,
  outboundProtocol: "Chat" as const,
  enabled: true,
  targets: [{ upstreamId: "up-northstar", upstreamModel: "northstar-fast" }],
};

describe("RouteTestDialog", () => {
  it("opens with the requested prompt and renders the real response result", async () => {
    const user = userEvent.setup();
    const testRoute = vi.fn().mockResolvedValue({ routeAlias: "gateway-fast", text: "OK", requestId: "req-test", durationMs: 184, status: 200 });
    render(<RouteTestDialog route={route} targetNames={["Northstar AI"]} onClose={vi.fn()} testRoute={testRoute} />);

    expect(screen.getByRole("dialog", { name: "测试调用 · gateway-fast" })).toBeVisible();
    expect(screen.getByLabelText("发送内容")).toHaveValue("请回复OK");
    expect(screen.getByText("Northstar AI")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "发送测试请求" }));
    expect(testRoute).toHaveBeenCalledWith("route-fast", "请回复OK");
    expect(await screen.findByText("OK")).toBeVisible();
    expect(screen.getByText("req-test")).toBeVisible();
    expect(screen.getByText("184 ms")).toBeVisible();
  });

  it("shows a request error without closing the window", async () => {
    const user = userEvent.setup();
    render(<RouteTestDialog route={route} targetNames={[]} onClose={vi.fn()} testRoute={vi.fn().mockRejectedValue(new Error("上游响应超时"))} />);

    await user.click(screen.getByRole("button", { name: "发送测试请求" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("上游响应超时");
    expect(screen.getByRole("dialog", { name: "测试调用 · gateway-fast" })).toBeVisible();
  });

  it("keeps the dialog open while a real request is pending", async () => {
    const user = userEvent.setup();
    let finishRequest!: (value: { routeAlias: string; text: string; requestId: string; durationMs: number; status: number }) => void;
    const testRoute = vi.fn(() => new Promise<{ routeAlias: string; text: string; requestId: string; durationMs: number; status: number }>(resolve => { finishRequest = resolve; }));
    const { container } = render(<RouteTestDialog route={route} targetNames={["Northstar AI"]} onClose={vi.fn()} testRoute={testRoute} />);
    await user.click(screen.getByRole("button", { name: "发送测试请求" }));
    expect(screen.getByRole("button", { name: "请求中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "关闭弹窗" })).toBeDisabled();
    await user.keyboard("{Escape}");
    const backdrop = container.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop!);
    expect(screen.getByRole("dialog", { name: "测试调用 · gateway-fast" })).toBeVisible();
    finishRequest({ routeAlias: "gateway-fast", text: "OK", requestId: "req-pending", durationMs: 80, status: 200 });
    expect(await screen.findByText("OK")).toBeVisible();
  });

  it("keeps failed request metadata available for log correlation", async () => {
    const user = userEvent.setup();
    const testRoute = vi.fn().mockResolvedValue({ routeAlias: "gateway-fast", text: "", requestId: "req-failed", durationMs: 210, status: 502, error: "上游请求失败" });
    render(<RouteTestDialog route={route} targetNames={[]} onClose={vi.fn()} testRoute={testRoute} />);
    await user.click(screen.getByRole("button", { name: "发送测试请求" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("上游请求失败");
    expect(screen.getByText("req-failed")).toBeVisible();
    expect(screen.getByText("210 ms")).toBeVisible();
    expect(screen.getByText("HTTP 502")).toBeVisible();
  });
});
