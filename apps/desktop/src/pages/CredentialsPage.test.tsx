import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialsPage } from "./CredentialsPage";
import { defaultWorkspaceClient } from "../data/workspace-client";

describe("CredentialsPage", () => {
  it("only displays masked examples and labels local actions as demonstrations", async () => {
    const user = userEvent.setup();
    render(<CredentialsPage />);
    expect(await screen.findByText("cxg_demo_••••••••••••7a2f")).toBeVisible();
    expect(screen.getByText("密钥创建、轮换和撤销尚未接入本机运行时。此页仅展示界面。" )).toBeVisible();
    await user.click(screen.getByRole("button", { name: "演示创建凭证" }));
    expect(screen.getByRole("status")).toHaveTextContent("未生成或保存密钥");
  });

  it("keeps the server key id, scope, and lifecycle actions after creation", async () => {
    const original = { ...defaultWorkspaceClient };
    const liveWorkspace = {
      meta: { source: "runtime", live: true },
      gateway: { state: "运行中", url: "http://127.0.0.1:4318", metrics: undefined },
      upstreams: [], routes: [], logs: [],
      credentials: [],
      settings: [],
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
      Object.assign(defaultWorkspaceClient, original);
    }
  });
});
