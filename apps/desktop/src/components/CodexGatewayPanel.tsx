import { Button } from "./Button";
import { CodexGatewayCredentialPanel } from "./CodexGatewayCredentialPanel";
import { CodexModelsPanel } from "./CodexModelsPanel";
import type { useCodexManagement } from "../data/codex-management";
import type { ModelRoute, Upstream } from "../domain/types";
export function CodexGatewayPanel({
  management,
  routes,
  upstreams,
  ready,
  loading,
  locked,
  canCreate,
}: {
  management: ReturnType<typeof useCodexManagement>;
  routes: ModelRoute[];
  upstreams: Upstream[];
  ready: boolean;
  loading: boolean;
  locked: boolean;
  canCreate: boolean;
}) {
  return (
    <div className="codex-section">
      <aside className="codex-scope" aria-label="Codex 配置作用范围">
        <strong>作用范围：当前用户</strong>
        <code>
          {management.status?.configPath ||
            "CODEX_HOME/config.toml（尚未读取）"}
        </code>
        <p>
          影响使用此目录的 Codex
          CLI/Desktop；不是系统全局，也不是当前项目配置。已有会话需重启或新建，profile
          和启动参数可能覆盖。
        </p>
      </aside>
      <div className="codex-primary-action">
        <p>
          已选 {management.routeIds.length} 个模型。切换到 CX-RG 网关标签并确认后，将保存模型、默认模型和凭证并启用 Gateway；当前直连会安全保留。
        </p>
        {management.busy === "preview" && (
          <p role="status">正在准备网关配置…</p>
        )}
      </div>
      {management.preferences.message && (
        <p role="status" className="codex-draft-status">
          {management.preferences.message}
        </p>
      )}
      {management.preferences.error && (
        <p role="alert" className="codex-feedback codex-feedback-error">
          {management.preferences.error}
          <Button
            size="small"
            disabled={management.preferences.saving}
            onClick={() => void management.preferences.retry()}
          >
            重试读取草稿
          </Button>
        </p>
      )}
      <CodexModelsPanel
        routes={routes}
        upstreams={upstreams}
        routeIds={management.routeIds}
        defaultRouteId={management.defaultRouteId}
        onModels={management.changeModels}
        onDefault={management.changeDefault}
        locked={locked}
        gatewayReady={ready}
        loading={loading}
      />
      <p className="helper-text">
        推理强度在 Codex 中选择；Gateway 按模型路由的允许区间执行，区间内保留所选值，超出时调整到边界，未传时以 medium 调整到范围内。允许档位最高为 max；Codex 的 Ultra 是界面别名，以实际发出的 max 等值为准。各模型实际支持值请参考官方说明，不支持时会返回上游错误。
      </p>
      {routes.some(route => management.routeIds.includes(route.id) && route.outboundProtocol !== "Res") && <p className="codex-model-notice">
        已选模型包含 Chat / Mes 出站。启用时会在当前用户配置中关闭 web_search，官方托管搜索不可用；本地工具、MCP 和自定义工具保留。返回直连时恢复原搜索设置。独立 --profile 配置和启动参数不会自动修改，需自行同步。
      </p>}
      <CodexGatewayCredentialPanel
        management={management}
        ready={ready}
        locked={locked}
        canCreate={canCreate}
      />
    </div>
  );
}
