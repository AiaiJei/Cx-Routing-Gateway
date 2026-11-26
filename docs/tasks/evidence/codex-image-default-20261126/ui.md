# Revision8 renderer evidence

项目 `cx-routing-gateway` / 仓库 `aiaijei-cx-routing-gateway`；任务 `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`，active contract revision8。已用 `git rev-parse --show-toplevel` 确认原任务工作树 `.tmp/worktrees/codex-route-management-20261125`；分支 `codex/codex-route-management-20261125`。仅实施分配的 renderer 增量，保留 revision2-7 及其他人的 dirty 修改。未提交、推送、合并或发布；未访问或改写真实 Codex 配置/auth/凭证，未调用真实提供商。

## 接口与实现

- `catalogSync?: { state: 'current'|'stale'|'unavailable'|'not-applied'; source: 'gateway'|'direct'|'none'; models: { model: string; inputModalities: ('text'|'image')[] }[]; catalogPath?: string }`。`models` 是数组，`catalogSync` 兼容旧 runtime 缺省；由协调者的 native 实现提供安全摘要。
- 输入能力未填写的草稿值仍为 `''`，默认选项显示“默认（文本和图片）”。提交继续省略 inputModalities；整项清空保持 `capabilities:null`，由 native 的新目录默认策略处理。显式“仅文本”和“文本和图片”继续保存原值。
- 工具缺省仍不写 `tools`，显示“按上游处理”。帮助说明工具请求继续转发、由上游接受或报错，不代表已确认支持；明确“不支持”的执行语义没有改动。
- 清空帮助与 Codex 模型摘要同步说明新图片默认，其他能力仍未知/按上游处理，不依模型名猜测供应商能力。Codex 模型列表明确这是网关路由配置，不能直接证明当前 Codex 已采用。
- 状态面板新增可见“模型能力目录”区域：current 分别显示网关/直连目录匹配；stale 按来源引导重新启用网关或当前直连方案；unavailable 明确无法核对并提示恢复服务刷新；旧 runtime 无诊断时不声称已应用。
- not-applied 同时覆盖没有使用本产品目录和被启动配置/模型选择覆盖，不断言文件不存在，也不把网关能力当作直连已生效。提示用户按意愿切换网关、显式保存启用，并检查所用接入方案。
- 仅展示 native 返回的实际已写入模型输入能力及路径。current 明确只是磁盘配置检查，不能确认正在运行的 Codex 已重载；应用后仍需完整退出并重启。没有进程重启或自动应用动作。
- 路由保存成功及保存后列表刷新失败的反馈均提示：如需更新 Codex 能力，前往 Codex 重新保存并启用网关，再完整退出并重启。

修改路径：

1. `apps/desktop/src/components/RouteCapabilitiesFields.tsx`
2. `apps/desktop/src/components/RouteCapabilitiesFields.test.tsx`
3. `apps/desktop/src/components/RouteEditor.tsx`（说明文字）
4. `apps/desktop/src/components/CodexModelsPanel.tsx`（摘要与说明）
5. `apps/desktop/src/components/CodexStatusPanel.tsx`
6. 新 `apps/desktop/src/components/CodexStatusPanel.test.tsx`
7. `apps/desktop/src/domain/codex-management.ts`
8. `apps/desktop/src/pages/RoutesPage.tsx`（保存反馈）
9. `apps/desktop/src/pages/RoutesPage.test.tsx`
10. 本取证记录。

没有 native、网关策略、样式或其他文件的人工修改。沿用现有控件、样式和确认流程。回退只撤本轮上述增量，以协调者冻结的 `.tmp/codex-route-management-20261125/revision8/before.json` 识别，禁止以 HEAD 覆盖整文件而丢失此前工作。

## 测试与证据

从工作树 `apps/desktop` 执行，全部 fixture，不需要提供商请求。

- RED：`npm test -- --reporter=dot src/components/RouteCapabilitiesFields.test.tsx src/components/CodexStatusPanel.test.tsx src/pages/RoutesPage.test.tsx`。12 failed、30 passed；失败来自尚未更新的默认/工具文案、尚无目录状态区、保存反馈缺少重新应用指引。
- 第一轮 GREEN：加入实现后，能力、状态、路由页和既有 CodexRoutingHelp 四套 44/44 PASS；补充直连 stale 指引后 45/45 PASS。
- 协调者追加 native 的启动配置/模型覆盖语义后，将 direct/gateway 两种 not-applied 断言先改成新语义：状态套件 RED 2 failed、7 passed。更新文案后重新通过。
- 最终：`npm test -- --reporter=dot src/components/RouteCapabilitiesFields.test.tsx src/components/CodexStatusPanel.test.tsx src/pages/RoutesPage.test.tsx src/components/CodexRoutingHelp.test.tsx`，4 files，46/46 PASS，exit 0。
- `npx tsc -b`：PASS，exit 0。
- `git diff --check --` 加本轮九个 renderer 路径与本记录：PASS，exit 0。

覆盖默认/显式图片能力保存、清空 null、工具缺省解释、已知能力和未知摘要、原数字与协议草稿回归、各目录状态、直连/网关来源、当前已写入值、启动配置覆盖、缺诊断兼容、加载中不显示旧诊断，以及路由保存反馈。按分工不重复运行全量 Runtime/Desktop/build。

## 当前状态与限制

renderer 与针对性自动测试 PASS；类型检查 PASS。本包的真实宽窄视口、native 状态链路、当前安装版 Codex 图片输入、独立审查均为 NOT_RUN，由协调者集成验收；这些测试不等于用户当前配置已修复或供应商支持已验证。

所有读取/写入经终端及 apply_patch，按 active 合同人工核对；AWG MCP 固定绑定主仓，本支线操作未经过该 MCP 校验。工作仍未提交，目标分支与 PR 未由本包更新。下一步：协调者继续原生链路、界面和独立审查后完成本地交付。
