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

## Initial Implementation Checks

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
- Independent task review: NOT_RUN. Earlier delegation attempts returned `route_not_found`; the latest reviewer attempt returned `unsupported_feature` for `Res->Chat`. No independent review verdict was produced. The dedicated Draft PR remains available for independent review.
- Dedicated PR: [#27](https://github.com/AiaiJei/Cx-Routing-Gateway/pull/27), draft, targets `master`; not merged.
- Real Desktop IPC/runtime rendering and Owner acceptance: NOT_RUN. Browser screenshots are fixture-only; no provider calls or user runtime configuration were accessed.
- Integration: task branch only. It is authorized to push and open a Draft PR, but not to merge, release, delete the worktree, or update `master`.

## Owner Visual Follow-up

- Owner clarified the visual priority as “图标占比 > 数值 > 状态”; it means visual prominence, not decoration count.
- Added a 48px Gateway node symbol and 48px upstream-server symbol. The metric row uses 40px purpose icons beside 28px values and quiet 12px captions. Route/credential summaries use 40px icons, 24px counts, then smaller captions and states. Existing navigation SVGs are reused where possible; the Gateway/outcome/duration symbols use the same outline stroke. No tinted icon container or package was introduced.
- Regression test: `npm --prefix apps/desktop test -- src/pages/OverviewPage.test.tsx -t "places large purpose icons"` first failed because the Gateway symbol was absent, then passed after implementation. It asserts icon size, icon/value/caption order, and secondary route/status hierarchy.
- Final visual files are under `visual-icon-hierarchy/`; the report has 0 horizontal overflow and 0 console errors at 1440×900 and 390×844. It also records the same three inspector warnings: small text share, short status-row height difference, and no colored chart series because the fixture has no request in the rolling window.
- Final post-change verification: desktop suite 39 files / 334 tests PASS; production build PASS; four-file taste lint 0 FAIL / 0 WARN; rendered app inspector 0 FAIL / 3 WARN. Real Desktop IPC/runtime rendering and Owner runtime acceptance remain NOT_RUN.
- The final desktop suite was rerun on 2026-11-26 at 22:44 Asia/Shanghai after the count-size CSS correction; all 334 tests and the production build passed. The screenshots and inspector report were regenerated from that build.
- Computed-style verification: `node docs/tasks/evidence/overview-refactor-20261126/verify-icon-hierarchy.mjs C:\Users\20142\.codex\skills\taste-skill\scripts\lib\cdp.mjs` PASS at both widths. `visual-icon-hierarchy/computed-hierarchy.json` records 40px icons / 24px configuration counts / 28px metric values / 12px captions, plus the 48px Gateway icon and 13px Gateway state. Both main scroll containers have zero horizontal overflow; configuration links retain the application's hash routes.
- Manually inspected `desktop-fold.jpg`, `mobile-config.jpg`, and `mobile-metrics.jpg` from the final build. The two additional mobile screenshots scroll the internal `#main-content` container to cover configuration and request metrics below the first fold. The mobile request table retains intentional horizontal scrolling.
- AWG checked the repository identity and allowed paths. Edits, test/build commands, browser inspection, commits and pushes ran through terminal tools; AWG is not a sandbox for those operations.

## Usage and Model Analysis Follow-up

- Date: 2026-11-26; contract revision 5; change baseline `2698250` in the same task worktree and Draft PR #27.
- The first screen now shows usage statistics and per-model call analysis. Four 40px icons lead 28px call/result/reported-Token/duration figures and 12px secondary labels. Input, output, cache-read and cache-write totals use 24px figures with individual reporting coverage.
- The retained-record and rolling-24-hour filters share one selected log population for summary totals, model rows, failures and recent activity. Model calls are ranked descending, with zero-based SVG bars, numeric results, success rate, reported Token coverage and average duration. Five rows are shown initially; the list can expand. The grouping key is the recorded request model identifier, not a claim about a specific upstream target.
- Token totals sum only valid reported `total` fields. Missing totals remain unknown; real zeroes remain zeroes; cache or reasoning counts are never added again. Each field reports its own coverage. Legacy records without a model identifier appear under `未标识模型`; records without valid timestamps are excluded only by the 24-hour filter. The retained-log cap warning covers usage and model analysis.
- Refresh reuses the workspace hook: a pending button prevents duplicates, and a failed refresh retains previous data with an explicit warning. No provider request or new backend endpoint is introduced.
- Red/green evidence: the aggregation suite initially could not resolve the new helper, the page test failed on the missing reported-Token group, and the added legacy-runtime test reproduced an undefined-model crash before its guard was added. All now pass.
- Fresh validation on 2026-11-26 at 23:10 Asia/Shanghai: `npm --prefix apps/desktop test` PASS — 40 files / 345 tests; `npm --prefix apps/desktop run build` PASS. The five-file taste source lint reports 0 FAIL / 0 WARN.
- Browser verification: `verify-usage-analysis.mjs` with the installed taste CDP driver PASS at 1440×900, 768×1024 and 390×844. It verifies 3 calls / 1,854 reported tokens for the unchanged fixture, per-model counts 2 and 1 with 100%/50% bar widths, the 40/28/12 hierarchy, range changes to a truthful empty 24-hour state, refresh restoration, focused horizontal scrolling with sticky model names, and no console errors/exceptions. Raw results: `visual-usage-analysis/interaction-checks.json`.
- Visual inspection includes the desktop first screen, phone first screen, horizontally scrolled phone model table and desktop 24-hour empty state. Main-page horizontal overflow and unloaded fonts are zero at all three widths. The model and request tables deliberately scroll inside their own frames.
- Rendered inspector: 0 FAIL / 4 WARN. The warnings are small secondary text share (61%), inherited unboxed status-row height differences, secondary blocks below the fold, and low data-color share (0.1%). The requested usage/model blocks are visible on the desktop first screen; the model SVG bars are visibly blue while the fixture's 24-hour trend is empty. These are disclosed visual reminders, not represented as a warning-free inspection.
- Source data remains the existing, explicitly labeled browser fixture. Actual Desktop IPC, provider runtime, deployment and Owner acceptance remain NOT_RUN.
- Independent review for this follow-up: NOT_RUN. The separate read-only reviewer (`01a21867-0631-7310-ae56-2785bc70e8fe`) returned `unsupported_feature`, field `input.output`, direction `Res->Chat`, request `2feb852b-e778-47d2-a092-df2c886b6ae8`. No review findings or verdict were produced. The reviewer was closed, and the PR remains Draft.
- Final CSS follow-up makes the phone range control 44px tall. The build, five-file source lint, three-width inspector and interaction checks were rerun after that change. Long model identifiers and maximum-safe-integer-sized token text were also checked via explicitly labeled synthetic DOM layout stress; neither overflowed the main page or value box. That stress data is not persisted in the application, used as usage evidence, or shown in the final screenshots.

## Bounded Model Chart Follow-up

- Contract revision 6; baseline `c7d92a9`. Owner rejected the expandable model table because model count would increase page length. The table and expand-all control have been removed. The comparison plot is 220px high, displays at most five models, and uses previous/next group controls or a model dropdown to reach all models. Only one detail panel is rendered.
- Available metrics: calls, reported Token, success rate and average duration. Values rank descending with unknown values last. All groups share the same zero-based scale for each metric; rates use 0–100%. Missing values have no bar and show a dash; valid zeroes retain a zero-width mark and a numeric zero. The selected model retains exact values, latest call status, timing coverage and Token coverage.
- Tests: the new chart-only regression first failed because the old table still rendered. The final desktop suite at 23:33 Asia/Shanghai on 2026-11-26 passed 41 files / 351 tests; the TypeScript/Vite production build passed. Component tests cover 60-model grouping, direct lookup, metric/rank changes, common scales, unknown/zero values, empty data and selection recovery after model count shrinks.
- Source lint on both model components and overview CSS: 0 FAIL / 0 WARN. Production-build inspection at 1440×900, 768×1024 and 390×844: 0 FAIL / 3 WARN, zero main-page horizontal overflow, no browser exceptions and no unloaded fonts. Remaining reminders are the small secondary text share (56%), inherited status-summary height differences, and auxiliary blocks below the first fold.
- `verify-model-chart.mjs` renders the actual application and a separately labeled React fixture harness with 2, 60 and 200 synthetic models. At each screen width, the entire model section had identical height for every count and after jumping to the last group: 382px at 1440px, 735px at 768px, and 829px at 390px. The plot remained 220px; only five bars were mounted per full group; model tables were absent; group scales matched. No page overflow, axis-label overlap or console errors/exceptions remained. Raw proof: `visual-model-chart/bounded-height-checks.json`.
- Browser QA found and reproduced a 4px overlap between the 1,500 and 2,000 Token tick labels at 390px. Narrow screens now show three labels (start/middle/end); the full three-width/four-metric matrix passed afterward. `axis-overlap-before-390.jpg` is explicitly historical failure evidence; `chart-tokens-390.jpg` shows the corrected result.
- Inspected final application chart screenshots, the narrow Token chart and the 60-model fixture screen. Synthetic fixture screenshots are labeled as test data and are not runtime or user-traffic evidence. `chart-focus-*.jpg` uses the application's existing non-live fixtures. No runtime configuration or provider request was accessed.
- Independent review: NOT_RUN. Reviewer `01a21878-54c3-7293-9e95-2810c6081fb5` failed with `unsupported_feature`, field `input.output`, direction `Res->Chat`, request `78b14062-58f7-49a0-ac16-a30ee1ba7685`; no verdict was produced. The reviewer was closed. Actual Desktop IPC, deployment and Owner acceptance remain NOT_RUN; keep PR #27 Draft.
- AWG checked repository identity/task scope. The terminal performed source edits, tests, builds, browser checks and Git operations; it was not sandboxed by AWG. Current verification uses `verify-model-chart.mjs`; previous scripts remain historical records for prior UI revisions.

## Current-day Aggregate Color Distribution — Contract 7

- Owner clarified that the models must be aggregated together and differentiated by color for the current day. This supersedes contract 6's grouped comparison. Baseline: `96a4410`.
- One ring now contains every model with recorded calls in the selected scope. Every model has its own color, matching legend entry, call count and share; there are no model groups, comparison-metric controls, next/previous buttons or an “other” bucket. The center total reconciles to the shared usage summary. Exact model results, Token coverage and timing coverage remain in one selected-model detail panel.
- The shared default is now the local calendar day `[local midnight, read time)`, with the local date visible in the caption. Rolling 24 hours and retained-record alternatives remain explicit options. The separately labeled 24-hour trend uses the full retained log input so that yesterday's requests still inside its own window are not incorrectly removed by the daily summary filter.
- Six legend rows and the header fit in a fixed 288px region; additional entries scroll inside it. All model segments remain in the ring simultaneously. Color assignments are deterministic for the same model set when call counts reorder, and color collision resolution uses bounded probes. Multiple model colors are explicitly required data encoding, not decorative page accents.
- Red/green: the local-day test first included a yesterday request incorrectly, and the aggregate-chart test initially found only the old comparison UI. Both passed after implementation. The full suite on 2026-11-27 at 00:04 Asia/Shanghai passed 41 files / 353 tests. After the last palette-only adjustment, all six chart-component tests and the production TypeScript/Vite build were rerun and passed.
- Current browser entry point: `verify-model-distribution.mjs`. At 1440×900, 768×1024 and 390×844 it verifies a single chart, every model present, identical rendered segment/legend colors, unique colors for 2/6/60/200 models, shares summing to one, totals matching the usage input, no paging controls, no yesterday-only model in the daily fixture, and direct selection/automatic legend scrolling. No browser exceptions or console errors were recorded.
- The entire model section has constant height across those model counts and last-model selection at each width: 396px at 1440px, 755px at 768px and 812.5px at 390px. Page and main-container horizontal overflow are zero. Raw results: `visual-model-distribution/distribution-checks.json`.
- Source lint: 0 FAIL / 1 WARN. The remaining `numbering` warning is hexadecimal RGB zero-padding (`padStart`), not visible numbered labels. The earlier palette lint failure was corrected before delivery. Production inspection: 0 FAIL / 4 WARN — secondary small-text share (66%), inherited status heights, auxiliary content below the fold, and no chart hue in the truthful current-day empty fixture.
- Application fixtures have historical November 18 timestamps, so the actual browser application's default “today” screen correctly shows zero calls and no colored segments. The populated current-day screenshots come from a separately labeled synthetic request harness, including a deliberately excluded yesterday record. `daily-six-models-panel-1440.jpg` is a native screenshot crop of the same real component, retaining its synthetic-data caption. It is design/test evidence, not user traffic or Desktop runtime proof.
- Final wide/narrow aggregate screenshots and legend matching were inspected. Prior comparison/table verification scripts remain historical revision records; use the current distribution script for the delivered UI.
- Independent review remains NOT_RUN. The latest reviewer invocation earlier in this continuing task failed with `unsupported_feature`, field `input.output`, direction `Res->Chat`; the blocked channel was not repeatedly retried for this clarification. No independent verdict is claimed. Actual Desktop IPC/provider runtime, deployment and Owner acceptance also remain NOT_RUN. Keep the existing PR Draft; no merge or release is authorized.

## Authorized Local Desktop Test Delivery — Contracts 8–9

Owner subsequently authorized a local Desktop test build and one version increment. The verified running Desktop version was 1.1.11, so the test version is 1.1.12. This supersedes the earlier local-release exclusion only; no merge or GitHub Release was authorized.

The isolated test candidate is delivered through `C:\Users\20142\Desktop\Cx-Routing Gateway 1.1.12 测试版.lnk`. The 115,092,377-byte Portable matches SHA-256 `4c8fb9a50a4ae78266f22fd18d35774481edcfc68bcbbc968adabdd7f4160189` and comes from source commit `651185f`. It uses a separate Profile/Codex directory and ports 18418/18419.

Runtime 511/511, Desktop 353/353, production build, 13-file package manifest, source/archive identity, packaged version, Portable health and copied-file integrity checks passed. Actual Electron verification from the copied Desktop startup path confirmed settings version 1.1.12, a live empty-workspace overview and healthy local services. Native screenshots were inspected. Both previous executable hashes and all existing 1.1.11 processes were preserved; verification stopped only its own process tree.

This upgrades **isolated native startup/empty-state IPC** from NOT_RUN to PASS. It does not establish populated native/provider acceptance, independent review or Owner acceptance. The build is unsigned and initial configuration is empty. See `local-test-1.1.12/release-result.md` and its raw reports for exact evidence. PR #27 remains Draft and master application code is unchanged.
