import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SegmentedControl } from "./SegmentedControl";

function TestControl() {
  const [value, setValue] = useState("全部");
  return <SegmentedControl ariaLabel="按状态筛选" value={value} options={["全部", "成功", "失败"]} onChange={setValue} />;
}

describe("SegmentedControl", () => {
  it("updates the pressed state when a segment is selected", async () => {
    const user = userEvent.setup();
    render(<TestControl />);

    const all = screen.getByRole("button", { name: "全部" });
    const failed = screen.getByRole("button", { name: "失败" });
    expect(screen.getByRole("group", { name: "按状态筛选" })).toBeVisible();
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(failed).toHaveAttribute("aria-pressed", "false");

    await user.click(failed);
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(failed).toHaveAttribute("aria-pressed", "true");
  });

  it("supports keyboard focus and activation", async () => {
    const user = userEvent.setup();
    render(<TestControl />);

    await user.tab();
    expect(screen.getByRole("button", { name: "全部" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "成功" })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "成功" })).toHaveAttribute("aria-pressed", "true");
  });
});
