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

    expect(screen.getByTestId("window-title")).toHaveTextContent("Cx-Routing Gateway");
    expect(screen.queryByRole("link", { name: /Cx-Routing Gateway/ })).not.toBeInTheDocument();
    const destinations = ["总览", "上游服务", "模型路由", "调用日志", "接入凭证", "设置"];
    for (const label of destinations) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toBeVisible();
      const icon = link.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(link.firstElementChild).toBe(icon);
    }
    expect(screen.getByRole("navigation", { name: "主导航" }).querySelectorAll("svg")).toHaveLength(6);
    expect(screen.getByRole("heading", { name: "总览" })).toBeVisible();
    expect(screen.getByRole("link", { name: "跳到主要内容" })).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("banner", { name: "窗口标题栏" })).toBeVisible();
    expect(screen.getByTestId("window-title")).toHaveAttribute("data-window-title", "true");
    expect(screen.getByRole("button", { name: "最小化窗口" })).toBeVisible();
    const maximize = screen.getByRole("button", { name: "最大化窗口" });
    expect(maximize).toBeVisible();
    expect(maximize.querySelector(".window-maximize-mark")).toBeVisible();
    expect(screen.getByRole("button", { name: "关闭窗口" })).toBeVisible();
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
