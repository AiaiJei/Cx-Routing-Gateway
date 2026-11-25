import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { workspaceFixtures } from "../data/fixtures";
import { CodexPage } from "./CodexPage";

const secret = "cxrg_frontend_test_key_123456";
const originalControls = window.desktopControls;
const originalClient = { ...defaultWorkspaceClient };
const status = { configPath: "C:\\test-codex\\config.toml", exists: true, revision: "revision-before", configured: false, model: "old-model", credentialConfigured: false };
const saved = { ...status, revision: "revision-after", configured: true, model: "gateway-reasoner", baseUrl: "http://127.0.0.1:4318/v1", credentialConfigured: true, backup: { id: "backup-1", createdAt: "2026-11-25T09:30:00Z" } };
const preview = { configPath: status.configPath, revision: status.revision, model: "gateway-reasoner", baseUrl: "http://127.0.0.1:4318/v1", configPreview: 'model = "gateway-reasoner"\nexperimental_bearer_token = "[REDACTED]"', replacesCurrentProvider: true };

function setupLive(overrides = {}) {
  const data = structuredClone(workspaceFixtures);
  data.meta = { source: "runtime", live: true };
  data.gateway = { state: "运行中", url: "http://127.0.0.1:4318" };
  data.routes.push({ ...data.routes[0], id: "route-second", alias: "gateway-second", outboundProtocol: "Res" }, { ...data.routes[0], id: "route-off", alias: "disabled-route", enabled: false });
  defaultWorkspaceClient.getWorkspace = vi.fn().mockResolvedValue(data);
  defaultWorkspaceClient.createClientKey = vi.fn().mockResolvedValue({ id: "new-key", key: secret });
  const native = {
    getCodexStatus: vi.fn().mockResolvedValue(status),
    previewCodexConfig: vi.fn().mockResolvedValue(preview),
    applyCodexConfig: vi.fn().mockResolvedValue(saved),
    restoreCodexConfig: vi.fn().mockResolvedValue(status),
    ...overrides,
  };
  window.desktopControls = native as unknown as NonNullable<typeof window.desktopControls>;
  return { native, data };
}

function mount() { return render(<MemoryRouter><CodexPage /></MemoryRouter>); }
async function selectRoute(name = "gateway-reasoner") {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("combobox", { name: "Codex 模型路由" }));
  await user.click(screen.getByRole("option", { name }));
  return user;
}
async function prepare() {
  const user = await selectRoute();
  await user.type(screen.getByLabelText("Gateway 客户端 Key"), secret);
  await user.click(screen.getByRole("button", { name: "预览配置" }));
  await screen.findByText(/experimental_bearer_token/);
  return user;
}

beforeEach(() => { Object.assign(defaultWorkspaceClient, originalClient); window.desktopControls = undefined; });
afterEach(() => { Object.assign(defaultWorkspaceClient, originalClient); window.desktopControls = originalControls; vi.restoreAllMocks(); });

