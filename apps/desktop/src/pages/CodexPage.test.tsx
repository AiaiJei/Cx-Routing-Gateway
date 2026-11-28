import { act, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { workspaceFixtures } from "../data/fixtures";
import { CodexPage } from "./CodexPage";

const originalControls = window.desktopControls;
const originalClient = { ...defaultWorkspaceClient };
const official = {
  id: "official",
  kind: "official",
  name: "官方默认",
  models: [],
  credentialConfigured: false,
  editable: false,
  active: false,
};
const custom = {
  id: "direct-one",
  kind: "custom",
  name: "测试直连",
  baseUrl: "https://responses.example/v1",
  models: ["alpha", "beta"],
  defaultModel: "beta",
  credentialConfigured: true,
  editable: true,
  active: false,
};
const profiles = {
  revision: "profiles-before",
  secureStorageAvailable: true,
  profiles: [official, custom],
  lastDirectProfileId: "direct-one",
};
const status = {
  configPath: "C:/test-codex/config.toml",
  exists: true,
  revision: "before",
  configured: false,
  mode: "direct",
  model: "existing-model",
  credentialConfigured: true,
  selectedRouteIds: [],
  selectedModelAliases: [],
  catalogStatus: "none",
  direct: {
    kind: "custom",
    name: "当前自定义提供商",
    providerId: "existing",
    baseUrl: "https://current.example/v1",
    model: "existing-model",
    importable: true,
  },
  backup: { id: "backup-1", createdAt: "2026-11-25T09:30:00Z" },
};
const gatewayStatus = {
  ...status,
  mode: "gateway",
  configured: true,
  model: "gateway-reasoner",
  direct: undefined,
  selectedRouteIds: ["route-reasoner"],
  selectedModelAliases: ["gateway-reasoner"],
  defaultRouteId: "route-reasoner",
  catalogStatus: "managed",
};
const preview = {
  configPath: status.configPath,
  revision: status.revision,
  mode: "direct",
  model: "beta",
  baseUrl: custom.baseUrl,
  providerName: custom.name,
  selectedModelAliases: ["alpha", "beta"],
  configPreview:
    'model_provider = "cx_codex_direct"\nexperimental_bearer_token = "[REDACTED]"',
  replacesCurrentProvider: true,
  changes: ["切换直连提供商"],
};
const gatewayPreview = {
  ...preview,
  mode: "gateway",
  model: "gateway-reasoner",
  providerName: "CX-RG 网关",
  baseUrl: "http://127.0.0.1:4318/v1",
  selectedModelAliases: ["gateway-reasoner"],
  catalogPreview: '{"models":[{"slug":"gateway-reasoner"}]}',
};
const imported = {
  ...profiles,
  revision: "profiles-imported",
  profiles: [
    ...profiles.profiles,
    {
      id: "snapshot-current",
      kind: "snapshot",
      name: "当前 Codex 配置",
      models: ["existing-model"],
      defaultModel: "existing-model",
      credentialConfigured: true,
      editable: false,
      active: true,
    },
  ],
};
function setup(overrides = {}) {
  const data = structuredClone(workspaceFixtures);
  data.meta = { source: "runtime", live: true };
  data.gateway = { state: "运行中", url: "http://127.0.0.1:4318" };
  data.routes.push({
    ...data.routes[0],
    id: "route-second",
    alias: "gateway-second",
    outboundProtocol: "Res",
  });
  defaultWorkspaceClient.getWorkspace = vi.fn().mockResolvedValue(data);
  defaultWorkspaceClient.createClientKey = vi
    .fn()
    .mockResolvedValue({ id: "new-key", key: "cxrg_test_secret" });
  const native = {
    getCodexStatus: vi.fn().mockResolvedValue(status),
    getCodexDirectProfiles: vi.fn().mockResolvedValue(profiles),
    saveCodexDirectProfile: vi
      .fn()
      .mockResolvedValue({ ...profiles, revision: "saved" }),
    importCodexDirectProfile: vi.fn().mockResolvedValue(imported),
    duplicateCodexDirectProfile: vi
      .fn()
      .mockResolvedValue({ ...profiles, revision: "duplicated" }),
    deleteCodexDirectProfile: vi.fn().mockResolvedValue({
      ...profiles,
      revision: "deleted",
      profiles: [official],
    }),
    previewCodexConfig: vi
      .fn()
      .mockImplementation((input: { mode: string }) =>
        Promise.resolve(input.mode === "gateway" ? gatewayPreview : preview),
      ),
    applyCodexConfig: vi.fn().mockImplementation((input: { mode: string }) =>
      Promise.resolve(
        input.mode === "gateway"
          ? { ...gatewayStatus, revision: "after" }
          : {
              ...status,
              revision: "after",
              direct: {
                ...status.direct,
                profileId: "direct-one",
                name: custom.name,
                baseUrl: custom.baseUrl,
                model: "beta",
              },
              model: "beta",
            },
      ),
    ),
    restoreCodexConfig: vi.fn().mockResolvedValue(status),
    getCodexClientStatus: vi.fn().mockResolvedValue({
      available: true,
      version: "0.167.0",
      auth: "unknown",
      login: "idle",
    }),
    startCodexLogin: vi.fn().mockResolvedValue({
      available: true,
      auth: "unknown",
      login: "pending",
    }),
    cancelCodexLogin: vi
      .fn()
      .mockResolvedValue({ available: true, auth: "unknown", login: "idle" }),
    ...overrides,
  };
  window.desktopControls = native as unknown as NonNullable<
    typeof window.desktopControls
  >;
  return { native, data };
}
function mount(strict = false) {
  return render(
    <MemoryRouter>
      <CurrentPath />
      {strict ? (
        <StrictMode>
          <CodexPage />
        </StrictMode>
      ) : (
        <CodexPage />
      )}
    </MemoryRouter>,
  );
}
function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}
async function ready() {
  await screen.findByText("当前自定义提供商", { selector: "dd" });
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: /Codex 直连/ })).toHaveAttribute(
      "aria-selected",
      "true",
    ),
  );
}
async function selectCustom() {
  await ready();
  await userEvent
    .setup()
    .click(screen.getByRole("radio", { name: /测试直连/ }));
}
async function viewGateway() {
  const user = userEvent.setup();
  const existingDialog = screen.queryByRole("dialog");
  if (existingDialog)
    await user.click(within(existingDialog).getByRole("button", { name: "取消" }));
  const tab = await screen.findByRole("tab", { name: /CX-RG 网关/ });
  await user.click(tab);
  expect(tab).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}

