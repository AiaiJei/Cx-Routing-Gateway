import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { OverviewModelAnalysis } from "../../../../apps/desktop/src/components/OverviewModelAnalysis";
import "../../../../apps/desktop/node_modules/@fontsource-variable/geist/index.css";
import "../../../../apps/desktop/src/styles/tokens.css";
import "../../../../apps/desktop/src/styles/app.css";
import "../../../../apps/desktop/src/styles/overview.css";

function Fixture() {
  const [count, setCount] = useState(60);
  const models = Array.from({ length: count }, (_, index) => {
    const calls = 200 - index;
    const failed = index % 3;
    const empty = { value: null, reported: 0 };
    return { model: index === count - 1 ? `gateway-model-${String(index).padStart(3, "0")}-long-identifier-for-layout-validation` : `gateway-model-${String(index).padStart(3, "0")}`,
      calls, succeeded: Math.max(0, calls - failed), failed: Math.min(calls, failed), successRate: Math.max(0, calls - failed) / calls * 100,
      averageDurationMs: 100 + index * 15, durationReported: calls, latestStatus: failed > 0 ? "失败" : "成功",
      tokens: { total: { value: index % 7 ? (index + 1) * 1500 : null, reported: index % 7 ? calls : 0 }, input: empty, output: empty, cacheRead: empty, cacheWrite: empty } };
  });
  return <main className="page-content" style={{ maxWidth: 1180, margin: "0 auto", padding: 20 }}>
    <h1 className="page-title">模型图表布局验证</h1>
    <p className="fixture-notice">合成数据 · 仅用于模型数量压力测试 · 非运行时数据</p>
    <label>模型数量 <select aria-label="模型数量" value={count} onChange={(event) => setCount(Number(event.target.value))}><option value={2}>2</option><option value={60}>60</option><option value={200}>200</option></select></label>
    <OverviewModelAnalysis models={models} />
  </main>;
}

createRoot(document.getElementById("root")).render(<MemoryRouter><Fixture /></MemoryRouter>);
