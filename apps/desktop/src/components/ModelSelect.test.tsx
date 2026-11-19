import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ModelSelect } from "./ModelSelect";

function Harness({ models = ["unknown", "claude-sonnet-5", "gpt-6-astra", "kimi-k2"], initial = [] }: { models?: string[]; initial?: string[] }) {
  const [value, setValue] = useState(initial);
  return <><ModelSelect ariaLabel="测试上游 模型" models={models} value={value} onChange={setValue} /><output aria-label="选择结果">{JSON.stringify(value)}</output></>;
}

describe("ModelSelect", () => {
  it("groups in family order and preserves selections across category switches", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "测试上游 模型" });
    const filters = screen.getByRole("group", { name: "测试上游 模型分类" });
    await user.click(trigger);
    expect(screen.getAllByRole("group").filter(item => item.closest('[role="listbox"]')).map(item => item.getAttribute("aria-label"))).toEqual(["gpt", "claude", "kimi", "其他"]);
    await user.click(screen.getByRole("option", { name: "gpt-6-astra" }));
    await user.click(within(filters).getByRole("button", { name: "claude 1" }));
    expect(trigger).toHaveTextContent("gpt-6-astra");
    await user.click(trigger);
    expect(screen.queryByRole("option", { name: "gpt-6-astra" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "claude-sonnet-5" }));
    expect(trigger).toHaveTextContent("已选 2 个模型");
    expect(screen.getByLabelText("选择结果")).toHaveTextContent('["gpt-6-astra","claude-sonnet-5"]');
    await user.click(within(filters).getByRole("button", { name: "全部 4" }));
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "gpt-6-astra" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "claude-sonnet-5" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("option", { name: "gpt-6-astra" }));
    expect(screen.getByLabelText("选择结果")).toHaveTextContent('["claude-sonnet-5"]');
  });

  it("keeps missing selected models, deduplicates discovered IDs and explains an empty category", async () => {
    const user = userEvent.setup();
    render(<Harness models={["gpt-6-astra", "gpt-6-astra"]} initial={["moonshot-v1-8k"]} />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("moonshot-v1-8k");
    expect(screen.getByRole("button", { name: "全部 2" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "gemini 0" }));
    await user.click(trigger);
    expect(screen.getByText("该分类暂无模型")).toBeVisible();
    expect(screen.getByLabelText("选择结果")).toHaveTextContent('["moonshot-v1-8k"]');
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "kimi 1" }));
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "moonshot-v1-8k" })).toHaveAttribute("aria-selected", "true");
  });
});
