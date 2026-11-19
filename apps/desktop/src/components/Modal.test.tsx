import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>打开</button>{open && <Modal title="测试窗口" onClose={() => setOpen(false)}><button type="button">第一个控件</button><button type="button">最后一个控件</button></Modal>}</>;
}

describe("Modal", () => {
  it("moves focus into the dialog, traps keyboard focus, and restores focus on close", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "打开" });
    await user.click(opener);

    const close = screen.getByRole("button", { name: "关闭弹窗" });
    const first = screen.getByRole("button", { name: "第一个控件" });
    const last = screen.getByRole("button", { name: "最后一个控件" });
    expect(close).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.click(close);
    expect(opener).toHaveFocus();
  });

  it("blocks Escape, backdrop, and close-button dismissal while a request is pending", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<Modal title="正在测试" canClose={false} onClose={onClose}><button type="button">动作</button></Modal>);
    const close = screen.getByRole("button", { name: "关闭弹窗" });
    expect(close).toBeDisabled();
    await user.keyboard("{Escape}");
    const backdrop = container.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop!);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "正在测试" })).toBeVisible();
  });
});
