# Revision7 renderer evidence

项目：cx-routing-gateway / aiaijei-cx-routing-gateway。任务：CXRG-CODEX-ROUTE-MANAGEMENT-20261125，合同 revision7，active。工作树：`.tmp/worktrees/codex-route-management-20261125`；分支：`codex/codex-route-management-20261125`。本轮只做本地实现与测试，保留此前多轮 dirty 内容；未提交、推送、合并或发布，未访问真实 Codex 配置、账户、密钥或提供商。

## 范围、设计与回退

- 沿用 RouteEditor 的逐模型设置、现有控件、黑白表单风格、保存中禁用和错误保留输入；没有新增依赖。
- 新 `RouteCapabilitiesFields.tsx` 负责能力草稿与控件，RouteEditor 负责按入站协议/模型保留草稿并组装 `modelCapabilities`。`null` 清空能力；未知字段不凭模型名补值。上游目标和推理区间沿用既有行为。
- `ModelCapabilities` 字段与服务端合同一致；runtime 映射复制能力数组，不丢失 `tools:false`、`reasoningEfforts:[]`。预览保存也保留能力，路由列表显示已配置上下文/输出。
- 字符串草稿允许保留非法输入以便纠正。提交时拒绝非十进制正整数、超过 100000000、最大输出大于已知上下文、推理支持清单与路由区间无交集。明确的空推理清单表示不接受推理参数，区别于未知和 `none`。
- Codex 列表显示各项能力与未知值，说明上下文/图片/推理写入目录、输出由 Gateway 限制，要求重新保存启用网关后完整退出并重启 Codex。能力配置不等于供应商已验证。
- 协调者追加：Codex 需要本地工具，因此 `isCodexRouteAvailable` 排除 `tools:false`，未知工具支持兼容旧模型；已记住的不可用选择保留修复入口。四类能力错误在日志中显示中文说明和具体字段。
- 只回退本轮 UI 增量，并以协调者冻结的 revision7 before 快照识别此前修改；不得用 HEAD 整文件覆盖多轮未提交内容。

实际修改：`apps/desktop/src/components/RouteEditor.tsx`、新 `RouteCapabilitiesFields.tsx`/`.test.tsx`、`CodexModelsPanel.tsx`、`domain/types.ts`、`data/workspace-client.ts`/`.test.ts`、`data/codex-management.ts`（可用性判断一行）、`pages/RoutesPage.tsx`/`.test.tsx`、`styles/routes.css`，以及本记录。

## 测试过程和结果

从工作树 `apps/desktop` 运行。所有数据为测试 fixture，无供应商请求。

1. RED：`npm test -- --reporter=dot src/components/RouteCapabilitiesFields.test.tsx src/data/workspace-client.test.ts`。新增能力界面/映射尚未实现，8 failed、38 passed；失败原因是缺少能力控件、摘要和 runtime 能力字段。
2. GREEN：加入实现后运行能力、workspace、RouteEditor.protocol、CodexRoutingHelp 四套，55/55 PASS。
3. RED：追加 Codex 不支持工具的筛选和四类中文错误测试，2 failed、48 passed；失败原因是旧可用性判断仍提供 no-tools 模型、日志显示原始错误码。另预览保存测试先失败，界面未显示保存后的能力。
4. GREEN/回归：`npm test -- --reporter=dot src/components/RouteCapabilitiesFields.test.tsx src/data/workspace-client.test.ts src/components/RouteEditor.protocol.test.tsx src/components/CodexRoutingHelp.test.tsx src/pages/RoutesPage.test.tsx src/data/codex-management.test.tsx src/pages/CodexPage.test.tsx src/pages/CodexPage.memory.test.tsx`。8 files，125/125 PASS，exit 0。
5. `npx tsc -b`：PASS，exit 0。曾发现新增测试误用 Testing Library 不接受的 `exact` 选项，已删除并重新通过类型检查。
6. `git diff --check --` 加本轮 11 个代码/测试/样式路径：PASS，exit 0。

覆盖：逐模型批量保存、保存值回填、明确 false/空清单、清空 null、数字边界与非法文本保留、每协议草稿、源协议到新协议的能力保留、明确清空的协议隔离、推理交集、保存错误保留输入、预览保存、runtime 深复制、未知兼容、Codex 工具过滤和目录完整重启提示。原有路由选择、推理区间、Codex 页面/记忆管理相关回归一起通过。

## 验收边界

- renderer 代码与相关自动测试：PASS；类型检查：PASS。
- 真实 Electron 宽窄视口、键盘/滚动/控件遮挡及截图：本执行包 NOT_RUN，由协调者实机核对。
- 服务端持久化、请求能力执行、安装版 Codex 目录读取：本执行包 NOT_RUN，由协调者负责链路验证。
- 独立审查：本执行包 NOT_RUN，由协调者安排；Owner 验收、真实供应商：NOT_RUN。
- 操作通过终端与 apply_patch，按活动合同人工核对；AWG MCP 绑定主仓，未声称支线写入经过 MCP 校验。

当前阶段：renderer 已具备本地测试交付条件；主分支及 PR 未由本包更新。下一步：协调者执行链路、实机和独立审查，按实际证据做最终验收。