describe("CodexPage", () => {
  it("shows fixture context and blocks native writes and key creation", async () => {
    const create = vi.fn();
    defaultWorkspaceClient.createClientKey = create;
    mount();
    expect(await screen.findByText(/浏览器预览.*不读取本机 Codex 配置/)).toBeVisible();
    expect(screen.getByRole("button", { name: "预览配置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "创建专用 Key" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "应用配置" })).toBeDisabled();
    expect(screen.getByLabelText("Gateway 客户端 Key")).toBeDisabled();
    expect(create).not.toHaveBeenCalled();
    for (const [name, href] of [["模型路由", "/routes"], ["上游服务", "/upstreams"], ["接入凭证", "/credentials"]]) expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });

  it("shows loading without fixture route data and explains an empty eligible route set", async () => {
    let resolve!: (data: typeof workspaceFixtures) => void;
    setupLive();
    defaultWorkspaceClient.getWorkspace = () => new Promise(done => { resolve = done; });
    mount();
    expect(screen.getByText("正在读取工作区…")).toBeVisible();
    expect(screen.queryByText("gateway-reasoner")).not.toBeInTheDocument();
    await act(async () => resolve({ ...workspaceFixtures, meta: { source: "runtime", live: true }, routes: [] }));
    expect(await screen.findByText(/还没有可用的 Responses 路由/)).toBeVisible();
    expect(screen.getByRole("button", { name: "预览配置" })).toBeDisabled();
  });

  it("offers only enabled Responses routes and shows the selected upstream path", async () => {
    setupLive(); mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("combobox", { name: "Codex 模型路由" }));
    expect(screen.getByRole("option", { name: "gateway-reasoner" })).toBeVisible();
    expect(screen.getByRole("option", { name: "gateway-second" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "gateway-fast" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "disabled-route" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "gateway-reasoner" }));
    expect(screen.getByText(/Northstar AI/)).toBeVisible();
    expect(screen.getByText("Res → Chat → Res")).toBeVisible();
  });

  it("requires confirmation before apply and clears the secret after success", async () => {
    const { native } = setupLive(); mount(); const user = await prepare();
    expect(native.previewCodexConfig).toHaveBeenCalledWith({ routeId: "route-reasoner" });
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "应用配置" }));
    const dialog = screen.getByRole("dialog", { name: "确认应用 Codex 配置" });
    expect(dialog).toHaveTextContent(/明文.*Key/);
    expect(dialog).toHaveTextContent(/仅更新接入字段.*其他内容保留/);
    expect(native.applyCodexConfig).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "确认应用" }));
    expect(await screen.findByText(/配置已保存.*重启 Codex/)).toBeVisible();
    expect(native.applyCodexConfig).toHaveBeenCalledWith({ routeId: "route-reasoner", clientKey: secret, expectedRevision: status.revision });
    expect(screen.getByLabelText("Gateway 客户端 Key")).toHaveValue("");
    expect(screen.getByRole("button", { name: "应用配置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "恢复备份" })).toBeEnabled();
  });

  it("preserves input and hides arbitrary error text after a failed apply", async () => {
    const { native } = setupLive({ applyCodexConfig: vi.fn().mockRejectedValue(new Error(`bad parser ${secret}`)) });
    mount(); const user = await prepare();
    await user.click(screen.getByRole("button", { name: "应用配置" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认应用" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/应用失败/);
    expect(alert).not.toHaveTextContent(secret);
    expect(alert).not.toHaveTextContent("bad parser");
    expect(screen.getByLabelText("Gateway 客户端 Key")).toHaveValue(secret);
    expect(native.applyCodexConfig).toHaveBeenCalledTimes(1);
  });

  it("invalidates the preview when route, reasoning or Key changes", async () => {
    setupLive(); mount(); const user = await prepare();
    await user.click(screen.getByRole("combobox", { name: "推理强度" }));
    await user.click(screen.getByRole("option", { name: "high" }));
    expect(screen.queryByText(/experimental_bearer_token/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "应用配置" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "预览配置" }));
    await screen.findByText(/experimental_bearer_token/);
    await user.type(screen.getByLabelText("Gateway 客户端 Key"), "changed");
    expect(screen.getByRole("button", { name: "应用配置" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "预览配置" }));
    await screen.findByText(/experimental_bearer_token/);
    await user.click(screen.getByRole("combobox", { name: "Codex 模型路由" }));
    await user.click(screen.getByRole("option", { name: "gateway-second" }));
    expect(screen.getByRole("button", { name: "应用配置" })).toBeDisabled();
  });

  it("discards an old pending preview after the selection changes", async () => {
    let resolve!: (value: typeof preview) => void;
    setupLive({ previewCodexConfig: vi.fn(() => new Promise(done => { resolve = done; })) });
    mount(); const user = await selectRoute();
    await user.click(screen.getByRole("button", { name: "预览配置" }));
    await user.click(screen.getByRole("combobox", { name: "Codex 模型路由" }));
    await user.click(screen.getByRole("option", { name: "gateway-second" }));
    await act(async () => resolve(preview));
    expect(screen.queryByText(/experimental_bearer_token/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "应用配置" })).toBeDisabled();
  });

  it("creates a scoped Key only after the dedicated action and keeps it out of page text", async () => {
    setupLive(); mount(); const user = await selectRoute();
    expect(defaultWorkspaceClient.createClientKey).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "创建专用 Key" }));
    await user.click(within(screen.getByRole("dialog", { name: "创建 Codex 专用 Key" })).getByRole("button", { name: "确认创建" }));
    expect(await screen.findByText(/专用 Key 已创建/)).toBeVisible();
    expect(defaultWorkspaceClient.createClientKey).toHaveBeenCalledWith("Codex · gateway-reasoner", ["gateway-reasoner"]);
    expect(screen.getByLabelText("Gateway 客户端 Key")).toHaveValue(secret);
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });

  it("restores only after confirmation using the loaded file revision", async () => {
    const { native } = setupLive({ getCodexStatus: vi.fn().mockResolvedValue(saved) }); mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "恢复备份" }));
    expect(native.restoreCodexConfig).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog", { name: "确认恢复 Codex 配置" })).getByRole("button", { name: "确认恢复" }));
    expect(await screen.findByText(/已恢复备份/)).toBeVisible();
    expect(native.restoreCodexConfig).toHaveBeenCalledWith({ backupId: "backup-1", expectedRevision: saved.revision });
  });

  it("blocks writes when status cannot be read and allows a retry without unsafe error details", async () => {
    const getCodexStatus = vi.fn().mockRejectedValueOnce(new Error(`io ${secret}`)).mockResolvedValue(status);
    setupLive({ getCodexStatus }); mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(/读取失败/);
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "预览配置" })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "刷新状态" }));
    expect(await screen.findByText(status.configPath)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the status failure visible when editing a route", async () => {
    setupLive({ getCodexStatus: vi.fn().mockRejectedValue(new Error("CODEX_CONFIG_INVALID: parser contents")) }); mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(/TOML/);
    await selectRoute();
    expect(screen.getByRole("alert")).toHaveTextContent(/TOML/);
    expect(screen.getByRole("button", { name: "预览配置" })).toBeDisabled();
  });

  it("uses the current explicit reasoning selection in the preview and apply", async () => {
    const { native } = setupLive(); mount(); const user = await selectRoute();
    await user.click(screen.getByRole("combobox", { name: "推理强度" }));
    await user.click(screen.getByRole("option", { name: "high" }));
    await user.type(screen.getByLabelText("Gateway 客户端 Key"), secret);
    await user.click(screen.getByRole("button", { name: "预览配置" }));
    await screen.findByText(/experimental_bearer_token/);
    expect(native.previewCodexConfig).toHaveBeenCalledWith({ routeId: "route-reasoner", reasoningEffort: "high" });
    await user.click(screen.getByRole("button", { name: "应用配置" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认应用" }));
    await screen.findByText(/配置已保存/);
    expect(native.applyCodexConfig).toHaveBeenCalledWith({ routeId: "route-reasoner", reasoningEffort: "high", clientKey: secret, expectedRevision: status.revision });
  });

  it("handles a restore conflict without claiming success or exposing backend details", async () => {
    const { native } = setupLive({ getCodexStatus: vi.fn().mockResolvedValue(saved), restoreCodexConfig: vi.fn().mockRejectedValue(new Error(`CODEX_CONFIG_CHANGED: ${secret}`)) }); mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "恢复备份" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认恢复" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/配置已被其他程序修改.*刷新状态/);
    expect(screen.queryByText(/已恢复备份/)).not.toBeInTheDocument();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
    expect(native.restoreCodexConfig).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard route choice and cancelling confirmation without creating a Key", async () => {
    setupLive(); mount(); const user = userEvent.setup();
    const combo = await screen.findByRole("combobox", { name: "Codex 模型路由" });
    combo.focus(); await user.keyboard("{ArrowDown}{Enter}");
    expect(combo).toHaveTextContent("gateway-reasoner");
    const create = screen.getByRole("button", { name: "创建专用 Key" });
    await user.click(create);
    expect(screen.getByRole("dialog", { name: "创建 Codex 专用 Key" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(create).toHaveFocus();
    expect(defaultWorkspaceClient.createClientKey).not.toHaveBeenCalled();
  });

  it("blocks every write while workspace refresh is pending after native status settles", async () => {
    const { native, data } = setupLive({ getCodexStatus: vi.fn().mockResolvedValue(saved) });
    let finishWorkspace!: (value: typeof data) => void;
    defaultWorkspaceClient.getWorkspace = vi.fn().mockResolvedValueOnce(data).mockImplementationOnce(() => new Promise(done => { finishWorkspace = done; }));
    mount(); const user = await selectRoute();
    await user.click(screen.getByRole("button", { name: "刷新状态" }));
    await waitFor(() => expect(native.getCodexStatus).toHaveBeenCalledTimes(2));
    await act(async () => {});
    for (const name of ["创建专用 Key", "恢复备份", "预览配置", "应用配置"]) expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(screen.getByLabelText("Gateway 客户端 Key")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "创建专用 Key" }));
    expect(defaultWorkspaceClient.createClientKey).not.toHaveBeenCalled();
    await act(async () => finishWorkspace(data));
    expect(screen.getByRole("button", { name: "创建专用 Key" })).toBeEnabled();
  });

  it("keeps native writes blocked after a failed workspace refresh until refresh succeeds", async () => {
    const { data } = setupLive({ getCodexStatus: vi.fn().mockResolvedValue(saved) });
    defaultWorkspaceClient.getWorkspace = vi.fn().mockResolvedValueOnce(data).mockRejectedValueOnce(new Error("untrusted internal content")).mockResolvedValueOnce(data);
    mount(); const user = await selectRoute();
    await user.click(screen.getByRole("button", { name: "刷新状态" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("工作区刷新失败，请刷新状态后重试。");
    for (const name of ["创建专用 Key", "恢复备份", "预览配置", "应用配置"]) expect(screen.getByRole("button", { name })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "刷新状态" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "创建专用 Key" })).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the created Key scope and blocks applying it to a different selected model", async () => {
    setupLive(); mount(); const user = await selectRoute();
    await user.click(screen.getByRole("button", { name: "创建专用 Key" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "确认创建" }));
    await screen.findByText(/专用 Key 已创建/);
    await selectRoute("gateway-second");
    expect(screen.getByText(/本页创建的 Key 仅允许访问 gateway-reasoner/)).toBeVisible();
    expect(screen.getByLabelText("Gateway 客户端 Key")).toHaveValue(secret);
    await user.click(screen.getByRole("button", { name: "预览配置" }));
    await screen.findByText(/experimental_bearer_token/);
    expect(screen.getByRole("button", { name: "应用配置" })).toBeDisabled();
  });
});
