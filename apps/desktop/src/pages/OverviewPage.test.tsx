import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewPage } from "./OverviewPage";
import { MemoryRouter } from "react-router";

describe("OverviewPage", () => {
  it("shows fixture-backed runtime state and summaries derived from the sample logs", async () => {
    render(<MemoryRouter><OverviewPage /></MemoryRouter>);
    expect(await screen.findByText("示例数据 · 非实时" )).toBeVisible();
    expect(screen.getByText("运行时未接入")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByText("2 / 1")).toBeVisible();
    expect(screen.getByRole("heading", { name: "需要关注" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "配置就绪" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "配置上游" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看上游" })).toBeVisible();
    expect(screen.getByRole("link", { name: "查看路由" })).toBeVisible();
  });
});
