import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("names the product and exposes all six workspace destinations", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell>
          <h1>总览</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Cx-Routing Gateway/ })).toBeVisible();
    for (const label of ["总览", "上游服务", "模型路由", "调用日志", "接入凭证", "设置"]) {
      expect(screen.getByRole("link", { name: label })).toBeVisible();
    }
    expect(screen.getByRole("heading", { name: "总览" })).toBeVisible();
    expect(screen.getByRole("link", { name: "跳到主要内容" })).toHaveAttribute("href", "#main-content");
  });

  it("opens and closes the narrow-screen navigation with the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShell>
          <h1>总览</h1>
        </AppShell>
      </MemoryRouter>,
    );

    const menu = screen.getByRole("button", { name: "打开导航" });
    await user.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});
