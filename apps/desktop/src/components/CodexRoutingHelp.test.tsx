import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CodexModelsPanel } from "./CodexModelsPanel";
import { CodexConfirmDialog } from "./CodexConfirmDialog";

describe("Codex route policy help", () => {
  it("shows each model range and says how to refresh the native choices", () => {
    render(<CodexModelsPanel routes={[
      { id: "range", alias: "range-model", inboundProtocol: "Res", outboundProtocol: "Chat", enabled: true, targets: [{ upstreamId: "a", upstreamModel: "model" }], reasoning: { min: "low", max: "max" } },
      { id: "legacy", alias: "legacy-model", inboundProtocol: "Res", outboundProtocol: "Res", enabled: true, targets: [{ upstreamId: "a", upstreamModel: "old" }] },
    ]} upstreams={[]} routeIds={[]} defaultRouteId="" onModels={() => {}} onDefault={() => {}} locked={false} gatewayReady loading={false} />);
    expect(screen.getByText(/推理：low → max/)).toBeVisible();
    expect(screen.getByText(/推理：不限（兼容旧路由）/)).toBeVisible();
    expect(screen.getByText(/重新保存并启用网关/)).toHaveTextContent("立即");
  });

  it("explains hosted search loss while preserving local tools and the profile boundary", () => {
    const management = {
      confirmation: "apply", busy: null, selectedAliases: ["model"], clientKey: "", credentialSource: "stored",
      status: { configPath: "isolated/config.toml" },
      preview: { mode: "gateway", selectedModelAliases: ["model"], changes: [], searchPolicy: { webSearch: "disabled", reason: "converted-upstream", affectsActiveProfile: false, externalOverrides: "not-managed" }, catalogRefresh: "on-explicit-apply" },
      setConfirmation: () => {}, confirmAction: async () => true,
    } as unknown as Parameters<typeof CodexConfirmDialog>[0]["management"];
    render(<CodexConfirmDialog management={management} blocked={false} />);
    expect(screen.getByText(/官方托管搜索不可用/)).toHaveTextContent("本地工具");
    expect(screen.getByText(/独立 --profile/)).toHaveTextContent("不会自动修改");
  });
});
