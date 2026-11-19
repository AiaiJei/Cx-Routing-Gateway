import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate, type NavigateFunction } from "react-router";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("closes navigation and restores the content on history navigation", async () => {
    let navigate!: NavigateFunction;
    function Harness() { navigate = useNavigate(); return <AppShell><h1>内容</h1></AppShell>; }
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/", "/routes"]}><Harness /></MemoryRouter>);
    screen.getByRole("main").scrollTop = 240;
    await user.click(screen.getByRole("button", { name: "打开导航" }));
    expect(screen.getByRole("main")).toHaveProperty("inert", true);
    await act(async () => { await navigate(-1); });
    expect(screen.getByRole("button", { name: "打开导航" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("main")).toHaveProperty("inert", false);
    expect(screen.getByRole("main")).toHaveFocus();
    expect(screen.getByRole("main").scrollTop).toBe(0);
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(document.querySelector(".navigation-backdrop")).not.toBeInTheDocument();
  });
  it("groups the existing destinations and updates the page context after navigation", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/routes"]}><AppShell><h1>内容</h1></AppShell></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "主导航" });
    expect(within(nav).getByRole("group", { name: "网关配置" })).toContainElement(screen.getByRole("link", { name: "模型路由" }));
    const context = screen.getByRole("navigation", { name: "当前位置" });
    expect(context).toHaveTextContent("本机工作区网关配置模型路由");
    expect(within(context).getByText("模型路由")).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("link", { name: "调用日志" }));
    expect(context).toHaveTextContent("本机工作区运行记录调用日志");
  });

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
    expect(menu).toHaveFocus();
  });

  it("contains keyboard focus in open navigation and focuses content after choosing a page", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppShell><h1>内容</h1></AppShell></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "打开导航" }));
    expect(screen.getByRole("link", { name: "总览" })).toHaveFocus();
    screen.getByRole("link", { name: "设置" }).focus();
    await user.tab();
    expect(screen.getByRole("link", { name: "总览" })).toHaveFocus();
    await user.click(screen.getByRole("link", { name: "模型路由" }));
    expect(screen.getByRole("main")).toHaveFocus();
    expect(screen.getByRole("button", { name: "打开导航" })).toHaveAttribute("aria-expanded", "false");
  });
});
