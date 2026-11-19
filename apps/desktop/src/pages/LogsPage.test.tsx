import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogsPage } from "./LogsPage";
import "../styles/app.css";

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
