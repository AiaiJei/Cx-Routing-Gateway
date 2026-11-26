import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { OverviewModelAnalysis } from "./OverviewModelAnalysis";
import type { OverviewModelSummary } from "../domain/overview-analytics";

function modelSummary(model: string, calls = 1, total: number | null = 10): OverviewModelSummary {
  const empty = { value: null, reported: 0 };
  return { model, calls, succeeded: calls, failed: 0, successRate: 100, averageDurationMs: 125, durationReported: calls,
    tokens: { total: { value: total, reported: total === null ? 0 : calls }, input: empty, output: empty, cacheRead: empty, cacheWrite: empty }, latestStatus: "成功" };
}
const manyModels = Array.from({ length: 60 }, (_, index) => modelSummary(`model-${String(index).padStart(3, "0")}`, 60 - index));

describe("OverviewModelAnalysis", () => {
  it("aggregates every model into one colored chart without groups or an expandable table", () => {
    render(<MemoryRouter><OverviewModelAnalysis models={manyModels} /></MemoryRouter>);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /展开全部/ })).not.toBeInTheDocument();
    const chart = screen.getByRole("img", { name: "模型调用分布图" });
    const segments = [...chart.querySelectorAll("circle[data-model]")];
    expect(segments).toHaveLength(60);
    expect(new Set(segments.map((segment) => segment.getAttribute("stroke"))).size).toBe(60);
    expect(chart).toHaveAttribute("data-total", "1830");
    expect(screen.queryByRole("button", { name: /一组模型/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "比较指标" })).not.toBeInTheDocument();
  });

  it("selects any model from the common legend and keeps exact details", () => {
    render(<MemoryRouter><OverviewModelAnalysis models={manyModels} /></MemoryRouter>);
    fireEvent.change(screen.getByRole("combobox", { name: "查看模型" }), { target: { value: "model-059" } });
    expect(screen.getByRole("button", { name: "查看 model-059" })).toHaveAttribute("aria-pressed", "true");
    const detail = screen.getByRole("region", { name: "所选模型明细" });
    expect(detail).toHaveTextContent("最近调用成功");
    expect(detail).toHaveTextContent("125 ms");
    expect(detail).toHaveTextContent("1 / 1 条上报");
  });

  it("preserves missing token data while plotting known call counts", () => {
    render(<MemoryRouter><OverviewModelAnalysis models={[modelSummary("busy", 10, null), modelSummary("tokens", 1, 80), modelSummary("zero", 2, 0)]} /></MemoryRouter>);
    const chart = screen.getByRole("img", { name: "模型调用分布图" });
    expect(chart.querySelectorAll("circle[data-model]")).toHaveLength(3);
    expect(chart).toHaveAttribute("data-total", "13");
    fireEvent.click(screen.getByRole("button", { name: "查看 busy" }));
    expect(screen.getByRole("region", { name: "所选模型明细" })).toHaveTextContent("未上报");
  });

  it("reconciles shares to one and keeps model colors stable when counts reorder", () => {
    const models = [modelSummary("alpha", 2), modelSummary("beta", 1)];
    const { rerender } = render(<MemoryRouter><OverviewModelAnalysis models={models} /></MemoryRouter>);
    const chart = screen.getByRole("img", { name: "模型调用分布图" });
    const segments = [...chart.querySelectorAll("circle[data-model]")];
    expect(segments.reduce((total, segment) => total + Number(segment.getAttribute("data-share")), 0)).toBeCloseTo(1, 12);
    const alphaColor = chart.querySelector('[data-model="alpha"]')!.getAttribute("stroke");
    rerender(<MemoryRouter><OverviewModelAnalysis models={[modelSummary("beta", 9), modelSummary("alpha", 2)]} /></MemoryRouter>);
    expect(screen.getByRole("img", { name: "模型调用分布图" }).querySelector('[data-model="alpha"]')).toHaveAttribute("stroke", alphaColor);
  });

  it("keeps selection valid when a refresh reduces the model population", () => {
    const { rerender } = render(<MemoryRouter><OverviewModelAnalysis models={manyModels} /></MemoryRouter>);
    fireEvent.change(screen.getByRole("combobox", { name: "查看模型" }), { target: { value: "model-059" } });
    rerender(<MemoryRouter><OverviewModelAnalysis models={[modelSummary("remaining")]} /></MemoryRouter>);
    expect(screen.getByRole("combobox", { name: "查看模型" })).toHaveValue("remaining");
    expect(screen.getByRole("img", { name: "模型调用分布图" }).querySelectorAll("circle[data-model]")).toHaveLength(1);
  });

  it("distinguishes no calls from missing token observations", () => {
    const { rerender } = render(<MemoryRouter><OverviewModelAnalysis models={[]} /></MemoryRouter>);
    expect(screen.getByText("当前范围内没有模型调用记录")).toBeVisible();
    rerender(<MemoryRouter><OverviewModelAnalysis models={[modelSummary("unknown", 1, null)]} /></MemoryRouter>);
    expect(screen.getByRole("img", { name: "模型调用分布图" }).querySelectorAll("circle[data-model]")).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: "所选模型明细" })).getByText("未上报")).toBeVisible();
  });
});
