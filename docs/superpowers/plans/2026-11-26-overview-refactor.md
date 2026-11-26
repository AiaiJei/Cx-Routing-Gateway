# 总览重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Gateway 总览，使运行状态、保留请求趋势、失败入口和最近活动清楚可用。

**Architecture:** 在 `workspace-client` 将有效日志保留上限以数字传给界面；在独立 domain 函数中把有时间戳的请求映射为 24 小时趋势；由独立 SVG 图表组件呈现；`OverviewPage` 继续负责调用现有 `useWorkspace` 并组装状态、指标、失败入口与最近请求。保留现有应用壳层、字体和颜色，不新增 API 或图表依赖。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、Testing Library、CSS、内联 SVG。

**Spec:** `docs/superpowers/specs/2026-11-26-overview-refactor-design.md`

## Global Constraints

- 24 小时图表只统计当前返回的 timestamped usage 日志；达到保留上限时提示记录可能不完整。
- 不把上游的最近检查状态描述为持续在线，不主动发起健康探测。
- 实时数据、示例数据、加载、错误和空状态必须明确区分。
- 不改共享壳层，不增加后端时序接口或图表依赖。
- 图表采用可访问 SVG、单一数据色、可读刻度；不以颜色作为唯一状态标识。
- 大屏验证 1440×900，窄屏验证 390px；保留键盘焦点与日志表横向滚动。
- 仅提交到 `codex/overview-dashboard-20261126`；允许推送和开 PR，不允许合并、发布或删除工作树。

---

### Task 1: 映射运行时日志保留上限

**Files:**
- Modify: `apps/desktop/src/domain/types.ts`
- Modify: `apps/desktop/src/data/workspace-client.ts`
- Test: `apps/desktop/src/data/workspace-client.test.ts`

**Interfaces:**
- Consumes: runtime `state.settings.usageRetentionCount`。
- Produces: optional `WorkspaceFixtures.usageRetentionCount?: number`，仅接受正的安全整数；缺失或无效值保持 `undefined`。

- [ ] **Step 1: Write the failing mapping test**

在 `workspace-client.test.ts` 添加：

```ts
it("maps a valid usage retention limit and ignores invalid limits", () => {
  const base = { gatewayHost: "127.0.0.1", gatewayPort: 4318 };
  const valid = mapRuntimeState({ settings: { ...base, usageRetentionCount: 250 }, upstreams: [], routes: [], usage: [], clientKeys: [] });
  const invalid = mapRuntimeState({ settings: { ...base, usageRetentionCount: 0 }, upstreams: [], routes: [], usage: [], clientKeys: [] });

  expect(valid.usageRetentionCount).toBe(250);
  expect(invalid.usageRetentionCount).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm --prefix apps/desktop test -- src/data/workspace-client.test.ts -t "maps a valid usage retention limit"`

Expected: FAIL because `mapRuntimeState` does not currently expose `usageRetentionCount`.

- [ ] **Step 3: Add the optional workspace field and validated mapping**

在 `WorkspaceFixtures` 增加可选数值字段，并在 `mapRuntimeState` 返回对象中加入：

```ts
const retentionCount = state.settings?.usageRetentionCount;
const usageRetentionCount = Number.isSafeInteger(retentionCount) && retentionCount > 0 ? retentionCount : undefined;
```

仅在 `usageRetentionCount !== undefined` 时加入返回对象，避免把无效配置伪装成有效上限。

- [ ] **Step 4: Rerun the adapter test and verify the pass**

Run: `npm --prefix apps/desktop test -- src/data/workspace-client.test.ts -t "maps a valid usage retention limit"`

Expected: PASS for valid and invalid values.

- [ ] **Step 5: Commit the adapter contract**

```bash
git add apps/desktop/src/domain/types.ts apps/desktop/src/data/workspace-client.ts apps/desktop/src/data/workspace-client.test.ts
git commit -m "feat: expose usage retention limit to overview"
```

### Task 2: Aggregate request records into 24 hourly buckets

**Files:**
- Create: `apps/desktop/src/domain/overview-usage.ts`
- Test: `apps/desktop/src/domain/overview-usage.test.ts`

**Interfaces:**
- Consumes: `Pick<CallLog, "time">[]`, an injected finite `nowMs`, and an optional retention limit.
- Produces: `buildOverviewUsageTrend(logs, nowMs, retentionLimit)` returning `windowStart`, `windowEnd`, 24 `{ startsAt, count }` buckets, `observedCount`, and `retentionReached`.
- The interval is `[nowMs - 24 hours, nowMs)`; the left edge is included and the right edge excluded. Invalid timestamps are ignored. `retentionReached` is true only for a positive safe-integer limit reached by the returned log count.

- [ ] **Step 1: Add tests for the window, boundaries, and retention warning**

