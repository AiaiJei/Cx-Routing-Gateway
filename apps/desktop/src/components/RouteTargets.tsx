import type { ModelRoute, Upstream } from "../domain/types";

function hostname(baseUrl: string | undefined) {
  if (!baseUrl) return "地址不可用";
  try {
    const url = new URL(baseUrl);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.hostname : "地址不可用";
  } catch { return "地址不可用"; }
}

export function RouteTargets({ route, upstreams }: { route: ModelRoute; upstreams: Upstream[] }) {
  const multiple = route.targets.length > 1;
  return <div className="route-targets">
    <ol className="route-target-list" aria-label="上游优先级">
      {route.targets.map((target, index) => {
        const upstream = upstreams.find(item => item.id === target.upstreamId);
        const name = upstream?.name ?? "未匹配上游";
        const host = hostname(upstream?.baseUrl);
        return <li key={`${target.upstreamId}:${target.upstreamModel}`} className="route-target-item">
          <span className="route-target-tag">
            {multiple && <span className={`route-target-priority${index === 0 ? " is-preferred" : ""}`}>
              {index === 0 ? "优先" : route.targets.length > 2 ? `备用 ${index}` : "备用"}
            </span>}
            <span className="route-target-name">{name}</span>
          </span>
          <span className="route-target-host" title={host}>{host}</span>
        </li>;
      })}
    </ol>
    {multiple && <p className="route-failover-summary">连续失败 {route.failover?.failureThreshold ?? 3} 次切换 · {(route.failover?.statusClasses ?? [4, 5]).map(value => `${value}xx`).join(" / ")}</p>}
  </div>;
}
