import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { OverviewModelAnalysis } from "../../../../apps/desktop/src/components/OverviewModelAnalysis";
import { buildOverviewAnalytics } from "../../../../apps/desktop/src/domain/overview-analytics";
import "../../../../apps/desktop/node_modules/@fontsource-variable/geist/index.css";
import "../../../../apps/desktop/src/styles/tokens.css";
import "../../../../apps/desktop/src/styles/app.css";
import "../../../../apps/desktop/src/styles/overview.css";

function Fixture() {
  const [count, setCount] = useState(6);
  const now = Date.now();
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const time = new Date(midnight + (now - midnight) / 2).toISOString();
  const names = ["gateway-reasoner", "gateway-fast", "gateway-coder", "gateway-search", "gateway-vision", "gateway-chat"];
  const calls = [42, 26, 16, 10, 4, 2];
  const logs = Array.from({ length: count }, (_, modelIndex) => Array.from({ length: count === 6 ? calls[modelIndex] : 1 }, (_, callIndex) => ({
    id: `fixture-${modelIndex}-${callIndex}`, model: count === 6 ? names[modelIndex] : `gateway-model-${String(modelIndex).padStart(3, "0")}`, time,
    credential: "合成", upstream: "合成", direction: "Res → Chat → Res", status: callIndex % 8 ? "成功" : "失败", durationMs: 100 + modelIndex * 15,
    tokens: callIndex % 8 ? { total: 1600, input: 1200, output: 400 } : undefined,
  }))).flat();
  logs.push({ id: "yesterday", model: "yesterday-only", time: new Date(midnight - 1).toISOString(), credential: "合成", upstream: "合成", direction: "Res → Chat → Res", status: "成功", durationMs: 100 });
  const analytics = buildOverviewAnalytics(logs, "today", now);
  return <main className="page-content" style={{ maxWidth: 1180, margin: "0 auto", padding: 20 }}>
    <h1 className="page-title">当天模型调用分布</h1>
    <p className="fixture-notice">合成数据 · 用于当天统计与多模型布局验证 · 非实时数据</p>
    <label>模型数量 <select aria-label="模型数量" value={count} onChange={(event) => setCount(Number(event.target.value))}>{[2, 6, 60, 200].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <span data-day-total={analytics.summary.calls}>当日调用：{analytics.summary.calls}</span>
    <OverviewModelAnalysis models={analytics.models} periodLabel="今天 · 本地零点起 · 合成数据" />
  </main>;
}

createRoot(document.getElementById("root")).render(<MemoryRouter><Fixture /></MemoryRouter>);
