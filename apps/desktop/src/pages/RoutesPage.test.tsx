import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoutesPage } from "./RoutesPage";

describe("RoutesPage", () => {
  it("keeps request protocol, configured upstream protocol, and response direction distinct", async () => {
    render(<RoutesPage />);
    expect(await screen.findByText("Res 入站 → Chat 出站 → Res 响应")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "客户端协议 / 入站" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "上游协议 / 出站" })).toBeVisible();
    expect(screen.getByText("示例路由 · 未连接运行时")).toBeVisible();
  });

  it("adds a local demonstration route with separate inbound and outbound protocols", async () => {
    const user = userEvent.setup();
    render(<RoutesPage />);
    await user.click(screen.getByRole("button", { name: "添加路由" }));
    await user.type(screen.getByLabelText("客户端模型别名"), "demo-model");
    await user.selectOptions(screen.getByLabelText("客户端协议 / 入站"), "Res");
    await user.selectOptions(screen.getByLabelText("目标上游"), "up-northstar");
    await user.selectOptions(screen.getByLabelText("上游协议 / 出站"), "Chat");
    await user.type(screen.getByLabelText("上游模型"), "northstar-fast");
    await user.click(screen.getByRole("button", { name: "保存示例路由" }));
    expect(screen.getByText("demo-model")).toBeVisible();
    const row = screen.getByRole("row", { name: /demo-model/ });
    expect(row).toHaveTextContent("Res 入站");
    expect(row).toHaveTextContent("Chat");
    expect(row).toHaveTextContent("Res 响应");
    expect(screen.getByRole("status")).toHaveTextContent("刷新后不会保留");
  });
});
