import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";
import userEvent from "@testing-library/user-event";
import { defaultWorkspaceClient } from "../data/workspace-client";

describe("SettingsPage", () => {
  it("shows the installed product version in the desktop application section", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("版本 1.0.1")).toBeVisible();
    expect(screen.getByRole("heading", { name: "桌面应用" })).toBeVisible();
  });
  it("identifies runtime-dependent settings as unavailable and read-only", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("运行时未接入，以下配置尚不可更改。" )).toBeVisible();
    expect(screen.getByLabelText("Gateway 监听地址")).toHaveValue("127.0.0.1");
    expect(screen.getByLabelText("Gateway 监听地址")).toBeDisabled();
  });

  it("saves the live usage retention setting through the runtime client", async () => {
    const original = { ...defaultWorkspaceClient };
    const liveWorkspace = {
      meta: { source: "runtime", live: true },
      gateway: { state: "运行中", url: "http://127.0.0.1:4318", metrics: undefined },
      upstreams: [], routes: [], logs: [], credentials: [],
      settings: [{ label: "日志保留条数", value: "1000 条", available: true }],
    } as any;
    let saved: unknown;
    Object.assign(defaultWorkspaceClient, {
      getWorkspace: async () => liveWorkspace,
      updateSettings: async (input: unknown) => { saved = input; return { settings: { usageRetentionCount: 42 } }; },
    });
    try {
      const user = userEvent.setup();
      render(<SettingsPage />);
      const input = await screen.findByLabelText("日志保留条数");
      expect(input).toBeEnabled();
      await user.clear(input);
      await user.type(input, "42");
      await user.click(screen.getByRole("button", { name: "保存日志保留" }));
      expect(saved).toEqual({ usageRetentionCount: 42 });
      expect(screen.getByRole("status")).toHaveTextContent("日志保留策略已保存");
    } finally {
      Object.assign(defaultWorkspaceClient, original);
    }
  });
});
