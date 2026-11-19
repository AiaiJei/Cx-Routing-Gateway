import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpstreamsPage } from "./UpstreamsPage";
import { defaultWorkspaceClient } from "../data/workspace-client";

describe("UpstreamsPage", () => {
  it("filters upstreams and marks connectivity actions as simulated", async () => {
    const user = userEvent.setup();
    render(<UpstreamsPage />);
    await screen.findByRole("button", { name: "添加上游" });
    const search = screen.getByRole("searchbox", { name: "搜索上游服务" });
    await user.type(search, "Northstar");
    expect(screen.getByText("Northstar AI")).toBeVisible();
    expect(screen.queryByText("Lantern Labs")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "测试 Northstar AI" }));
    expect(await screen.findByRole("status")).toHaveTextContent("未执行");
  });

  it("shows a useful empty result and lets the search be cleared", async () => {
    const user = userEvent.setup();
    render(<UpstreamsPage />);
    await screen.findByRole("button", { name: "添加上游" });
    const search = screen.getByRole("searchbox", { name: "搜索上游服务" });
    await user.type(search, "missing");
    expect(screen.getByText("没有匹配的上游服务")).toBeVisible();
    await user.clear(search);
    expect(screen.getByText("Northstar AI")).toBeVisible();
  });

  it("adds a session-only upstream through a labeled form", async () => {
    const user = userEvent.setup();
    render(<UpstreamsPage />);
    await screen.findByRole("button", { name: "添加上游" });
    await user.click(screen.getByRole("button", { name: "添加上游" }));
    expect(screen.getByRole("dialog", { name: "新增上游示例" })).toBeVisible();
    expect(screen.getByRole("button", { name: "关闭弹窗" })).toHaveTextContent("×");
    expect(screen.queryByRole("button", { name: "取消" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("服务名称"), "Local Demo");
    await user.type(screen.getByLabelText("Base URL"), "https://local.example/v1");
    await user.type(screen.getByLabelText("上游 Key"), "sk-demo-key");
    expect(screen.queryByLabelText("上游出站协议")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "模拟连通测试" }));
    expect(screen.getByRole("status")).toHaveTextContent("连通测试未执行");
    await user.click(screen.getByRole("button", { name: "保存示例上游" }));
    expect(screen.getByText("Local Demo")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("刷新后不会保留");
  });

  it("shows an actionable live test state and removes fixture wording", async () => {
    const original = { ...defaultWorkspaceClient };
    let resolveTest: ((value: { simulated: boolean; message: string }) => void) | undefined;
    const liveWorkspace = {
      meta: { source: "runtime", live: true },
      gateway: { state: "运行中", url: "http://127.0.0.1:4318", metrics: undefined },
      upstreams: [{ id: "up-live", name: "Live API", baseUrl: "https://api.example/v1", credentialLabel: "已配置（已脱敏）", status: "待测试", models: [] }],
      routes: [], logs: [], credentials: [], settings: [],
    } as any;
    Object.assign(defaultWorkspaceClient, {
      getWorkspace: async () => liveWorkspace,
      simulateUpstreamTest: () => new Promise((resolve) => { resolveTest = resolve; }),
    });
    try {
      const user = userEvent.setup();
      render(<UpstreamsPage />);
    await screen.findByRole("button", { name: "添加上游" });
      const testButton = await screen.findByRole("button", { name: "测试 Live API" });
      expect(testButton).toHaveClass("geist-button", "geist-button--accent");
      expect(screen.getByRole("button", { name: "删除" })).toHaveClass("geist-button", "geist-button--danger");
      await user.click(testButton);
      expect(testButton).toBeDisabled();
      expect(testButton).toHaveTextContent("测试中");
      resolveTest?.({ simulated: false, message: "连通成功，发现 2 个模型" });
      expect(await screen.findByRole("status")).toHaveTextContent("连通成功");
      await user.click(screen.getByRole("button", { name: "添加上游" }));
      expect(screen.getByRole("dialog", { name: "新增上游" })).toBeVisible();
      expect(screen.getByRole("button", { name: "测试连接" })).toBeVisible();
      expect(screen.getByRole("button", { name: "保存上游" })).toBeVisible();
      expect(screen.queryByText(/示例|模拟/)).not.toBeInTheDocument();
    } finally {
      Object.assign(defaultWorkspaceClient, original);
    }
  });
});
