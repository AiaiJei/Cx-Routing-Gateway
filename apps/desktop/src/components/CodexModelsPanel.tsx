import { useState } from "react";
import { Button } from "./Button";
import { CustomSelect } from "./CustomSelect";
import { SearchField } from "./PageHeader";
import { isCodexRouteAvailable } from "../data/codex-management";
import { reasoningRangeLabel } from "../domain/route-selection";

import type { ModelCapabilities, ModelRoute, Upstream } from "../domain/types";

function capabilitySummary(capabilities?: ModelCapabilities): string {
  return [
    capabilities?.contextWindow === undefined ? "上下文未知" : `上下文 ${capabilities.contextWindow}`,
    capabilities?.maxOutputTokens === undefined ? "最大输出未知" : `最大输出 ${capabilities.maxOutputTokens}`,
    capabilities?.inputModalities ? capabilities.inputModalities.includes("image") ? "文本和图片" : "仅文本" : "默认（文本和图片）",
    capabilities?.tools === undefined ? "工具按上游处理" : capabilities.tools ? "工具支持" : "工具不支持",
    capabilities?.reasoningEfforts === undefined ? "支持强度未知" : capabilities.reasoningEfforts.length ? `支持强度 ${capabilities.reasoningEfforts.join("、")}` : "不接受推理参数",
  ].join(" · ");
}

export function CodexModelsPanel({
  routes,
  upstreams,
  routeIds,
  defaultRouteId,
  onModels,
  onDefault,
  locked,
  gatewayReady,
  loading,
}: {
  routes: ModelRoute[];
  upstreams: Upstream[];
  routeIds: string[];
  defaultRouteId: string;
  onModels: (ids: string[]) => void;
  onDefault: (id: string) => void;
  locked: boolean;
  gatewayReady: boolean;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const names = new Map(
    upstreams.map((upstream) => [upstream.id, upstream.name]),
  );
  const label = (route: ModelRoute) =>
    [
      ...new Set(
        route.targets.map(
          (target) => names.get(target.upstreamId) || "上游不可用",
        ),
      ),
    ].join("、");
  const eligible = routes.filter(isCodexRouteAvailable);
  const matching = eligible.filter((route) =>
    (route.alias + " " + label(route))
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const selected = routeIds.flatMap((id) => {
    const route = routes.find((item) => item.id === id);
    return route ? [route] : [];
  });
  const unavailable = routeIds.filter(
    (id) => !eligible.some((route) => route.id === id),
  );
  return (
    <div className="codex-section">
      <div className="codex-section-heading">
        <div>
          <h2>可供 Codex 使用的模型</h2>
          <p className="helper-text">
            已选模型将出现在 Codex 模型选择器中，默认模型用于新会话。最多选择
            100 个。路由区间和能力保存后由 Gateway 立即执行；修改后请重新保存并启用网关，再完整退出并重启 Codex。此处显示网关路由配置，是否已写入 Codex 请看上方模型目录状态。新目录默认文本和图片，显式仅文本会保留；工具按上游处理表示继续转发请求，不代表已确认支持。上下文与图片、推理能力写入目录；最大输出由 Gateway 限制。
          </p>
        </div>
        <span className="codex-count">已选 {routeIds.length} 个</span>
      </div>
      {loading ? (
        <p role="status">正在读取 Gateway 模型…</p>
      ) : !gatewayReady ? (
        <p className="codex-model-notice">
          Gateway 工作区当前不可用，模型选择暂不能应用；可切换 Codex 直连。
        </p>
      ) : null}
      <div className="codex-model-toolbar">
        <SearchField
          label="搜索模型或上游"
          value={search}
          onChange={setSearch}
        />
        <div className="codex-inline-actions">
          <Button
            size="small"
            disabled={locked || !gatewayReady || !matching.length}
            onClick={() =>
              onModels([
                ...new Set([...routeIds, ...matching.map((route) => route.id)]),
              ])
            }
          >
            全选搜索结果
          </Button>
          <Button
            size="small"
            disabled={locked || !routeIds.length}
            onClick={() => onModels([])}
          >
            清空选择
          </Button>
        </div>
      </div>
      <fieldset
        className="codex-model-options"
        disabled={locked || !gatewayReady}
      >
        <legend className="sr-only">Gateway 模型列表</legend>
        {matching.map((route) => (
          <label key={route.id} className="codex-model-row">
            <input
              type="checkbox"
              aria-label={"选择 " + route.alias}
              checked={routeIds.includes(route.id)}
              disabled={!routeIds.includes(route.id) && routeIds.length >= 100}
              onChange={(event) =>
                onModels(
                  event.target.checked
                    ? [...routeIds, route.id]
                    : routeIds.filter((id) => id !== route.id),
                )
              }
            />
            <span>
              <strong>{route.alias}</strong>
              <small>{label(route)} · 推理：{reasoningRangeLabel(route.reasoning)}</small>
              <small>{capabilitySummary(route.capabilities)}</small>
            </span>
            <span className="codex-model-protocol">
              Res → {route.outboundProtocol} → Res
            </span>
          </label>
        ))}
      </fieldset>
      {!matching.length && !loading && gatewayReady && (
        <p className="helper-text">
          {eligible.length
            ? "没有匹配的模型。"
            : "还没有可用的 Responses 路由，请先在模型路由页面添加。"}
        </p>
      )}
      {unavailable.length > 0 && (
        <div className="codex-model-notice">
          <p>
            已选模型中有 {unavailable.length} 个已删除、停用或不支持
            Responses，或明确不支持工具，请移除后重新选择。Codex 需要本地工具调用能力。
          </p>
          {unavailable.map((id) => (
            <div className="codex-unavailable-model" key={id}>
              <span>
                {routes.find((route) => route.id === id)?.alias || id}
              </span>
              <Button
                size="small"
                disabled={locked}
                onClick={() => onModels(routeIds.filter((item) => item !== id))}
              >
                移除
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="codex-default">
        <div className="geist-field">
          <span className="geist-field-label">默认模型</span>
          <fieldset disabled={locked}>
            <CustomSelect
              ariaLabel="默认模型"
              value={defaultRouteId}
              onChange={onDefault}
              options={selected
                .filter(isCodexRouteAvailable)
                .map((route) => ({ value: route.id, label: route.alias }))}
              placeholder="先选择模型"
            />
          </fieldset>
        </div>
        {!routeIds.length && (
          <p className="codex-validation">请至少选择一个模型。</p>
        )}
      </div>
    </div>
  );
}
