import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CodexStatusPanel } from "./CodexStatusPanel";
import type { CodexStatus } from "../domain/codex-management";

const baseStatus: CodexStatus = {
  configScope: "user", configPath: "C:/isolated/config.toml", exists: true, revision: "fixture", configured: true,
  mode: "gateway", model: "image-model", credentialConfigured: true, selectedRouteIds: ["route"], selectedModelAliases: ["image-model"], catalogStatus: "managed",
};

describe("Codex catalog status", () => {
  it("shows the applied Gateway catalog input capabilities and the disk-only verification boundary", () => {
    render(<CodexStatusPanel available loading={false} status={{ ...baseStatus, catalogSync: {
      state: "current", source: "gateway", catalogPath: "C:/isolated/gateway-models.json",
      models: [{ model: "image-model", inputModalities: ["text", "image"] }, { model: "text-model", inputModalities: ["text"] }],
    } }} />);
    const catalog = screen.getByRole("region", { name: "模型能力目录" });
    expect(within(catalog).getByText("已应用的网关模型目录与当前设置一致。")).toBeVisible();
    expect(within(catalog).getByText("image-model：文本和图片")).toBeVisible();
    expect(within(catalog).getByText("text-model：仅文本")).toBeVisible();
    expect(within(catalog).getByText("C:/isolated/gateway-models.json")).toBeVisible();
    expect(within(catalog).getByText(/仅检查磁盘配置/)).toHaveTextContent("不能确认正在运行的 Codex 已重载");
    expect(within(catalog).getByText(/完整退出并重启 Codex/)).toBeVisible();
  });

  it("shows a direct catalog without presenting Gateway route capabilities as applied", () => {
    render(<CodexStatusPanel available loading={false} status={{ ...baseStatus, mode: "direct", direct: { kind: "custom", name: "Direct fixture", importable: true }, catalogSync: {
      state: "current", source: "direct", models: [{ model: "direct-model", inputModalities: ["text", "image"] }],
    } }} />);
    const catalog = screen.getByRole("region", { name: "模型能力目录" });
    expect(within(catalog).getByText("已应用的直连模型目录与当前设置一致。")).toBeVisible();
    expect(within(catalog).getByText("direct-model：文本和图片")).toBeVisible();
    expect(within(catalog).queryByText(/网关模型目录与当前设置一致/)).not.toBeInTheDocument();
  });

  it("asks for explicit Gateway reapplication when the catalog is stale", () => {
    render(<CodexStatusPanel available loading={false} status={{ ...baseStatus, catalogSync: { state: "stale", source: "gateway", models: [{ model: "image-model", inputModalities: ["text"] }] } }} />);
    const catalog = screen.getByRole("region", { name: "模型能力目录" });
    expect(within(catalog).getByText(/目录待重新应用/)).toHaveTextContent("重新保存并启用网关");
    expect(within(catalog).getByText("image-model：仅文本")).toBeVisible();
    expect(within(catalog).getByText(/当前已写入目录的输入能力/)).toBeVisible();
  });

  it("directs a stale direct catalog back to its own saved plan", () => {
    render(<CodexStatusPanel available loading={false} status={{ ...baseStatus, mode: "direct", catalogSync: { state: "stale", source: "direct", models: [] } }} />);
    const catalog = screen.getByRole("region", { name: "模型能力目录" });
    expect(within(catalog).getByText(/直连模型目录待重新应用/)).toHaveTextContent("重新保存并启用当前直连方案");
    expect(within(catalog).queryByText(/重新保存并启用网关/)).not.toBeInTheDocument();
  });

  it.each(["direct", "gateway"] as const)("explains a missing or overridden catalog for %s without claiming a file is absent", (mode) => {
    render(<CodexStatusPanel available loading={false} status={{ ...baseStatus, mode, catalogStatus: mode === "direct" ? "none" : "managed", catalogSync: { state: "not-applied", source: "none", models: [] } }} />);
    const catalog = screen.getByRole("region", { name: "模型能力目录" });
    expect(within(catalog).getByText(/当前接入未使用本产品的模型能力目录/)).toHaveTextContent("或被启动配置、模型选择覆盖。模型路由中的能力不能据此认定已应用。");
    expect(within(catalog).getByText(/如果要使用网关路由/)).toHaveTextContent("保存并启用网关");
    expect(within(catalog).queryByText(/目录文件不存在/)).not.toBeInTheDocument();
  });

  it.each([
    ["gateway", "重新保存并启用网关"],
    ["direct", "重新保存并启用当前直连方案"],
  ] as const)("explains both service and directory repair when %s catalog verification is unavailable", (source, repairAction) => {
    render(<CodexStatusPanel available loading={false} status={{ ...baseStatus, catalogSync: { state: "unavailable", source, models: [] } }} />);
    const catalog = screen.getByRole("region", { name: "模型能力目录" });
    const message = within(catalog).getByText(/无法核对模型目录/);
    expect(message).toHaveTextContent("请检查本机服务和模型目录");
    expect(message).toHaveTextContent(`本机服务正常时，请${repairAction}`);
    expect(message).toHaveTextContent("再完整退出并重启 Codex");
    expect(within(catalog).queryByText(/目录与当前设置一致/)).not.toBeInTheDocument();
  });

  it("treats missing diagnostics from an older runtime as unverified", () => {
    render(<CodexStatusPanel available loading={false} status={baseStatus} />);
    expect(screen.getByText(/尚未提供模型目录检查结果/)).toHaveTextContent("不能确认图片能力是否已写入");
  });

  it("hides previous catalog diagnostics while refreshing or when unavailable", () => {
    const status = { ...baseStatus, catalogSync: { state: "current", source: "gateway", models: [{ model: "image-model", inputModalities: ["text", "image"] }] } } satisfies CodexStatus;
    const { rerender } = render(<CodexStatusPanel available loading status={status} />);
    expect(screen.queryByRole("region", { name: "模型能力目录" })).not.toBeInTheDocument();
    rerender(<CodexStatusPanel available={false} loading={false} status={status} />);
    expect(screen.queryByRole("region", { name: "模型能力目录" })).not.toBeInTheDocument();
  });
});
