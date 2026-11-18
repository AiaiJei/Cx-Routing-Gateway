import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
