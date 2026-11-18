import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogsPage } from "./LogsPage";

describe("LogsPage", () => {
  it("filters sample logs and resets the filter", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    const search = screen.getByRole("searchbox", { name: "搜索调用日志" });
    await user.type(search, "req-29ab");
    expect(screen.getByText("req-29ab10ce")).toBeVisible();
    expect(screen.queryByText("req-7d3a9f21")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getByText("req-7d3a9f21")).toBeVisible();
  });

  it("filters sample logs by status", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.click(screen.getByRole("combobox", { name: "按状态筛选" }));
    await user.click(screen.getByRole("option", { name: "失败" }));
    expect(screen.getByText("req-29ab10ce")).toBeVisible();
    expect(screen.queryByText("req-7d3a9f21")).not.toBeInTheDocument();
  });

  it("shows an empty result for unmatched queries", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.type(screen.getByRole("searchbox", { name: "搜索调用日志" }), "absent");
    expect(screen.getByText("没有匹配的调用记录")).toBeVisible();
  });

  it("opens a redacted detail view without exposing request or response bodies", async () => {
    const user = userEvent.setup();
    render(<LogsPage />);
    await user.click(screen.getByRole("button", { name: "查看 req-7d3a9f21" }));
    const dialog = screen.getByRole("dialog", { name: "请求 req-7d3a9f21 详情" });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveClass("modal");
    expect(dialog).toHaveTextContent("Desktop client ·••••");
    expect(dialog).toHaveTextContent("请求和响应正文未记录");
    expect(screen.getByRole("button", { name: "关闭弹窗" })).toHaveTextContent("×");
  });
});
