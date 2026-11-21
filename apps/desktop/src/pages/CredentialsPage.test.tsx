import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialsPage } from "./CredentialsPage";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { workspaceFixtures } from "../data/fixtures";
import "../styles/app.css";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CredentialsPage", () => {
  it("keeps the header action label on one line", async () => {
    render(<CredentialsPage />);
    await screen.findByText("脱敏示例 · 未生成真实密钥");
    expect(getComputedStyle(screen.getByRole("button", { name: "演示创建凭证" })).whiteSpace).toBe("nowrap");
  });

  it("only displays masked examples and labels local actions as demonstrations", async () => {
    const user = userEvent.setup();
    render(<CredentialsPage />);
    expect(await screen.findByText("cxg_demo_••••••••••••7a2f")).toBeVisible();
    expect(screen.getByText("密钥创建、轮换和撤销尚未接入本机运行时。此页仅展示界面。" )).toBeVisible();
    expect(screen.queryByRole("button", { name: "永久删除" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "演示创建凭证" }));
    expect(screen.getByRole("status")).toHaveTextContent("未生成或保存密钥");
  });

  it("keeps the server key id, scope, and lifecycle actions after creation", async () => {
    const original = { ...defaultWorkspaceClient };
    const liveWorkspace = {
      meta: { source: "runtime", live: true },
      gateway: { state: "运行中", url: "http://127.0.0.1:4318", metrics: undefined },
      upstreams: [], routes: [], logs: [], credentials: [], settings: [],
    } as any;
    let rotatedId = "";
    Object.assign(defaultWorkspaceClient, {
      getWorkspace: async () => liveWorkspace,
      createClientKey: async () => ({ id: "key-server-id", key: "cxrg_secret-value" }),
      rotateClientKey: async (id: string) => { rotatedId = id; return { key: "cxrg_rotated" }; },
      revokeClientKey: async () => ({ enabled: false }),
    });
    try {
      const user = userEvent.setup();
      render(<CredentialsPage />);
      await user.type(await screen.findByPlaceholderText("gateway-fast, gateway-reasoner"), "demo-model");
      await user.click(screen.getByRole("button", { name: "创建凭证" }));
      expect(await screen.findByText("demo-model")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "轮换" }));
      expect(rotatedId).toBe("key-server-id");
    } finally {
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });

  it("keeps permanent deletion separate and requires confirmation before removing a credential", async () => {
    const original = { ...defaultWorkspaceClient };
    const liveWorkspace = { ...structuredClone(workspaceFixtures), meta: { source: "runtime", live: true } } as any;
    const permanentlyDeleteClientKey = vi.fn(async (id: string) => ({ id, deleted: true as const }));
    Object.assign(defaultWorkspaceClient, { getWorkspace: async () => liveWorkspace, permanentlyDeleteClientKey });
    try {
      const user = userEvent.setup();
      render(<CredentialsPage />);
      await screen.findByPlaceholderText("gateway-fast, gateway-reasoner");
      const row = screen.getByRole("row", { name: /Desktop client/ });
      await user.click(within(row).getByRole("button", { name: "永久删除" }));
      const dialog = screen.getByRole("dialog", { name: "永久删除凭证" });
      expect(dialog).toHaveTextContent("无法撤销");
      await user.click(within(dialog).getByRole("button", { name: "取消" }));
      expect(permanentlyDeleteClientKey).not.toHaveBeenCalled();
      expect(row).toBeVisible();

      await user.click(within(row).getByRole("button", { name: "永久删除" }));
      await user.click(screen.getByRole("button", { name: "确认永久删除" }));
      expect(permanentlyDeleteClientKey).toHaveBeenCalledWith(expect.any(String));
      expect(await screen.findByRole("status")).toHaveTextContent("凭证已永久删除");
      expect(screen.queryByRole("row", { name: /Desktop client/ })).not.toBeInTheDocument();
    } finally {
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });

  it("preserves a credential row and reports failure when permanent deletion fails", async () => {
    const original = { ...defaultWorkspaceClient };
    const liveWorkspace = { ...structuredClone(workspaceFixtures), meta: { source: "runtime", live: true } } as any;
    Object.assign(defaultWorkspaceClient, {
      getWorkspace: async () => liveWorkspace,
      permanentlyDeleteClientKey: async () => { throw new Error("控制服务不可用"); },
    });
    try {
      const user = userEvent.setup();
      render(<CredentialsPage />);
      await screen.findByPlaceholderText("gateway-fast, gateway-reasoner");
      const row = screen.getByRole("row", { name: /Desktop client/ });
      await user.click(within(row).getByRole("button", { name: "永久删除" }));
      await user.click(screen.getByRole("button", { name: "确认永久删除" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("永久删除失败：控制服务不可用");
      expect(row).toBeVisible();
    } finally {
      for (const key of Object.keys(defaultWorkspaceClient)) if (!(key in original)) delete (defaultWorkspaceClient as any)[key];
      Object.assign(defaultWorkspaceClient, original);
    }
  });
});
