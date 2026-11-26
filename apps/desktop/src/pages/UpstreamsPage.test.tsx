import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpstreamsPage } from "./UpstreamsPage";
import { defaultWorkspaceClient } from "../data/workspace-client";

describe("UpstreamsPage", () => {
  it("filters upstreams and marks connectivity actions as simulated", async () => {
    const user = userEvent.setup();
    render(<UpstreamsPage />);
    await screen.findByRole("button", { name: "添加上游" });
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
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
      deleteUpstream: async (id: string) => ({ id, deleted: true as const }),
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
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });

  it("shows upstream test failures as actionable alerts", async () => {
    const original = { ...defaultWorkspaceClient };
    const liveWorkspace = {
      meta: { source: "runtime", live: true },
      gateway: { state: "运行中", url: "http://127.0.0.1:4318", metrics: undefined },
      upstreams: [{ id: "up-live", name: "Live API", baseUrl: "https://api.example/v1", credentialLabel: "未配置", status: "待测试", models: [] }],
      routes: [], logs: [], credentials: [], settings: [],
    } as any;
    Object.assign(defaultWorkspaceClient, {
      getWorkspace: async () => liveWorkspace,
      simulateUpstreamTest: async () => { throw new Error("上游 DNS 地址已变化；请编辑并重新保存 Base URL 后再次测试。"); },
    });
    try {
      const user = userEvent.setup();
      render(<UpstreamsPage />);
      await user.click(await screen.findByRole("button", { name: "测试 Live API" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("上游 DNS 地址已变化");
      expect(screen.getByRole("alert")).toHaveTextContent("重新保存 Base URL");
    } finally {
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });

  it("confirms deletion and lists dependent routes when the runtime blocks it", async () => {
    const original = { ...defaultWorkspaceClient };
    const liveWorkspace = {
      meta: { source: "runtime", live: true },
      gateway: { state: "运行中", url: "http://127.0.0.1:4318", metrics: undefined },
      upstreams: [{ id: "up-live", name: "Live API", baseUrl: "https://api.example/v1", credentialLabel: "已配置（已脱敏）", status: "待测试", models: [] }],
      routes: [], logs: [], credentials: [], settings: [],
    } as any;
    const deleteUpstream = vi.fn(async () => ({ deleted: false as const, error: "upstream_in_use", routes: [{ id: "route-1", alias: "chat-main", inboundProtocol: "Chat" }] }));
    Object.assign(defaultWorkspaceClient, { getWorkspace: async () => liveWorkspace, deleteUpstream });
    try {
      const user = userEvent.setup();
      render(<UpstreamsPage />);
      const row = await screen.findByRole("row", { name: /Live API/ });
      await user.click(within(row).getByRole("button", { name: "删除" }));
      const dialog = screen.getByRole("dialog", { name: "删除上游服务" });
      await user.click(within(dialog).getByRole("button", { name: "取消" }));
      expect(deleteUpstream).not.toHaveBeenCalled();
      expect(row).toBeVisible();

      await user.click(within(row).getByRole("button", { name: "删除" }));
      await user.click(screen.getByRole("button", { name: "确认删除上游" }));
      expect(deleteUpstream).toHaveBeenCalledWith("up-live");
      expect(await screen.findByRole("alert")).toHaveTextContent("chat-main");
      expect(screen.getByRole("row", { name: /Live API/ })).toBeVisible();
    } finally {
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });

  it("preserves an upstream on deletion failure and removes it after success", async () => {
    const original = { ...defaultWorkspaceClient };
    const liveWorkspace = {
      meta: { source: "runtime", live: true },
      gateway: { state: "运行中", url: "http://127.0.0.1:4318", metrics: undefined },
      upstreams: [{ id: "up-live", name: "Live API", baseUrl: "https://api.example/v1", credentialLabel: "已配置（已脱敏）", status: "待测试", models: [] }],
      routes: [], logs: [], credentials: [], settings: [],
    } as any;
    const deleteUpstream = vi.fn().mockRejectedValueOnce(new Error("控制服务不可用"));
    Object.assign(defaultWorkspaceClient, { getWorkspace: async () => liveWorkspace, deleteUpstream });
    try {
      const user = userEvent.setup();
      render(<UpstreamsPage />);
      let row = await screen.findByRole("row", { name: /Live API/ });
      await user.click(within(row).getByRole("button", { name: "删除" }));
      const dialog = screen.getByRole("dialog", { name: "删除上游服务" });
      await user.click(within(dialog).getByRole("button", { name: "取消" }));
      expect(deleteUpstream).not.toHaveBeenCalled();

      await user.click(within(row).getByRole("button", { name: "删除" }));
      await user.click(screen.getByRole("button", { name: "确认删除上游" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("删除上游失败：控制服务不可用");
      expect(row).toBeVisible();

      deleteUpstream.mockResolvedValueOnce({ id: "up-live", deleted: true });
      await user.click(within(row).getByRole("button", { name: "删除" }));
      await user.click(screen.getByRole("button", { name: "确认删除上游" }));
      expect(await screen.findByRole("status")).toHaveTextContent("上游已删除");
      expect(screen.queryByRole("row", { name: /Live API/ })).not.toBeInTheDocument();
    } finally {
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });

  it("prefills a live upstream, leaves its key blank, saves, and refreshes the list", async () => {
    const original = { ...defaultWorkspaceClient };
    const initialWorkspace = {
      meta: { source: "runtime", live: true },
      gateway: { state: "运行中", url: "http://127.0.0.1:4318", metrics: undefined },
      upstreams: [{ id: "up-live", name: "Live API", baseUrl: "https://api.example/v1", credentialLabel: "已配置（已脱敏）", status: "待测试", models: [] }],
      routes: [], logs: [], credentials: [], settings: [],
    } as any;
    const refreshedWorkspace = { ...initialWorkspace, upstreams: [{ ...initialWorkspace.upstreams[0], name: "Renamed API", baseUrl: "https://new.example/v1" }] };
    const getWorkspace = vi.fn().mockResolvedValueOnce(initialWorkspace).mockResolvedValueOnce(refreshedWorkspace);
    const updateUpstream = vi.fn(async () => ({ updated: true }));
    Object.assign(defaultWorkspaceClient, { getWorkspace, updateUpstream });
    try {
      const user = userEvent.setup();
      render(<UpstreamsPage />);
      const row = await screen.findByRole("row", { name: /Live API/ });
      await user.click(within(row).getByRole("button", { name: "编辑 Live API" }));
      const dialog = screen.getByRole("dialog", { name: "编辑上游" });
      expect(within(dialog).getByLabelText("服务名称")).toHaveValue("Live API");
      expect(within(dialog).getByLabelText("Base URL")).toHaveValue("https://api.example/v1");
      const keyInput = within(dialog).getByLabelText("上游 Key");
      expect(keyInput).toHaveValue("");
      expect(keyInput).not.toBeRequired();

      await user.clear(within(dialog).getByLabelText("服务名称"));
      await user.type(within(dialog).getByLabelText("服务名称"), "Renamed API");
      await user.clear(within(dialog).getByLabelText("Base URL"));
      await user.type(within(dialog).getByLabelText("Base URL"), "https://new.example/v1");
      await user.click(within(dialog).getByRole("button", { name: "保存修改" }));

      expect(updateUpstream).toHaveBeenCalledWith("up-live", { name: "Renamed API", baseUrl: "https://new.example/v1" });
      expect(await screen.findByRole("row", { name: /Renamed API/ })).toBeVisible();
      expect(await screen.findByRole("status")).toHaveTextContent("上游已更新");
      expect(getWorkspace).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("dialog", { name: "编辑上游" })).not.toBeInTheDocument();
    } finally {
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });

  it("retains live edit values and the existing row when an upstream update fails", async () => {
    const original = { ...defaultWorkspaceClient };
    const liveWorkspace = {
      meta: { source: "runtime", live: true },
      gateway: { state: "运行中", url: "http://127.0.0.1:4318", metrics: undefined },
      upstreams: [{ id: "up-live", name: "Live API", baseUrl: "https://api.example/v1", credentialLabel: "已配置（已脱敏）", status: "待测试", models: [] }],
      routes: [], logs: [], credentials: [], settings: [],
    } as any;
    const updateUpstream = vi.fn().mockRejectedValue(new Error("控制服务不可用"));
    Object.assign(defaultWorkspaceClient, { getWorkspace: async () => liveWorkspace, updateUpstream });
    try {
      const user = userEvent.setup();
      render(<UpstreamsPage />);
      const row = await screen.findByRole("row", { name: /Live API/ });
      await user.click(within(row).getByRole("button", { name: "编辑 Live API" }));
      const dialog = screen.getByRole("dialog", { name: "编辑上游" });
      await user.clear(within(dialog).getByLabelText("服务名称"));
      await user.type(within(dialog).getByLabelText("服务名称"), "Pending Name");
      await user.clear(within(dialog).getByLabelText("Base URL"));
      await user.type(within(dialog).getByLabelText("Base URL"), "https://pending.example/v1");
      await user.type(within(dialog).getByLabelText("上游 Key"), "replacement-key");
      await user.click(within(dialog).getByRole("button", { name: "保存修改" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("更新上游失败：控制服务不可用");
      expect(updateUpstream).toHaveBeenCalledWith("up-live", { name: "Pending Name", baseUrl: "https://pending.example/v1", apiKey: "replacement-key" });
      expect(screen.getByRole("dialog", { name: "编辑上游" })).toBeVisible();
      expect(within(dialog).getByLabelText("服务名称")).toHaveValue("Pending Name");
      expect(within(dialog).getByLabelText("Base URL")).toHaveValue("https://pending.example/v1");
      expect(within(dialog).getByLabelText("上游 Key")).toHaveValue("replacement-key");
      expect(screen.getByRole("row", { name: /Live API/ })).toBeVisible();
    } finally {
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });

  it("edits fixture upstreams for this page session without making a runtime call", async () => {
    const original = { ...defaultWorkspaceClient };
    Object.assign(defaultWorkspaceClient, { updateUpstream: vi.fn() });
    try {
      const user = userEvent.setup();
      render(<UpstreamsPage />);
      const row = await screen.findByRole("row", { name: /Northstar AI/ });
      const credentialLabel = within(row).getByText(/key|未配置/i).textContent;
      await user.click(within(row).getByRole("button", { name: "编辑 Northstar AI" }));
      const dialog = screen.getByRole("dialog", { name: "编辑上游示例" });
      await user.clear(within(dialog).getByLabelText("服务名称"));
      await user.type(within(dialog).getByLabelText("服务名称"), "Session Edit");
      await user.clear(within(dialog).getByLabelText("Base URL"));
      await user.type(within(dialog).getByLabelText("Base URL"), "https://session.example/v1");
      await user.click(within(dialog).getByRole("button", { name: "保存示例修改" }));

      const editedRow = await screen.findByRole("row", { name: /Session Edit/ });
      expect(within(editedRow).getByText(credentialLabel!)).toBeVisible();
      expect(await screen.findByRole("status")).toHaveTextContent("当前页面会话");
      expect(screen.getByRole("status")).toHaveTextContent("不会发起网络连接");
      expect(defaultWorkspaceClient.updateUpstream).not.toHaveBeenCalled();
      expect(screen.queryByRole("row", { name: /Northstar AI/ })).not.toBeInTheDocument();
    } finally {
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });
});