```ts
it("counts records in 24 hourly buckets and excludes records at the right edge", () => {
  const nowMs = Date.parse("2026-11-26T12:00:00.000Z");
  const trend = buildOverviewUsageTrend([
    { time: new Date(nowMs - 24 * 60 * 60 * 1000).toISOString() },
    { time: new Date(nowMs - 60 * 60 * 1000).toISOString() },
    { time: new Date(nowMs).toISOString() },
    { time: "invalid" },
  ], nowMs, 4);

  expect(trend.buckets).toHaveLength(24);
  expect(trend.buckets[0].count).toBe(1);
  expect(trend.buckets[23].count).toBe(1);
  expect(trend.observedCount).toBe(2);
  expect(trend.retentionReached).toBe(true);
});
```

另加无日志返回 24 个零桶、窗外记录不计入、无效 `nowMs` 抛 `RangeError`、低于保留上限不提示四个测试。

- [ ] **Step 2: Run the new domain test and confirm it fails**

测试先写完后，添加只用于取得可执行 RED 的导出骨架：声明 `OverviewUsageTrend` 和函数签名，返回空的 `buckets` 与 `observedCount: 0`，不实现统计逻辑。

Run: `npm --prefix apps/desktop test -- src/domain/overview-usage.test.ts`

Expected: FAIL on `buckets` length (`Expected length: 24`, `Received length: 0`), not on module resolution.

- [ ] **Step 3: Implement the pure aggregation function**

```ts
const hourMs = 60 * 60 * 1000;
const windowStart = nowMs - 24 * hourMs;
const buckets = Array.from({ length: 24 }, (_, index) => ({ startsAt: windowStart + index * hourMs, count: 0 }));
```

验证 `nowMs` 为有限数字；逐条 `Date.parse(log.time)`，仅统计落在窗口内的时间戳；桶索引为 `Math.floor((timestamp - windowStart) / hourMs)`。不修改输入日志，也不依赖当前系统时间。

- [ ] **Step 4: Rerun the domain tests and verify the pass**

Run: `npm --prefix apps/desktop test -- src/domain/overview-usage.test.ts`

Expected: PASS for all boundary, invalid-input, zero-data, and retention cases.

- [ ] **Step 5: Commit the aggregation helper**

```bash
git add apps/desktop/src/domain/overview-usage.ts apps/desktop/src/domain/overview-usage.test.ts
git commit -m "feat: aggregate retained request usage for overview"
```

### Task 3: Render the accessible request trend chart

**Files:**
- Create: `apps/desktop/src/components/OverviewUsageChart.tsx`
- Create: `apps/desktop/src/components/OverviewUsageChart.test.tsx`
- Create: `apps/desktop/src/styles/overview.css`

**Interfaces:**
- Props: `{ logs: Pick<CallLog, "time">[]; nowMs: number; retentionLimit?: number }`，组件只依赖趋势所需的时间戳字段。
- Consumes: `buildOverviewUsageTrend` from Task 2。
- Produces: a labeled SVG with one request-count series, three y-axis ticks including zero, six or fewer chronological x-axis labels, an empty state when no valid in-window records exist, and a visible retention warning when the limit is reached.

- [ ] **Step 1: Write chart tests for records, empty data, and retention**

Add tests that render the chart with fixed `nowMs`, assert an accessible image name, verify the displayed count for a populated bucket, verify the empty-state message for zero records, and verify the retention-limit warning when `logs.length === retentionLimit`.

- [ ] **Step 2: Run the chart test and confirm it fails**

测试先写完后，添加导出骨架 `OverviewUsageChart`，返回带预期无障碍名称的空 SVG，不绘制数值也不显示覆盖提示，使组件测试可执行并因缺少数据呈现而失败。

Run: `npm --prefix apps/desktop test -- src/components/OverviewUsageChart.test.tsx`

Expected: FAIL on the populated bucket count or retention-warning assertion, not on module resolution.

- [ ] **Step 3: Implement the responsive SVG chart**

Use a stable `viewBox`, compute a zero-based y-scale from bucket counts, draw faint horizontal gridlines and a single `var(--accent)` polyline, and format x-axis labels with `zh-CN` hour/minute text. Set `role="img"` and an accessible name; include a textual empty state and coverage warning outside the SVG. Do not draw a line for empty data or add a chart package.

- [ ] **Step 4: Add chart-specific CSS and import it from the chart component**

Use `overview.css` for the chart’s responsive container, SVG labels, line, gridlines, and retention note. At narrow widths keep the SVG inside its container and preserve readable tick labels.

- [ ] **Step 5: Rerun chart tests and commit the chart**

Run: `npm --prefix apps/desktop test -- src/components/OverviewUsageChart.test.tsx`

Expected: PASS for accessibility name, real bucket values, empty state, and cap warning.

```bash
git add apps/desktop/src/components/OverviewUsageChart.tsx apps/desktop/src/components/OverviewUsageChart.test.tsx apps/desktop/src/styles/overview.css
git commit -m "feat: add accessible overview usage chart"
```