beforeEach(() => {
  Object.assign(defaultWorkspaceClient, originalClient);
  window.desktopControls = undefined;
});
afterEach(() => {
  Object.assign(defaultWorkspaceClient, originalClient);
  window.desktopControls = originalControls;
  vi.restoreAllMocks();
});

describe("Codex direct provider management", () => {
  it("uses tabs to select a mode and waits for the header action before preview or activation", async () => {
    let activeStatus: typeof status | typeof gatewayStatus = status;
    const { native } = setup({
      getCodexStatus: vi.fn().mockImplementation(() => Promise.resolve(activeStatus)),
      getCodexGatewayPreferences: vi.fn().mockResolvedValue({
        revision: "gateway-draft-1",
        exists: true,
        routeIds: ["route-reasoner"],
        defaultRouteId: "route-reasoner",
        credentialSource: "current",
      }),
      saveCodexGatewayPreferences: vi.fn().mockImplementation(async (draft) => ({
        ...draft,
        revision: "gateway-draft-2",
        exists: true,
      })),
      applyCodexConfig: vi.fn().mockImplementation(async () => {
        activeStatus = { ...gatewayStatus, revision: "after" };
        return activeStatus;
      }),
    });
    mount();
    await ready();
    const user = userEvent.setup();
    const tabs = screen.getByRole("tablist", { name: "Codex 接入方式" });
    expect(within(tabs).getAllByRole("tab")).toHaveLength(2);
    const direct = within(tabs).getByRole("tab", { name: /Codex 直连/ });
    expect(direct).toHaveAttribute("aria-selected", "true");
    expect(direct).toHaveTextContent("生效中");
    expect(screen.getByRole("radio", { name: /官方默认/ })).not.toBeChecked();
    expect(screen.getByText("https://current.example/v1")).toBeVisible();
    direct.focus();
    await user.keyboard("{ArrowRight}");
    const gateway = within(tabs).getByRole("tab", { name: /CX-RG 网关/ });
    expect(gateway).toHaveFocus();
    expect(gateway).toHaveAttribute("aria-selected", "false");
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(gateway).toHaveAttribute("aria-selected", "true");
    expect(direct).toHaveTextContent("生效中");
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const action = screen.getByRole("button", { name: "保存并启用网关" });
    await user.click(action);
    const dialog = await screen.findByRole("dialog", {
      name: "确认保存并启用网关",
    });
    expect(native.previewCodexConfig).toHaveBeenCalledWith({
      mode: "gateway",
      routeIds: ["route-reasoner"],
      defaultRouteId: "route-reasoner",
    });
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
    expect(direct).toHaveTextContent("生效中");
    expect(action).toBeEnabled();
    await user.click(action);
    const confirmation = await screen.findByRole("dialog", {
      name: "确认保存并启用网关",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "确认启用" }),
    );
    expect(await screen.findByText(/网关配置已保存并启用/)).toBeVisible();
    expect(gateway).toHaveTextContent("生效中");
    expect(native.applyCodexConfig).toHaveBeenCalled();
    expect(screen.queryByLabelText("推理强度")).not.toBeInTheDocument();
  });

  it("selects the saved Gateway view after loading, with direct profile drafts preserved on view changes", async () => {
    const { native } = setup({
      getCodexStatus: vi.fn().mockResolvedValue(gatewayStatus),
    });
    mount();
    expect(
      await screen.findByRole("tab", { name: /CX-RG 网关/ }),
    ).toHaveAttribute("aria-selected", "true");
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "选择 gateway-reasoner" }),
      ).toBeChecked(),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /Codex 直连/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /Codex 直连/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /CX-RG 网关/ })).toHaveTextContent(
      "生效中",
    );
    await user.click(screen.getByRole("button", { name: "切换到 Codex 直连" }));
    expect(await screen.findByRole("dialog", { name: "确认启用 Codex 直连" })).toBeVisible();
    expect(native.previewCodexConfig).toHaveBeenCalledWith({
      mode: "direct",
      profileId: "direct-one",
      profilesRevision: "profiles-before",
    });
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("radio", { name: /测试直连/ })).toBeChecked();
    await viewGateway();
    expect(
      screen.getByRole("checkbox", { name: "选择 gateway-reasoner" }),
    ).toBeChecked();
  });

  it("enables the selected direct profile inline via preview, confirmation and truthful saved feedback", async () => {
    const { native } = setup();
    mount();
    await selectCustom();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "启用所选直连方案" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认启用 Codex 直连",
    });
    expect(dialog).toHaveTextContent("测试直连");
    expect(dialog).toHaveTextContent(custom.baseUrl);
    expect(native.previewCodexConfig).toHaveBeenCalledWith({
      mode: "direct",
      profileId: "direct-one",
      profilesRevision: "profiles-before",
    });
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "确认启用" }));
    expect(await screen.findByText(/直连配置已启用.*重启 Codex/)).toBeVisible();
    expect(native.applyCodexConfig).toHaveBeenCalledWith({
      mode: "direct",
      profileId: "direct-one",
      profilesRevision: "profiles-before",
      expectedRevision: "before",
    });
    expect(screen.getByText("测试直连", { selector: "dd" })).toBeVisible();
  });

  it("canceling direct enable leaves the live file unchanged", async () => {
    const { native } = setup();
    mount();
    await selectCustom();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "启用所选直连方案" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "取消",
      }),
    );
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /Codex 直连/ })).toHaveTextContent(
      "生效中",
    );
  });

  it("saves a structured provider library entry without activating it and keeps existing Key on blank edit", async () => {
    const { native } = setup();
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "新增供应商" }));
    await user.type(screen.getByLabelText("方案名称"), "新增直连");
    await user.type(
      screen.getByLabelText("Responses API 地址"),
      "https://new.example/v1",
    );
    await user.type(
      screen.getByLabelText("供应商 API Key"),
      "test-private-key",
    );
    await user.type(screen.getByLabelText("模型列表（每行一个）"), "one\ntwo");
    await user.click(screen.getByRole("combobox", { name: "默认模型" }));
    await user.click(screen.getByRole("option", { name: "two" }));
    await user.click(screen.getByRole("button", { name: "保存方案" }));
    expect(await screen.findByText(/方案已保存.*未启用/)).toBeVisible();
    expect(native.saveCodexDirectProfile).toHaveBeenCalledWith({
      expectedRevision: "profiles-before",
      name: "新增直连",
      baseUrl: "https://new.example/v1",
      apiKey: "test-private-key",
      models: ["one", "two"],
      defaultModel: "two",
    });
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
    expect(screen.queryByText("test-private-key")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑 测试直连" }));
    expect(screen.getByLabelText("供应商 API Key")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "保存方案" }));
    expect(native.saveCodexDirectProfile).toHaveBeenLastCalledWith({
      expectedRevision: "saved",
      id: "direct-one",
      name: custom.name,
      baseUrl: custom.baseUrl,
      models: custom.models,
      defaultModel: "beta",
    });
  });

  it("imports current config only on explicit action, selects it and does not change live config", async () => {
    const { native } = setup({
      getCodexStatus: vi
        .fn()
        .mockResolvedValueOnce(status)
        .mockResolvedValue({
          ...status,
          direct: { ...status.direct, profileId: "snapshot-current" },
        }),
    });
    mount();
    await ready();
    const user = userEvent.setup();
    expect(native.importCodexDirectProfile).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "读取当前配置并保存" }),
    );
    expect(
      await screen.findByText(/当前配置已保存为直连方案.*未切换/),
    ).toBeVisible();
    expect(native.importCodexDirectProfile).toHaveBeenCalledWith({
      expectedRevision: "profiles-before",
      expectedConfigRevision: "before",
    });
    expect(
      screen.getByRole("radio", { name: /当前 Codex 配置/ }),
    ).toBeChecked();
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
  });

  it("duplicates and deletes only saved profiles with explicit delete confirmation", async () => {
    const { native } = setup();
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "复制 测试直连" }));
    expect(native.duplicateCodexDirectProfile).toHaveBeenCalledWith({
      expectedRevision: "profiles-before",
      id: "direct-one",
    });
    await user.click(screen.getByRole("button", { name: "删除 测试直连" }));
    const dialog = screen.getByRole("dialog", { name: "删除直连方案" });
    expect(native.deleteCodexDirectProfile).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "确认删除" }));
    expect(native.deleteCodexDirectProfile).toHaveBeenCalledWith({
      expectedRevision: "duplicated",
      id: "direct-one",
    });
    expect(
      screen.queryByRole("button", { name: "删除 官方默认" }),
    ).not.toBeInTheDocument();
  });

  it("shows profile storage failure honestly and keeps form values after a stale save", async () => {
    const { native } = setup({
      saveCodexDirectProfile: vi
        .fn()
        .mockRejectedValue(new Error("CODEX_PROFILES_CHANGED: hidden-secret")),
    });
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "编辑 测试直连" }));
    await user.clear(screen.getByLabelText("方案名称"));
    await user.type(screen.getByLabelText("方案名称"), "我的草稿");
    await user.click(screen.getByRole("button", { name: "保存方案" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /方案.*已.*修改/,
    );
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeVisible();
    expect(screen.getByLabelText("方案名称")).toHaveValue("我的草稿");
    expect(screen.queryByText(/hidden-secret/)).not.toBeInTheDocument();
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
  });

  it("keeps provider editing available while auxiliary login status is pending or unknown", async () => {
    let finish!: (value: unknown) => void;
    setup({
      getCodexClientStatus: vi.fn(
        () =>
          new Promise((done) => {
            finish = done;
          }),
      ),
    });
    mount();
    await ready();
    expect(screen.getByRole("button", { name: "新增供应商" })).toBeEnabled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "新增供应商" }));
    expect(screen.getByLabelText("方案名称")).toBeEnabled();
    await act(async () =>
      finish({ available: true, auth: "unknown", login: "idle" }),
    );
  });

  it("re-applies an active Gateway draft only from its state-aware header action", async () => {
    const { native } = setup({
      getCodexStatus: vi.fn().mockResolvedValue(gatewayStatus),
      applyCodexConfig: vi
        .fn()
        .mockImplementation(async (input: { routeIds: string[] }) => ({
        ...gatewayStatus,
        revision: "after",
        selectedRouteIds: input.routeIds,
        selectedModelAliases: ["gateway-reasoner", "gateway-second"],
        })),
    });
    mount();
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /CX-RG 网关/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: "Gateway 已启用" })).toBeDisabled();
    await user.click(
      screen.getByRole("checkbox", { name: "选择 gateway-second" }),
    );
    const action = screen.getByRole("button", { name: "保存并重新应用" });
    expect(action).toBeEnabled();
    await user.click(action);
    const dialog = await screen.findByRole("dialog", {
      name: "确认保存并启用网关",
    });
    expect(native.previewCodexConfig).toHaveBeenCalledWith({
      mode: "gateway",
      routeIds: ["route-reasoner", "route-second"],
      defaultRouteId: "route-reasoner",
    });
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.getByRole("button", { name: "保存并重新应用" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "保存并重新应用" }));
    const confirmation = await screen.findByRole("dialog", {
      name: "确认保存并启用网关",
    });
    await user.click(
      within(confirmation).getByRole("button", { name: "确认启用" }),
    );
    expect(await screen.findByText(/网关配置已保存并启用/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Gateway 已启用" })).toBeDisabled();
    expect(native.applyCodexConfig).toHaveBeenCalledWith({
      mode: "gateway",
      routeIds: ["route-reasoner", "route-second"],
      defaultRouteId: "route-reasoner",
      expectedRevision: "before",
    });
    expect(screen.getByRole("tab", { name: /CX-RG 网关/ })).toHaveTextContent(
      "生效中",
    );
    expect(native.applyCodexConfig).toHaveBeenCalledTimes(1);
  });

  it("guides an unconfigured Gateway to model routing without opening an activation dialog", async () => {
    const { native, data } = setup();
    data.routes = [];
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /CX-RG 网关/ }));
    await screen.findByRole("button", { name: "去配置模型路由" });
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "去配置模型路由" }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/routes");
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
  });

  it("guides an active Gateway with no selected models without attempting activation", async () => {
    const { native } = setup({
      getCodexStatus: vi.fn().mockResolvedValue(gatewayStatus),
    });
    mount();
    await screen.findByRole("button", { name: "Gateway 已启用" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "清空选择" }));
    expect(screen.getByRole("button", { name: "去配置模型路由" })).toBeEnabled();
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
  });

  it("filters eligible Gateway models by family without dropping hidden selections", async () => {
    const { data } = setup({
      getCodexStatus: vi.fn().mockResolvedValue(gatewayStatus),
    });
    data.routes[0].alias = "gateway-gpt";
    data.routes[0].targets[0].upstreamModel = "gpt-4.1";
    data.routes[2].alias = "gateway-claude";
    data.routes[2].targets = [
      { upstreamId: "up-lantern", upstreamModel: "claude-3.7-sonnet" },
    ];
    mount();
    const gpt = await screen.findByRole("checkbox", { name: "选择 gateway-gpt" });
    const filter = screen.getByRole("group", { name: "Codex 模型分类" });
    expect(within(filter).getByRole("button", { name: "全部 2" })).toBeVisible();
    expect(within(filter).getByRole("button", { name: "gpt 1" })).toBeVisible();
    expect(within(filter).getByRole("button", { name: "claude 1" })).toBeVisible();
    expect(gpt).toBeChecked();
    const user = userEvent.setup();
    await user.click(within(filter).getByRole("button", { name: "claude 1" }));
    expect(screen.queryByRole("checkbox", { name: "选择 gateway-gpt" })).not.toBeInTheDocument();
    const claude = screen.getByRole("checkbox", { name: "选择 gateway-claude" });
    expect(claude).not.toBeChecked();
    await user.click(claude);
    await user.click(within(filter).getByRole("button", { name: "gpt 1" }));
    expect(screen.getByRole("checkbox", { name: "选择 gateway-gpt" })).toBeChecked();
    await user.click(within(filter).getByRole("button", { name: "全部 2" }));
    expect(screen.getByRole("checkbox", { name: "选择 gateway-claude" })).toBeChecked();
    await user.click(within(filter).getByRole("button", { name: "gpt 1" }));
    const search = screen.getByRole("searchbox", { name: "搜索模型或上游" });
    await user.type(search, "no-matching-model");
    expect(screen.getByText("没有匹配的模型。")).toBeVisible();
    expect(within(filter).getByRole("button", { name: "gpt 1" })).toBeVisible();
    await user.clear(search);
    expect(screen.getByRole("checkbox", { name: "选择 gateway-gpt" })).toBeChecked();
    await user.click(within(filter).getByRole("button", { name: "claude 1" }));
    await user.click(screen.getByRole("checkbox", { name: "选择 gateway-claude" }));
    await user.type(search, "gateway-claude");
    await user.click(screen.getByRole("button", { name: "全选搜索结果" }));
    expect(screen.getByRole("combobox", { name: "默认模型" })).toHaveTextContent("gateway-gpt");
    await user.clear(search);
    await user.click(within(filter).getByRole("button", { name: "kimi 0" }));
    expect(screen.getByText("没有匹配的模型。")).toBeVisible();
    await user.click(within(filter).getByRole("button", { name: "全部 2" }));
    expect(screen.getByRole("checkbox", { name: "选择 gateway-gpt" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择 gateway-claude" })).toBeChecked();
  });

  it.each(["direct", "gateway"] as const)("keeps %s mode selectable but blocks its action while official login is pending", async (mode) => {
    const { native } = setup({
      getCodexStatus: vi.fn().mockResolvedValue(mode === "direct" ? gatewayStatus : status),
      getCodexClientStatus: vi.fn().mockResolvedValue({ available: true, login: "pending", auth: "unknown" }),
    });
    mount();
    await screen.findByText(/官方登录正在进行。方案仍可保存/);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: mode === "direct" ? /Codex 直连/ : /CX-RG 网关/ }));
    expect(screen.getByRole("tab", { name: mode === "direct" ? /Codex 直连/ : /CX-RG 网关/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "请先完成官方登录" })).toBeDisabled();
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
  });

  it("does not let family bulk selection exceed Codex's 100-model limit", async () => {
    const routes = Array.from({ length: 101 }, (_, index) => ({
      id: `gpt-route-${index}`,
      alias: `gpt-model-${index}`,
      enabled: true,
      inboundProtocol: "Res" as const,
      outboundProtocol: "Res" as const,
      targets: [{ upstreamId: "up-northstar", upstreamModel: `gpt-model-${index}` }],
    }));
    const selectedRoutes = routes.slice(0, 100);
    const selectedIds = selectedRoutes.map((route) => route.id);
    const { data } = setup({
      getCodexStatus: vi.fn().mockResolvedValue({
        ...gatewayStatus,
        selectedRouteIds: selectedIds,
        selectedModelAliases: selectedRoutes.map((route) => route.alias),
        defaultRouteId: selectedIds[0],
      }),
    });
    data.routes = routes;
    mount();
    expect(await screen.findByText("已选 100 个")).toBeVisible();
    const filter = screen.getByRole("group", { name: "Codex 模型分类" });
    expect(within(filter).getByRole("button", { name: "gpt 101" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "选择 gpt-model-100" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "全选搜索结果" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "默认模型" })).toHaveTextContent("gpt-model-0");
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "选择 gpt-model-99" }));
    expect(screen.getByRole("button", { name: "全选搜索结果" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "全选搜索结果" }));
    expect(screen.getByText("已选 100 个")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "选择 gpt-model-99" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "选择 gpt-model-100" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "默认模型" })).toHaveTextContent("gpt-model-0");
  });

  it("locks mode tabs while a direct preview is pending", async () => {
    let finish!: (value: typeof preview) => void;
    const { native } = setup({
      previewCodexConfig: vi.fn(
        () =>
          new Promise<typeof preview>((done) => {
            finish = done;
          }),
      ),
    });
    mount();
    await selectCustom();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "启用所选直连方案" }));
    expect(screen.getByRole("tab", { name: /CX-RG 网关/ })).toBeDisabled();
    await act(async () => finish(preview));
    const dialog = await screen.findByRole("dialog", {
      name: "确认启用 Codex 直连",
    });
    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
  });

  it("loads status and profiles in StrictMode without a stuck write gate", async () => {
    setup();
    mount(true);
    await ready();
    await userEvent
      .setup()
      .click(screen.getByRole("radio", { name: /测试直连/ }));
    expect(
      screen.getByRole("button", { name: "启用所选直连方案" }),
    ).toBeEnabled();
  });

  it("direct remains usable with Gateway offline and profile encryption unavailable is explicit", async () => {
    setup({
      getCodexDirectProfiles: vi.fn().mockResolvedValue({
        ...profiles,
        secureStorageAvailable: false,
        profiles: [official],
      }),
    });
    defaultWorkspaceClient.getWorkspace = vi
      .fn()
      .mockRejectedValue(new Error("raw"));
    mount();
    await ready();
    expect(screen.getByText(/安全存储不可用/)).toBeVisible();
    expect(screen.getByRole("button", { name: "新增供应商" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /官方默认/ })).toBeEnabled();
  });

  it("keeps profile save usable during actual login but blocks configuration activation clearly", async () => {
    const { native } = setup({
      getCodexClientStatus: vi.fn().mockResolvedValue({
        available: true,
        auth: "unknown",
        login: "pending",
      }),
    });
    mount();
    await selectCustom();
    expect(screen.getByRole("button", { name: "新增供应商" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "请先完成官方登录" })).toBeDisabled();
    expect(native.previewCodexConfig).not.toHaveBeenCalled();
  });

  it("invalidates a pending preview when another profile is selected", async () => {
    let finish!: (value: typeof preview) => void;
    const { native } = setup({
      previewCodexConfig: vi.fn(
        () =>
          new Promise<typeof preview>((done) => {
            finish = done;
          }),
      ),
    });
    mount();
    await selectCustom();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "启用所选直连方案" }));
    await user.click(screen.getByRole("radio", { name: "官方默认" }));
    await act(async () => finish(preview));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
  });

  it("keeps delete errors inside its dialog and does not remove the scheme on failure", async () => {
    setup({
      deleteCodexDirectProfile: vi
        .fn()
        .mockRejectedValue(new Error("CODEX_PROFILE_IN_USE: secret")),
    });
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "删除 测试直连" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "确认删除",
      }),
    );
    expect(
      await within(screen.getByRole("dialog")).findByRole("alert"),
    ).toHaveTextContent(/正在使用/);
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "测试直连" })).toBeInTheDocument();
  });

  it("does not assume official direct or active mode after an unknown configuration status", async () => {
    setup({
      getCodexStatus: vi
        .fn()
        .mockResolvedValue({ ...status, mode: "unknown", direct: undefined }),
    });
    mount();
    await screen.findByText(/当前接入无法识别/);
    for (const modeTab of screen.getAllByRole("tab")) {
      expect(modeTab).toHaveAttribute("aria-selected", "false");
      expect(modeTab).not.toHaveTextContent("生效中");
    }
  });

  it("reports stale activation safely and preserves actual current status", async () => {
    setup({
      applyCodexConfig: vi
        .fn()
        .mockRejectedValue(new Error("CODEX_CONFIG_CHANGED: private")),
    });
    mount();
    await selectCustom();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "启用所选直连方案" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "确认启用",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /配置已被其他程序修改/,
    );
    expect(
      screen.getByText("当前自定义提供商", { selector: "dd" }),
    ).toBeVisible();
    expect(screen.queryByText(/private/)).not.toBeInTheDocument();
    expect(
      window.desktopControls!.getCodexDirectProfiles,
    ).toHaveBeenCalledTimes(1);
  });

  it("places the state-aware mode action above the tabs and Gateway model list", async () => {
    setup();
    mount();
    await ready();
    await viewGateway();
    const action = await screen.findByRole("button", {
      name: /保存并启用网关|去配置模型路由/,
    });
    const gatewayTab = screen.getByRole("tab", { name: /CX-RG 网关/ });
    const models = screen.getByRole("group", { name: "Gateway 模型列表" });
    expect(
      action.compareDocumentPosition(gatewayTab) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      gatewayTab.compareDocumentPosition(models) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("prevents a profile editor from overlapping the deferred activation confirmation", async () => {
    let finish!: (value: typeof preview) => void;
    setup({
      previewCodexConfig: vi.fn(
        () =>
          new Promise<typeof preview>((done) => {
            finish = done;
          }),
      ),
    });
    mount();
    await selectCustom();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "启用所选直连方案" }));
    expect(screen.getByRole("button", { name: "新增供应商" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "编辑 测试直连" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "编辑 测试直连" }));
    await act(async () => finish(preview));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "确认启用 Codex 直连",
    );
  });

  it("refreshes profile activity after successful restore and treats native status as authoritative", async () => {
    const activeStatus = {
      ...status,
      direct: { ...status.direct, profileId: custom.id, name: custom.name },
    };
    const restored = {
      ...status,
      revision: "restored",
      model: undefined,
      direct: {
        kind: "official",
        name: "官方默认",
        profileId: "official",
        importable: false,
      },
    };
    const getProfiles = vi
      .fn()
      .mockResolvedValueOnce({
        ...profiles,
        profiles: [official, { ...custom, active: true }],
      })
      .mockResolvedValue({
        ...profiles,
        revision: "restored-profiles",
        profiles: [
          { ...official, active: true },
          { ...custom, active: false },
        ],
      });
    const { native } = setup({
      getCodexStatus: vi.fn().mockResolvedValue(activeStatus),
      getCodexDirectProfiles: getProfiles,
      restoreCodexConfig: vi.fn().mockResolvedValue(restored),
    });
    mount();
    await screen.findByText(custom.name, { selector: "dd" });
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
    expect(await screen.findByText(/已恢复备份/)).toBeVisible();
    await waitFor(() =>
      expect(native.getCodexDirectProfiles).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByText("官方默认", { selector: "dd" })).toBeVisible();
    const customRow = screen
      .getByRole("radio", { name: custom.name })
      .closest(".codex-direct-row")!;
    expect(
      within(customRow as HTMLElement).queryByText("生效中"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除 测试直连" })).toBeEnabled();
  });

  it("does not retain a false active badge if profile refresh fails after restoring official", async () => {
    const activeStatus = {
      ...status,
      direct: { ...status.direct, profileId: custom.id, name: custom.name },
    };
    const restored = {
      ...status,
      revision: "restored",
      direct: {
        kind: "official",
        name: "官方默认",
        profileId: "official",
        importable: false,
      },
    };
    const getProfiles = vi
      .fn()
      .mockResolvedValueOnce({
        ...profiles,
        profiles: [official, { ...custom, active: true }],
      })
      .mockRejectedValue(new Error("CODEX_PROFILES_INVALID: private"));
    setup({
      getCodexStatus: vi.fn().mockResolvedValue(activeStatus),
      getCodexDirectProfiles: getProfiles,
      restoreCodexConfig: vi.fn().mockResolvedValue(restored),
    });
    mount();
    await screen.findByText(custom.name, { selector: "dd" });
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
    expect(
      await screen.findByText("官方默认", { selector: "dd" }),
    ).toBeVisible();
    await waitFor(() => expect(getProfiles).toHaveBeenCalledTimes(2));
    expect(screen.queryAllByText("生效中")).toHaveLength(1);
  });

  it("refreshes profiles and shows restored direct profile activity after Gateway restore", async () => {
    const restored = {
      ...status,
      revision: "restored-direct",
      direct: { ...status.direct, profileId: custom.id, name: custom.name },
    };
    const getProfiles = vi
      .fn()
      .mockResolvedValueOnce(profiles)
      .mockResolvedValue({
        ...profiles,
        revision: "restored-library",
        profiles: [official, { ...custom, active: true }],
      });
    setup({
      getCodexStatus: vi.fn().mockResolvedValue(gatewayStatus),
      getCodexDirectProfiles: getProfiles,
      restoreCodexConfig: vi.fn().mockResolvedValue(restored),
    });
    mount();
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /CX-RG 网关/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
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
    await waitFor(() => expect(getProfiles).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("tab", { name: /Codex 直连/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const customRow = screen
      .getByRole("radio", { name: custom.name })
      .closest(".codex-direct-row")!;
    expect(within(customRow as HTMLElement).getByText("生效中")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "删除 测试直连" }),
    ).toBeDisabled();
  });

  it("creates only one profile while the successful save awaits its status reread, even when that reread fails", async () => {
    let rejectStatus!: (error: Error) => void;
    const read = vi
      .fn()
      .mockResolvedValueOnce(status)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectStatus = reject;
          }),
      );
    const newProfile = { ...custom, id: "new-profile", name: "新增方案" };
    const save = vi
      .fn()
      .mockResolvedValue({
        ...profiles,
        revision: "saved-new",
        profiles: [...profiles.profiles, newProfile],
      });
    setup({ getCodexStatus: read, saveCodexDirectProfile: save });
    mount();
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "新增供应商" }));
    await user.type(screen.getByLabelText("方案名称"), newProfile.name);
    await user.type(
      screen.getByLabelText("Responses API 地址"),
      custom.baseUrl,
    );
    await user.type(screen.getByLabelText("供应商 API Key"), "new-key");
    await user.type(screen.getByLabelText("模型列表（每行一个）"), "one");
    await user.click(screen.getByRole("button", { name: "保存方案" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    await user.dblClick(screen.getByRole("button", { name: "保存中…" }));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => rejectStatus(new Error("raw-status-body")));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("radio", { name: newProfile.name }),
    ).toBeInTheDocument();
    expect(screen.getByText(/方案已保存.*未启用/)).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(/配置读取失败/);
    expect(screen.queryByText(/raw-status-body/)).not.toBeInTheDocument();
  });
});
