import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpstreamsPage } from "./UpstreamsPage";

describe("UpstreamsPage", () => {
  it("filters upstreams and marks connectivity actions as simulated", async () => {
    const user = userEvent.setup();
    render(<UpstreamsPage />);
    const search = screen.getByRole("searchbox", { name: "搜索上游服务" });
    await user.type(search, "Northstar");
    expect(screen.getByText("Northstar AI")).toBeVisible();
    expect(screen.queryByText("Lantern Labs")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "测试 Northstar AI" }));
    expect(await screen.findByRole("status")).toHaveTextContent("未执行");
  });

  it("shows a useful empty result and lets the search be cleared", async () => {
    const user = userEvent.setup();
    render(<UpstreamsPage />);
    const search = screen.getByRole("searchbox", { name: "搜索上游服务" });
    await user.type(search, "missing");
    expect(screen.getByText("没有匹配的上游服务")).toBeVisible();
    await user.clear(search);
    expect(screen.getByText("Northstar AI")).toBeVisible();
  });

  it("adds a session-only upstream through a labeled form", async () => {
    const user = userEvent.setup();
    render(<UpstreamsPage />);
    await user.click(screen.getByRole("button", { name: "添加上游" }));
    await user.type(screen.getByLabelText("服务名称"), "Local Demo");
    await user.type(screen.getByLabelText("Base URL"), "https://local.example/v1");
    await user.selectOptions(screen.getByLabelText("上游出站协议"), "Chat");
    await user.click(screen.getByRole("button", { name: "保存示例上游" }));
    expect(screen.getByText("Local Demo")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("刷新后不会保留");
  });
});
