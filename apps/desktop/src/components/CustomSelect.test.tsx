import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { CustomSelect } from "./CustomSelect";

function TestSelect({ ariaLabel, name, initialValue, options }: { ariaLabel: string; name: string; initialValue: string; options: string[] }) {
  const [value, setValue] = useState(initialValue);
  return <CustomSelect ariaLabel={ariaLabel} name={name} value={value} options={options} onChange={setValue} />;
}

describe("CustomSelect", () => {
  it("opens a styled option menu and updates its selected value", async () => {
    const user = userEvent.setup();
    render(<TestSelect ariaLabel="协议" name="protocol" initialValue="Res" options={["Res", "Mes", "Chat"]} />);

    await user.click(screen.getByRole("combobox", { name: "协议" }));
    expect(screen.getByRole("listbox", { name: "协议" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Chat" })).toBeVisible();
    await user.click(screen.getByRole("option", { name: "Chat" }));
    expect(screen.getByRole("combobox", { name: "协议" })).toHaveTextContent("Chat");
    expect(screen.queryByRole("listbox", { name: "协议" })).not.toBeInTheDocument();
  });

  it("supports keyboard selection and Escape dismissal", async () => {
    const user = userEvent.setup();
    render(<TestSelect ariaLabel="模型" name="model" initialValue="one" options={["one", "two"]} />);
    const trigger = screen.getByRole("combobox", { name: "模型" });
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(trigger).toHaveTextContent("two");
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "模型" })).not.toBeInTheDocument();
  });
});

it("navigates grouped visible options without counting headings or losing hidden selections", async () => {
  const user = userEvent.setup();
  function GroupedSelect() {
    const [value, setValue] = useState(["hidden"]);
    return <CustomSelect multiple name="models" ariaLabel="分组模型" value={value} onChange={setValue} options={[
      { value: "hidden", label: "已选隐藏模型", group: "gpt", hidden: true },
      { value: "one", label: "第一模型", group: "gpt" },
      { value: "two", label: "第二模型", group: "claude" },
    ]} />;
  }
  render(<GroupedSelect />);
  const trigger = screen.getByRole("combobox");
  expect(trigger).toHaveTextContent("已选隐藏模型");
  await user.click(trigger);
  expect(within(screen.getByRole("group", { name: "gpt" })).getAllByRole("option")).toHaveLength(1);
  expect(screen.queryByRole("option", { name: "已选隐藏模型" })).not.toBeInTheDocument();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(screen.getByRole("option", { name: "第二模型" })).toHaveAttribute("aria-selected", "true");
  expect(trigger).toHaveTextContent("已选 2 个模型");
  expect([...document.querySelectorAll<HTMLInputElement>('input[name="models"]')].map(input => input.value)).toEqual(["hidden", "two"]);
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
});

function TestMultiSelect() {
  const [value, setValue] = useState<string[]>([]);
  return <CustomSelect multiple ariaLabel="多模型" name="models" value={value} options={["one", "two", "three"]} onChange={setValue} />;
}

it("keeps multi selections open, supports toggling and keyboard selection", async () => {
  const user = userEvent.setup();
  render(<TestMultiSelect />);
  const trigger = screen.getByRole("combobox", { name: "多模型" });
  await user.click(trigger);
  expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
  await user.click(screen.getByRole("option", { name: "one" }));
  await user.click(screen.getByRole("option", { name: "two" }));
  expect(trigger).toHaveTextContent("已选 2 个模型");
  expect(screen.getByRole("option", { name: "one" })).toHaveAttribute("aria-selected", "true");
  await user.click(screen.getByRole("option", { name: "one" }));
  expect(trigger).toHaveTextContent("two");
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(screen.getByRole("option", { name: "three" })).toHaveAttribute("aria-selected", "true");
});
