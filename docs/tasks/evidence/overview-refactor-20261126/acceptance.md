# Overview Refactor Acceptance Evidence

Date: 2026-11-26
Task: `CXRG-OVERVIEW-REFACTOR-20261126`
Branch: `codex/overview-dashboard-20261126`
Base: `606d069e7b53efa492c86e32856d334d313fbaeb`

## Implementation

- The overview shows Gateway startup state and endpoint, recent upstream-check results, enabled route and credential status, retained request totals, result counts, average duration, failed calls, and the latest three request records.
- A pure helper groups valid retained request timestamps into 24 local-hour buckets for `[now - 24h, now)`. It ignores malformed/out-of-window times and warns when the returned record count reaches a valid retention limit.
- The SVG chart includes a zero-based count scale, local-time labels, an accessible image name, visible markers for non-empty buckets (including a single observation), explicit empty states, and a retained-log coverage warning.
- Data-source copy remains explicit: fixture mode is not live; upstream status describes the last recorded check, not a continuous health probe.
- No backend endpoint, chart dependency, shared application-shell change, or network probe was added.

## Automated Checks

| Command | Result |
|---|---|
| `npm --prefix apps/desktop test` | PASS: 39 test files, 333 tests. |
| `npm --prefix apps/desktop run build` | PASS: TypeScript and Vite production build. |
| `node C:\Users\20142\.codex\skills\taste-skill\scripts\lint.mjs --app apps/desktop/src/pages/OverviewPage.tsx apps/desktop/src/components/OverviewUsageChart.tsx apps/desktop/src/styles/overview.css` | PASS: no banned patterns. |
| `git diff --check` | PASS before final commit. |

Task 1 mapping and Task 2 aggregation tests followed red-green cycles. The 24-hour aggregator covers inclusive start/exclusive end, invalid timestamps, out-of-window records, zero data, the retention cap, and invalid reference time. The chart and page tests cover real bucket counts, a single visible observation, empty/invalid data, retention warnings, fixture/runtime wording, loading, errors, statuses, and links.

## Rendered UI

- Screenshot set and raw inspector output: `visual/desktop-fold.jpg`, `visual/desktop-page-01.jpg`, `visual/mobile-fold.jpg`, `visual/mobile-page-01.jpg`, `visual/report.json`.
- Inspector command: `node C:\Users\20142\.codex\skills\taste-skill\scripts\inspect.mjs apps/desktop/dist/index.html --app --out docs/tasks/evidence/overview-refactor-20261126/visual --widths 1440,390 --json`.
- Desktop viewport: 1440×900; mobile viewport: 390×844. Both have zero horizontal page overflow, no browser console errors, and all requested fonts loaded. The mobile request table is intentionally horizontally scrollable.
- The actual screenshots use the browser fixture client, as indicated by the visible `示例数据 · 非实时` notice. The fixture timestamps fall outside the rolling 24-hour window, so the chart correctly shows an empty state; the populated line and one-point mark are covered by component tests, not presented as live runtime evidence.
- The inspector reports three warnings: half of all app-shell text is under 13px; one unboxed status-summary row has content-height differences; and fixture mode has no colored chart data because the chart is empty. Labels remain within the design guide's 11–12px range, the grouped status summaries avoid stretched blank cards, and the chart's series/markers use the existing blue accent when records are present. These warnings are recorded rather than represented as a clean visual pass.

## Review and Acceptance Boundaries

- Implementation result: PASS for the code and checks above.
- Independent task review: NOT_RUN. Two reviewer-agent startup attempts failed because the local model endpoint returned `route_not_found`. The dedicated Draft PR is exposed for an independent reviewer; this is not a review PASS.
- Dedicated PR: [#27](https://github.com/AiaiJei/Cx-Routing-Gateway/pull/27), draft, targets `master`; not merged.
- Real Desktop IPC/runtime rendering and Owner acceptance: NOT_RUN. Browser screenshots are fixture-only; no provider calls or user runtime configuration were accessed.
- Integration: task branch only. It is authorized to push and open a Draft PR, but not to merge, release, delete the worktree, or update `master`.

## Owner Visual Follow-up

- Owner clarified the visual priority as “图标占比 > 数值 > 状态”; it means visual prominence, not decoration count.
- Added a 48px Gateway node symbol and 48px upstream-server symbol. The metric row uses 40px purpose icons beside 28px values and quiet 12px captions. Route/credential summaries use 40px icons, 22px counts, then smaller captions and states. Existing navigation SVGs are reused where possible; the Gateway/outcome/duration symbols use the same outline stroke. No tinted icon container or package was introduced.
- Regression test: `npm --prefix apps/desktop test -- src/pages/OverviewPage.test.tsx -t "places large purpose icons"` first failed because the Gateway symbol was absent, then passed after implementation. It asserts icon size, icon/value/caption order, and secondary route/status hierarchy.
- Final visual files are under `visual-icon-hierarchy/`; the report has 0 horizontal overflow and 0 console errors at 1440×900 and 390×844. It also records the same three inspector warnings: small text share, short status-row height difference, and no colored chart series because the fixture has no request in the rolling window.
- Final post-change verification: desktop suite 39 files / 334 tests PASS; production build PASS; four-file taste lint PASS; app inspector reports 0 FAIL / 0 WARN aggregate. Real Desktop IPC/runtime rendering and Owner runtime acceptance remain NOT_RUN.
