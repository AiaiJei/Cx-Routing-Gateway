# Revision6 路由编辑界面证据

日期：2026-11-26。项目 `cx-routing-gateway`，仓库 `aiaijei-cx-routing-gateway`，任务 `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`，合同 revision6。

当前最终口径：实际转发档位共七档 `none/minimal/low/medium/high/xhigh/max`，最高 max。后文较早的八档和 ultra 测试记录仅保留作为实施历史，已被文末“七档收口”修订替代。

工作树：`C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125`。UI 包实现和聚焦验证已冻结；未提交、推送或合并。未读取实际 Codex 配置、密钥、实际 provider，也未启动或停止用户程序。

## 交付行为

- `RouteEditor.tsx` 从页面拆出编辑职责，复用现有 `Modal`、`ModelSelect`、`CustomSelect` 和界面 tokens；未修改通用 Modal。
- 上游横向排列、按内容换行；一个统一模型多选按精确 modelId 合并。已选模型自动对应已选上游中实际提供该模型的服务，按可调整的上游优先级提交。
- 取消上游时移除不再有任何目标的模型并给出反馈；每次保存均发送 `replaceTargets:true` 和完整可见目标，避免后端兼容合并带回隐藏目标。未提供该模型的上游不会被添加目标。
- 原有未在发现列表中的 target 按原 upstream/model 配对保留并明确显示；不会分配给其它上游。编辑回填原有区间、优先级、故障切换；调用名和停用状态交由 editId 保留并在编辑中提示，预览保存路径也保留。
- 每个模型独立选择不限或 min/max 区间；保存为逐模型 `modelReasoning`，不限明确发送 `clear:true`。选择项为 none/minimal/low/medium/high/xhigh/max/ultra；persistent 不参与排序。反向区间在发请求前拒绝。
- 统一协议 fieldset 包含入站/出站，并按宽度两列或堆叠。保存中立即反馈、防重复提交、锁定取消和关闭；失败保留模型及区间。既有键盘和焦点能力复用并回归。
- Codex 模型列表显示每条路由的区间；说明路由保存立即约束 runtime，Codex 列表需重新保存启用后在新会话使用。跨协议启用预览/帮助说明官方托管搜索不可用、本地工具/MCP/自定义工具保留、返回直连恢复。独立 `--profile` 配置和启动覆盖不自动修改。

## 测试与结果

采用先失败再实现：旧页面的 per-upstream 模型预期先改为统一选择；当时 RoutesPage/client 共 7 个预期失败（缺统一选择和 route reasoning 映射）。随后增加同名合并、每模型区间、上游取消、重开编辑、失败保留及保存锁定测试，旧实现缺相应控件而失败，再实施。

最终命令在 `apps/desktop` 执行：

```text
npm test -- src/pages/RoutesPage.test.tsx src/data/workspace-client.test.ts src/domain/route-selection.test.ts src/components/CodexRoutingHelp.test.tsx src/components/ModelSelect.test.tsx src/components/CustomSelect.test.tsx src/pages/CodexPage.test.tsx src/pages/CodexPage.memory.test.tsx --reporter=dot
```

结果：**PASS，8 files / 107 tests**。日志 `.tmp/codex-routing-range-20261126/ui-focused.log`。包含统一模型合并、精确 target 对应、显式 clear、独立区间保存、64 种 min/max 排序与共享 runtime 常量一致性、历史无策略不杜撰策略、mapping 独立复制、保存失败保留、防重入、保存中关闭拦截、键盘选择/Escape/焦点归还，以及原 Codex 页回归。

`npx tsc -b --pretty false`：**PASS**。

UI 自有已跟踪文件 `git diff --check -- ...`：**PASS**。所有操作由终端和文件工具执行，未通过 AWG MCP 校验，不表示操作系统沙箱保护。

## 验收边界

- 实现/聚焦静态与组件验证：PASS。
- 实际宽窄视口、长内容、触达保存按钮及 Electron 编辑保存/重新读取：本 UI 包 NOT_RUN，由协调者统一执行并另附证据。
- 独立审查、完整 Runtime/Desktop suite、生产构建、打包和 Desktop 交付：协调者负责，不能由上述聚焦测试推定通过。
- 实际 provider/真实账号和 Owner 接受：NOT_RUN。

