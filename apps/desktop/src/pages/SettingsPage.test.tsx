import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";
import userEvent from "@testing-library/user-event";
import { defaultWorkspaceClient } from "../data/workspace-client";

describe("SettingsPage", () => {
  it("shows the unconfigured GitHub token state without disabling the update control", async () => {
    const original = window.desktopControls;
    window.desktopControls = {
      ...original,
      getUpdateTokenStatus: async () => ({ configured: false, secureStorageAvailable: true }),
    } as NonNullable<typeof window.desktopControls>;
    try {
      render(<SettingsPage />);
      expect(await screen.findByLabelText("GitHub 更新访问令牌")).toHaveAttribute("type", "password");
      expect(await screen.findByText("尚未配置 GitHub 更新令牌" )).toBeVisible();
    } finally {
      window.desktopControls = original;
    }
  });
  it("validates and saves the GitHub token, clears the password field, and never displays its value", async () => {
    const original = window.desktopControls;
    const secret = "github_pat_example_token_value_123456789";
    let savedToken = "";
    window.desktopControls = {
      ...original,
      getUpdateTokenStatus: async () => ({ configured: false, secureStorageAvailable: true }),
      saveUpdateToken: async (value: string) => { savedToken = value; return { configured: true }; },
    } as NonNullable<typeof window.desktopControls>;
    try {
      const user = userEvent.setup();
      render(<SettingsPage />);
      const input = await screen.findByLabelText("GitHub 更新访问令牌");
      await user.type(input, secret);
      await user.click(screen.getByRole("button", { name: "保存并验证" }));
      expect(savedToken).toBe(secret);
      expect(input).toHaveValue("");
      expect(await screen.findByText("GitHub 更新令牌已验证并安全保存。" )).toBeVisible();
      expect(screen.queryByText(secret)).not.toBeInTheDocument();
    } finally {
      window.desktopControls = original;
    }
  });
  it("does not echo a rejected GitHub token in Settings errors", async () => {
    const original = window.desktopControls;
    const secret = "github_pat_example_token_value_123456789";
    window.desktopControls = {
      ...original,
      getUpdateTokenStatus: async () => ({ configured: false, secureStorageAvailable: true }),
      saveUpdateToken: async () => { throw new Error(`Rejected credential ${secret}`); },
    } as NonNullable<typeof window.desktopControls>;
    try {
      const user = userEvent.setup();
      render(<SettingsPage />);
      const input = await screen.findByLabelText("GitHub 更新访问令牌");
      await user.type(input, secret);
      await user.click(screen.getByRole("button", { name: "保存并验证" }));
      const status = await screen.findByText(/Rejected credential/);
      expect(status).toHaveTextContent("Rejected credential");
      expect(status).not.toHaveTextContent(secret);
    } finally {
      window.desktopControls = original;
    }
  });
  it("removes the configured GitHub token", async () => {
    const original = window.desktopControls;
    let removed = false;
    window.desktopControls = {
      ...original,
      getUpdateTokenStatus: async () => ({ configured: true, secureStorageAvailable: true }),
      removeUpdateToken: async () => { removed = true; return { configured: false }; },
    } as NonNullable<typeof window.desktopControls>;
    try {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await user.click(await screen.findByRole("button", { name: "移除令牌" }));
      expect(removed).toBe(true);
      expect(await screen.findByText("GitHub 更新令牌已移除。" )).toBeVisible();
    } finally {
      window.desktopControls = original;
    }
  });
  it("reports when encrypted token storage is unavailable without requesting a token", async () => {
    const original = window.desktopControls;
    window.desktopControls = {
      ...original,
      getUpdateTokenStatus: async () => ({ configured: false, secureStorageAvailable: false }),
    } as NonNullable<typeof window.desktopControls>;
    try {
      render(<SettingsPage />);
      expect(await screen.findByText("当前系统无法安全保存 GitHub 更新令牌" )).toBeVisible();
      expect(screen.queryByLabelText("GitHub 更新访问令牌")).not.toBeInTheDocument();
    } finally {
      window.desktopControls = original;
    }
  });
  it("shows the installed product version in the desktop application section", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("版本 1.1.0")).toBeVisible();
    expect(screen.getByRole("heading", { name: "桌面应用" })).toBeVisible();
  });
  it("shows the GitHub release link when an update is available", async () => {
    const original = window.desktopControls;
    window.desktopControls = {
      ...original!,
      checkUpdate: async () => ({ configured: true, available: true, version: "1.2.0", releaseUrl: "https://github.com/AiaiJei/Cx-Routing-Gateway/releases/tag/v1.2.0", installer: { name: "setup.exe", sha256: "0".repeat(64) } }),
    };
    try {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await user.click(await screen.findByRole("button", { name: "检查更新" }));
      expect(await screen.findByRole("link", { name: "查看 GitHub 发布说明" })).toHaveAttribute("href", "https://github.com/AiaiJei/Cx-Routing-Gateway/releases/tag/v1.2.0");
      expect(screen.getByRole("button", { name: "安装更新" })).toBeVisible();
    } finally {
      window.desktopControls = original;
    }
  });
  it("reports GitHub update check failures", async () => {
    const original = window.desktopControls;
    window.desktopControls = { ...original!, checkUpdate: async () => { throw new Error("GitHub Releases API returned 503"); } };
    try {
      const user = userEvent.setup();
      render(<SettingsPage />);
      await user.click(await screen.findByRole("button", { name: "检查更新" }));
      expect(await screen.findByText("GitHub Releases API returned 503")).toHaveAttribute("role", "status");
    } finally {
      window.desktopControls = original;
    }
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
      expect(screen.getByText("日志保留策略已保存。")).toHaveAttribute("role", "status");
    } finally {
      Object.assign(defaultWorkspaceClient, original);
    }
  });
});