### Task 4: Assemble statuses, metrics, and recent activity

**Files:**
- Modify: `apps/desktop/src/pages/OverviewPage.tsx`
- Test: `apps/desktop/src/pages/OverviewPage.test.tsx`
- Modify: `apps/desktop/src/styles/app.css`
- Modify: `apps/desktop/src/styles/overview.css`

**Interfaces:**
- `OverviewPage` continues to consume `useWorkspace()` and reuse `WorkspaceState`, `PageHeader`, `FixtureNotice`, `EmptyResult`, `ProtocolFlow`, and existing navigation links.
- The summary shows retained request count, completed and not-successful counts, and average duration with zero/dash handling. Live runtime uses `metrics.rejected + metrics.failed` as not-successful; fixture fallback derives the same distinction available in its log statuses.
- Statuses distinguish Gateway runtime, recently checked upstreams, enabled routes, and active/revoked credentials. Upstream text must say the result is from the most recent check, not continuous health.

- [ ] **Step 1: Update page tests for the approved content order and labels**

Assert the fixture banner, Gateway state, four status summaries, retained request metrics, chart heading, failure link, and recent log table. Add a fixture with no logs to verify chart and recent-activity empty states. Keep existing route-link assertions.

- [ ] **Step 2: Run the page test and confirm expected failures**

Run: `npm --prefix apps/desktop test -- src/pages/OverviewPage.test.tsx`

Expected: FAIL on the new chart and status headings before the page is changed.

- [ ] **Step 3: Integrate data and preserve loading/error behavior**

Compute success and not-successful totals without treating rejected requests as successful; use runtime metrics when present and fixture logs otherwise. Pass `logs`, `Date.now()`, and `data.usageRetentionCount` to `OverviewUsageChart`. Keep `WorkspaceState` for loading/error and `FixtureNotice` for source truth.

- [ ] **Step 4: Refactor page-specific CSS and retain shared styles**

Move only Overview-specific selectors from `app.css` into `overview.css`; leave `.page-header`, `.section-heading`, `.status-badge`, `.table-scroll`, and other cross-page rules shared. Use a two-thirds/one-third activity layout above the recent table, then stack it at `max-width: 760px`.

- [ ] **Step 5: Rerun the page test and commit the page integration**

Run: `npm --prefix apps/desktop test -- src/pages/OverviewPage.test.tsx`

Expected: PASS for fixture/runtime copy, truthful statuses, metrics, chart, failure navigation, and no-data states.

```bash
git add apps/desktop/src/pages/OverviewPage.tsx apps/desktop/src/pages/OverviewPage.test.tsx apps/desktop/src/styles/app.css apps/desktop/src/styles/overview.css
git commit -m "feat: refactor gateway overview"
```

### Task 5: Verify rendering, tests, and build

**Files:**
- Evidence: `docs/tasks/evidence/overview-refactor-20261126/`
- Modify: `docs/tasks/2026-11-26-overview-refactor.md`

- [ ] **Step 1: Run the focused desktop tests**

Run: `npm --prefix apps/desktop test -- src/data/workspace-client.test.ts src/domain/overview-usage.test.ts src/components/OverviewUsageChart.test.tsx src/pages/OverviewPage.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run all desktop tests and the production build**

Run: `npm --prefix apps/desktop test`

Expected: PASS with the full desktop UI suite.

Run: `npm --prefix apps/desktop run build`

Expected: TypeScript and Vite production build complete without errors.

- [ ] **Step 3: Inspect rendered app screens at wide and narrow widths**

Run the desktop Vite development server at `http://127.0.0.1:4173`, capture the Overview at 1440×900 and 390×844, and run the taste-skill app lint/inspector on the page and changed source. Verify the status labels, true fixture notice, chart scale and labels, retention warning, keyboard focus, table overflow, and reduced-motion behavior. Save screenshots and checks under `docs/tasks/evidence/overview-refactor-20261126/`.

- [ ] **Step 4: Review the diff and task boundary**

Run `git diff --check`, inspect `git diff --stat`, and confirm only contract-scoped paths changed. Perform the available independent review before pushing; record any unavailable review separately as `NOT_RUN`.

- [ ] **Step 5: Commit evidence, push, and open the dedicated PR**

Commit only scoped evidence and acceptance documentation, push `codex/overview-dashboard-20261126`, and create a PR targeting `master`. Do not merge or release.

**Execution mode:** Implement inline in the authorized worktree. The initial implementer-agent startup failed before touching files with a local model-route 404; the worktree was checked clean afterward. Attempt an independent final review separately if the reviewer role is available.

**Ruling:** Task 1 (runtime retention mapping) and Task 2 (pure time-bucket aggregation) use separate files and no shared edits, but the available implementer route failed before work began. The integrator owns both tasks sequentially; this costs parallel speed but avoids waiting on an unavailable model route. Tasks 3 and 4 still wait for their stated dependencies and remain review checkpoints.
