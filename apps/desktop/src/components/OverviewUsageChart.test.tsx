import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewUsageChart } from "./OverviewUsageChart";

const nowMs = Date.parse("2026-11-26T12:00:00.000Z");

describe("OverviewUsageChart", () => {
  it("announces the real count of retained request records", () => {
    render(<OverviewUsageChart logs={[
      { time: new Date(nowMs - 60 * 60 * 1000).toISOString() },
      { time: new Date(nowMs - 30 * 60 * 1000).toISOString() },
    ]} nowMs={nowMs} />);

    expect(screen.getByRole("heading", { name: "最近 24 小时请求趋势" })).toBeVisible();
    expect(screen.getByRole("img", { name: /共 2 条已记录请求/ })).toBeVisible();
  });

  it("marks a single hourly observation so the trend cannot render as an invisible one-point line", () => {
    const { container } = render(<OverviewUsageChart logs={[{ time: new Date(nowMs - 60 * 60 * 1000).toISOString() }]} nowMs={nowMs} />);

    expect(container.querySelectorAll(".overview-chart__point")).toHaveLength(1);
  });

  it("shows an empty state instead of a zero-data chart", () => {
    render(<OverviewUsageChart logs={[]} nowMs={nowMs} />);

    expect(screen.getByText("最近 24 小时没有已记录请求")).toBeVisible();
    expect(screen.queryByRole("img", { name: /请求趋势/ })).not.toBeInTheDocument();
  });

  it("warns when returned records reach the configured retention limit", () => {
    render(<OverviewUsageChart logs={[{ time: new Date(nowMs - 60 * 60 * 1000).toISOString() }]} nowMs={nowMs} retentionLimit={1} />);

    expect(screen.getByText(/保留上限/)).toBeVisible();
    expect(screen.getByRole("img", { name: /共 1 条已记录请求/ })).toBeVisible();
  });

  it("shows an honest empty message when no timestamps can be plotted", () => {
    render(<OverviewUsageChart logs={[{ time: "invalid" }]} nowMs={nowMs} />);

    expect(screen.getByText("最近 24 小时没有可绘制的请求记录")).toBeVisible();
  });
});
