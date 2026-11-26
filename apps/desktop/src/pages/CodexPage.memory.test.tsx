import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { CodexPage } from "./CodexPage";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { workspaceFixtures } from "../data/fixtures";
const original = window.desktopControls,
  client = { ...defaultWorkspaceClient };
const status = {
  configPath: "C:/test-user-home/config.toml",
  configScope: "user",
  exists: true,
  revision: "config",
  configured: true,
  mode: "gateway",
  model: "gateway-reasoner",
  selectedRouteIds: ["route-reasoner"],
  selectedModelAliases: ["gateway-reasoner"],
  defaultRouteId: "route-reasoner",
  catalogStatus: "managed",
  credentialConfigured: true,
};
const stored = {
  id: "key-one",
  name: "已保存开发 Key",
  scope: ["gateway-reasoner", "gateway-second"],
  enabled: true,
  secretAvailable: true,
  current: false,
};
const legacy = {
  id: "legacy",
  name: "旧 Key",
  scope: [],
  enabled: true,
  secretAvailable: false,
  current: true,
};
const revoked = {
  id: "revoked",
  name: "已撤销 Key",
  scope: [],
  enabled: false,
  secretAvailable: true,
  current: false,
};
const credentials = {
  credentials: [stored, legacy, revoked],
  currentCredentialId: "legacy",
  currentConfigured: true,
};
const initial = {
  revision: "p1",
  exists: true,
  routeIds: ["route-reasoner", "route-second"],
  defaultRouteId: "route-second",
  credentialSource: "stored",
  credentialId: "key-one",
};
function setup(overrides = {}) {
  const data = structuredClone(workspaceFixtures);
  data.meta = { source: "runtime", live: true };
  data.gateway = { state: "运行中", url: "http://127.0.0.1:4318" };
  data.routes.push({
    ...data.routes[0],
    id: "route-second",
    alias: "gateway-second",
  });
  defaultWorkspaceClient.getWorkspace = vi.fn().mockResolvedValue(data);
  defaultWorkspaceClient.createClientKey = vi
    .fn()
    .mockResolvedValue({ id: "new-key", key: "do-not-keep-raw" });
  let pref = initial;
  const native = {
    getCodexStatus: vi.fn().mockResolvedValue(status),
    getCodexDirectProfiles: vi.fn().mockResolvedValue({
      revision: "l",
      secureStorageAvailable: true,
      profiles: [
        {
          id: "official",
          kind: "official",
          name: "官方默认",
          models: [],
          credentialConfigured: false,
          editable: false,
          active: false,
        },
      ],
    }),
    previewCodexConfig: vi.fn().mockResolvedValue({
      configPath: status.configPath,
      revision: "config",
      mode: "gateway",
      model: "gateway-second",
      providerName: "CX-RG 网关",
      selectedModelAliases: ["gateway-reasoner", "gateway-second"],
      configPreview: "redacted",
      changes: [],
      replacesCurrentProvider: false,
    }),
    applyCodexConfig: vi.fn().mockResolvedValue(status),
    restoreCodexConfig: vi.fn().mockResolvedValue(status),
    getCodexGatewayPreferences: vi.fn(async () => pref),
    saveCodexGatewayPreferences: vi.fn(async (input: any) => {
      pref = { ...input, revision: "p2", exists: true };
      return pref;
    }),
    getCodexGatewayCredentials: vi.fn().mockResolvedValue(credentials),
    retainCodexGatewayCredential: vi.fn().mockResolvedValue({
      ...credentials,
      credentials: [stored, { ...legacy, secretAvailable: true }, revoked],
    }),
    ...overrides,
  };
  window.desktopControls = native as unknown as NonNullable<
    typeof window.desktopControls
  >;
  return { native, data };
}
function mount() {
  return render(
    <MemoryRouter>
      <CodexPage />
    </MemoryRouter>,
  );
}
async function ready() {
  await waitFor(() =>
    expect(
      screen.getByRole("checkbox", { name: "选择 gateway-second" }),
    ).toBeChecked(),
  );
}
async function choose(label: RegExp | string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Gateway 接入凭证" }));
  await user.click(screen.getByRole("option", { name: label }));
  return user;
}
afterEach(() => {
  window.desktopControls = original;
  Object.assign(defaultWorkspaceClient, client);
});
describe("Gateway remembered choices and credential selector", () => {
  it("hydrates remembered models/default/Key id, retains draft across view and page remount without applying", async () => {
    const { native } = setup();
    const first = mount();
    await ready();
    expect(
      screen.getByRole("combobox", { name: "默认模型" }),
    ).toHaveTextContent("gateway-second");
    expect(
      screen.getByRole("combobox", { name: "Gateway 接入凭证" }),
    ).toHaveTextContent("已保存开发 Key");
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("checkbox", { name: "选择 gateway-reasoner" }),
    );
    await user.click(screen.getByRole("tab", { name: /Codex 直连/ }));
    await user.click(screen.getByRole("tab", { name: /CX-RG 网关/ }));
    expect(
      screen.getByRole("checkbox", { name: "选择 gateway-reasoner" }),
    ).not.toBeChecked();
    first.unmount();
    mount();
    await ready();
    expect(
      screen.getByRole("checkbox", { name: "选择 gateway-reasoner" }),
    ).not.toBeChecked();
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
    expect(native.saveCodexGatewayPreferences).toHaveBeenCalled();
    expect(
      JSON.stringify(native.saveCodexGatewayPreferences.mock.calls),
    ).not.toContain("clientKey");
  });
  it("applies stored id mutually exclusively and labels current-user scope with actual config path", async () => {
    const { native } = setup();
    mount();
    await ready();
    expect(screen.getByText(/作用范围：当前用户/)).toBeVisible();
    expect(screen.getByText(/不是系统全局.*不是当前项目配置/)).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "保存并启用网关" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("C:/test-user-home/config.toml");
    expect(dialog).toHaveTextContent(/当前用户/);
    await user.click(within(dialog).getByRole("button", { name: "确认启用" }));
    expect(native.applyCodexConfig).toHaveBeenCalledWith({
      mode: "gateway",
      routeIds: ["route-reasoner", "route-second"],
      defaultRouteId: "route-second",
      expectedRevision: "config",
      credentialId: "key-one",
    });
  });
  it("shows legacy unavailable metadata, explicitly retains original Key and never rotates", async () => {
    const { native } = setup();
    mount();
    await ready();
    const user = await choose(/旧 Key/);
    expect(screen.getByText(/旧凭证未保存原文，请补录原 Key/)).toBeVisible();
    await user.type(screen.getByLabelText("补录原 Key"), "legacy-private");
    await user.click(screen.getByRole("button", { name: "保存原 Key" }));
    await waitFor(() =>
      expect(native.retainCodexGatewayCredential).toHaveBeenCalledWith({
        id: "legacy",
        key: "legacy-private",
      }),
    );
    expect(
      screen.queryByDisplayValue("legacy-private"),
    ).not.toBeInTheDocument();
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
  });
  it("reads matched current Key only on explicit action and never receives raw value", async () => {
    const { native } = setup();
    mount();
    await ready();
    const user = await choose(/当前 Codex 配置凭证/);
    await user.click(screen.getByRole("button", { name: "读取当前配置凭证" }));
    expect(native.retainCodexGatewayCredential).toHaveBeenCalledWith({
      id: "legacy",
      fromCurrent: true,
    });
    expect(
      screen.queryByRole("textbox", { name: /Key/ }),
    ).not.toBeInTheDocument();
  });
  it("keeps revoked or missing credential choices visible and blocks apply with repair guidance", async () => {
    const { native } = setup({
      getCodexGatewayPreferences: vi
        .fn()
        .mockResolvedValue({ ...initial, credentialId: "revoked" }),
    });
    mount();
    await ready();
    expect(
      screen.getByRole("combobox", { name: "Gateway 接入凭证" }),
    ).toHaveTextContent("已撤销 Key");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "保存并启用网关" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/凭证.*不可用|已撤销/);
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
  });
  it("uses a newly-created encrypted credential id and clears the transient raw Key", async () => {
    const next = {
      ...credentials,
      credentials: [
        ...credentials.credentials,
        {
          id: "new-key",
          name: "新专用 Key",
          scope: ["gateway-reasoner", "gateway-second"],
          enabled: true,
          secretAvailable: true,
          current: false,
        },
      ],
    };
    const { native } = setup({
      getCodexGatewayCredentials: vi
        .fn()
        .mockResolvedValueOnce(credentials)
        .mockResolvedValue(next),
    });
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "创建专用 Key" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "确认创建",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Gateway 接入凭证" }),
      ).toHaveTextContent("新专用 Key"),
    );
    expect(
      screen.queryByDisplayValue("do-not-keep-raw"),
    ).not.toBeInTheDocument();
    expect(native.getCodexGatewayCredentials).toHaveBeenCalledTimes(2);
  });
  it("persists manual source without raw input and requires re-entry after remount", async () => {
    setup();
    const first = mount();
    await ready();
    const user = await choose("手动输入 Key");
    await user.type(
      screen.getByLabelText("Gateway 客户端 Key"),
      "manual-private",
    );
    first.unmount();
    mount();
    await ready();
    expect(screen.getByLabelText("Gateway 客户端 Key")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "保存并启用网关" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/填写.*Key/);
  });
  it("keeps invalid remembered routes visible with repair guidance and never silently selects another model", async () => {
    const { native } = setup({
      getCodexGatewayPreferences: vi.fn().mockResolvedValue({
        ...initial,
        routeIds: ["removed-route"],
        defaultRouteId: "removed-route",
      }),
    });
    mount();
    await screen.findByText(/已删除、停用或不支持 Responses/);
    expect(screen.getByText("removed-route")).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "选择 gateway-reasoner" }),
    ).not.toBeChecked();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "保存并启用网关" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/移除不可用/);
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
  });
  it("does not persist checkbox drafts into a corrupt preference file and shows a retry action", async () => {
    const { native } = setup({
      getCodexGatewayPreferences: vi
        .fn()
        .mockRejectedValue(new Error("CODEX_PREFERENCES_INVALID: private")),
    });
    mount();
    await screen.findByRole("button", { name: "重试读取草稿" });
    await userEvent
      .setup()
      .click(screen.getByRole("checkbox", { name: "选择 gateway-second" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/草稿读取失败/);
    expect(native.saveCodexGatewayPreferences).not.toHaveBeenCalled();
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
  });

  it("cancels an activation preview if model draft changes while the memory flush is pending", async () => {
    let finish!: (value: typeof initial) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<typeof initial>((done) => {
            finish = done;
          }),
      )
      .mockResolvedValue({ ...initial, revision: "p3" });
    const { native } = setup({ saveCodexGatewayPreferences: save });
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("checkbox", { name: "选择 gateway-reasoner" }),
    );
    await user.click(screen.getByRole("button", { name: "保存并启用网关" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("checkbox", { name: "选择 gateway-reasoner" }),
    );
    await act(async () => finish({ ...initial, revision: "p2" }));
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("refreshes matched current credential metadata after apply and on header refresh", async () => {
    const next = {
      credentials: [
        { ...stored, current: true },
        { ...legacy, current: false },
        revoked,
      ],
      currentCredentialId: stored.id,
      currentConfigured: true,
    };
    const getCredentials = vi
      .fn()
      .mockResolvedValueOnce(credentials)
      .mockResolvedValue(next);
    const { native } = setup({ getCodexGatewayCredentials: getCredentials });
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "保存并启用网关" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "确认启用",
      }),
    );
    await waitFor(() => expect(getCredentials).toHaveBeenCalledTimes(2));
    await choose(/当前 Codex 配置凭证/);
    await user.click(screen.getByRole("button", { name: "读取当前配置凭证" }));
    expect(native.retainCodexGatewayCredential).toHaveBeenCalledWith({
      id: stored.id,
      fromCurrent: true,
    });
    await user.click(screen.getByRole("button", { name: "刷新状态" }));
    await waitFor(() => expect(getCredentials).toHaveBeenCalledTimes(3));
  });
  it("refreshes credential metadata after restore and hides obsolete current identity if refresh fails", async () => {
    const getCredentials = vi
      .fn()
      .mockResolvedValueOnce(credentials)
      .mockRejectedValue(new Error("raw-credential-data"));
    const { native } = setup({
      getCodexGatewayCredentials: getCredentials,
      getCodexStatus: vi
        .fn()
        .mockResolvedValue({
          ...status,
          backup: { id: "b", createdAt: "2026-11-26T00:00:00Z" },
        }),
    });
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(
      screen.getByText("配置详情与恢复", { selector: "summary" }),
    );
    await user.click(screen.getByRole("button", { name: "恢复备份" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "确认恢复",
      }),
    );
    await waitFor(() => expect(getCredentials).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(/凭证读取失败/);
    await choose(/当前 Codex 配置凭证/);
    expect(
      screen.queryByRole("button", { name: "读取当前配置凭证" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/raw-credential-data/)).not.toBeInTheDocument();
    expect(native.retainCodexGatewayCredential).not.toHaveBeenCalled();
  });
});