回退：仅回退本包 UI/类型/client mapping 修改即可；保留已有 revision2–5 材料和桌面程序，不触碰用户实际数据。

## 独立审查 P2 补修：跨入站协议的区间草稿

审查指出：新增时先选共享模型（Res 已存 low/high），随后切到 Chat（已存 xhigh/ultra），旧 renderer 仅按 modelId 缓存而继续提交 Res 的区间，可能覆盖 Chat 路由策略。已先增加 4 个组件用例，旧实现全部失败；日志 `.tmp/codex-routing-range-20261126/ui-protocol-red.log`，首例实际为期望 xhigh、收到 low。

`RouteEditor` 现按 `inboundProtocol + modelId` 保存草稿。首次进入某协议时读取该调用名在该协议的已存策略；该协议内的手动修改和明确“不限”有独立草稿，往返切换不会互相覆盖或重新加载抹掉修改。编辑原模型保留自定义调用名的原策略；移到不存在对应调用名的新协议时以原路由区间为初始值，避免意外清空。界面帮助明确区间按入站协议分别显示。

新增 `RouteEditor.protocol.test.tsx` 共 5 例：新增后切协议的实际提交；双向往返保留手动区间；明确不限按协议独立；编辑自定义调用名/停用路由并移到新协议；编辑时读取另一协议已存区间并返回原草稿。

补修后原 8 个文件加该组件测试：**PASS，9 files / 112 tests**。日志 `.tmp/codex-routing-range-20261126/ui-focused-review-fixed.log`。`npx tsc -b --pretty false` 和补修文件 `git diff --check` 均 PASS。仅修改 `RouteEditor.tsx`、新增协议回归测试、追加本证据；未改后端或实际配置。源码重新冻结，独立复查和实际界面验证由协调者继续。

## 关联 P2 补修：停用同名历史路由不参与新增策略查找

新增红测构造合法配置：同 alias+protocol 的停用历史路由 none/minimal 排在启用路由 xhigh/ultra 前。旧查找未筛 enabled，切到目标协议读取了 none；日志 `.tmp/codex-routing-range-20261126/ui-enabled-route-red.log` 明确记录期望 xhigh、收到 none。

修复仅在策略查找加入 `item.enabled`，与后端 batch 的目标查找保持一致。正在编辑路由的初始策略仍从自身载入，包括停用路由；补充测试确认停用原路由 none/minimal 不会被同调用名启用路由覆盖，切协议再返回也保留。

结果：`RouteEditor.protocol.test.tsx` 7 例 + `RoutesPage.test.tsx` 20 例，**27/27 PASS**；日志 `.tmp/codex-routing-range-20261126/ui-enabled-route-green.log`。TypeScript 与改动文件 diff 检查 PASS。仅一行 lookup、更改组件测试和追加证据，源码再次冻结；未变更其它职责包。

## 七档收口：Ultra 仅为 Codex 界面别名

依据协调者新增的官方资料和实际 Codex0.167 取证，Ultra 是 Codex 界面别名，普通 HTTP 按模型/客户端映射为 max、xhigh 或 medium，不作为独立转发强度。本次 UI 类型、helper、选择项及默认范围统一为 `none/minimal/low/medium/high/xhigh/max`；启用区间默认为 none→max。未增加任何映射，Gateway 不把 max 升为 ultra。

先更新回归期望，产生 4 个预期失败：旧常量仍含 ultra、共享 runtime 已收口但 UI 尚未同步、旧下拉有八档、区间默认仍为 ultra；日志 `.tmp/codex-routing-range-20261126/ui-seven-efforts-red.log`。随后修改 renderer 实现。帮助区与 Codex Gateway 帮助明确 Ultra 为界面别名，应按实际发出的 max 等值判断；模型支持情况仍参考官方说明。

所有正向 fixture 上限已改 max；保留专用反例断言 ultra 无效。新增回归确认新启用区间最低 none、最高 max，下拉末项 max 且不含 ultra。共享 renderer/runtime parity 覆盖现在的 49 种 min/max 组合。

最终聚焦结果：**PASS，9 files / 115 tests**；日志 `.tmp/codex-routing-range-20261126/ui-seven-efforts-green.log`。`npx tsc -b --pretty false` 与 UI 修改文件 `git diff --check` PASS。源码冻结；实际 Electron/打包、真实 provider 和 Owner 接受状态仍由协调者分别判定，不由组件测试推定。
