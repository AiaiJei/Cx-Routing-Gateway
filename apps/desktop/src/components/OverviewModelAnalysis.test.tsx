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
  it("renders one comparison chart with at most five models, never an expandable table", () => {
    render(<MemoryRouter><OverviewModelAnalysis models={manyModels} /></MemoryRouter>);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /展开全部/ })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "模型调用量对比图" }).querySelectorAll("rect[data-model]")).toHaveLength(5);
    expect(screen.getByText("1–5 / 60 个模型")).toBeVisible();
    expect(screen.getByRole("button", { name: "上一组模型" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下一组模型" }));
    expect(screen.getByText("6–10 / 60 个模型")).toBeVisible();
    expect(screen.getByRole("img", { name: "模型调用量对比图" }).querySelectorAll("rect[data-model]")).toHaveLength(5);
  });

  it("locates a model outside the current group and shows its details", () => {
    render(<MemoryRouter><OverviewModelAnalysis models={manyModels} /></MemoryRouter>);
    fireEvent.change(screen.getByRole("combobox", { name: "查看模型" }), { target: { value: "model-059" } });
    expect(screen.getByText("56–60 / 60 个模型")).toBeVisible();
    expect(screen.getByRole("button", { name: "下一组模型" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "查看 model-059" })).toHaveAttribute("aria-pressed", "true");
    const detail = screen.getByRole("region", { name: "所选模型明细" });
    expect(detail).toHaveTextContent("最近调用成功");
    expect(detail).toHaveTextContent("125 ms");
    expect(detail).toHaveTextContent("1 / 1 条上报");
  });

  it("changes metric ranking while preserving missing and zero values", () => {
    render(<MemoryRouter><OverviewModelAnalysis models={[modelSummary("busy", 10, null), modelSummary("tokens", 1, 80), modelSummary("zero", 2, 0)]} /></MemoryRouter>);
    fireEvent.change(screen.getByRole("combobox", { name: "比较指标" }), { target: { value: "tokens" } });
    const chart = screen.getByRole("img", { name: "模型已上报 Token 对比图" });
    expect([...chart.querySelectorAll("rect[data-model]")].map((bar) => bar.getAttribute("data-model"))).toEqual(["tokens", "zero"]);
    expect(chart.querySelector('[data-model="zero"]')).toHaveAttribute("width", "0");
    expect(chart.querySelector('[data-model="busy"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看 busy" }));
    expect(screen.getByRole("region", { name: "所选模型明细" })).toHaveTextContent("未上报");
  });

  it("uses one global zero-based scale across groups and a 100-percent scale for rates", () => {
    render(<MemoryRouter><OverviewModelAnalysis models={manyModels} /></MemoryRouter>);
    const firstScale = screen.getByRole("img", { name: "模型调用量对比图" }).getAttribute("data-maximum");
    fireEvent.click(screen.getByRole("button", { name: "下一组模型" }));
    expect(screen.getByRole("img", { name: "模型调用量对比图" })).toHaveAttribute("data-maximum", firstScale);
    fireEvent.change(screen.getByRole("combobox", { name: "比较指标" }), { target: { value: "successRate" } });
    expect(screen.getByRole("img", { name: "模型成功率对比图" })).toHaveAttribute("data-maximum", "100");
    expect(screen.getByText("1–5 / 60 个模型")).toBeVisible();
  });

  it("keeps selection valid when a refresh reduces the model population", () => {
    const { rerender } = render(<MemoryRouter><OverviewModelAnalysis models={manyModels} /></MemoryRouter>);
    fireEvent.change(screen.getByRole("combobox", { name: "查看模型" }), { target: { value: "model-059" } });
    rerender(<MemoryRouter><OverviewModelAnalysis models={[modelSummary("remaining")]} /></MemoryRouter>);
    expect(screen.getByRole("combobox", { name: "查看模型" })).toHaveValue("remaining");
    expect(screen.getByText("1–1 / 1 个模型")).toBeVisible();
    expect(screen.getByRole("button", { name: "下一组模型" })).toBeDisabled();
  });

  it("distinguishes no calls from missing observations for a selected metric", () => {
    const { rerender } = render(<MemoryRouter><OverviewModelAnalysis models={[]} /></MemoryRouter>);
    expect(screen.getByText("当前范围内没有模型调用记录")).toBeVisible();
    rerender(<MemoryRouter><OverviewModelAnalysis models={[modelSummary("unknown", 1, null)]} /></MemoryRouter>);
    fireEvent.change(screen.getByRole("combobox", { name: "比较指标" }), { target: { value: "tokens" } });
    expect(screen.getByText("本组模型未上报该指标")).toBeVisible();
    expect(screen.getByRole("img", { name: "模型已上报 Token 对比图" }).querySelectorAll("rect[data-model]")).toHaveLength(0);
    expect(within(screen.getByRole("region", { name: "所选模型明细" })).getByText("未上报")).toBeVisible();
  });
});
