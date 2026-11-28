# Codex 模式标签与模型分类核验

## 范围与位置

- 项目 `cx-routing-gateway`；仓库 `aiaijei-cx-routing-gateway`。
- 任务 `CXRG-CODEX-MODE-TABS-FILTER-20261128`；合同 revision 8。
- 分支 `codex/codex-mode-tabs-filter-20261128`；工作树 `.tmp/worktrees/codex-mode-tabs-filter-20261128`。
- 基线 `master@ad8fd690d800c299bb145f73962b6982c36e2df1`。不合并、不发布、不递增版本、不删除工作树，不修改真实 Codex 配置或密钥。
- 专属 PR #28：`https://github.com/AiaiJei/Cx-Routing-Gateway/pull/28`，当前 OPEN，初次 PR head `86ae94917d4a68861ccae19e86f37fbb584d5add`。GitHub 当前没有报告 CI 检查项；未合并。
- Owner 已授权独立合同、活动绑定与专属 PR。原总览任务绑定在主工作树本地档案保留，SHA-256 `6465F499A368EFC5574B01ED57E798E7ABA3859199516A424A7FCB09DD92C838`；总览合同、历史证据和 PR #27 未改。

## 需求与证据

| Owner 要求 | 实现 | 核验 |
| --- | --- | --- |
| 移除“保存并启用网关”按钮 | `CodexGatewayPanel` 移除入口，改为标签操作指引；模型目录提示同步指向上方标签 | 单元测试断言按钮不存在；浏览器检查及截图 |
| 标签选择运行/启用模式 | 点击 CX-RG 网关标签预览当前模型与凭证草稿，点击直连标签可预览所选直连方案；沿用原确认流程，确认后才提交 | 两种模式预览、确认/取消、异步锁定、登录阻断测试；隔离浏览器验证一次确认只写入一次假配置 |
| 分类与“模型路由”一致 | 复用 `ModelFamilyFilter` 和 `getRouteModelFamily`；分类基于上游模型，计数仅包括可供 Codex 使用的路由；筛选式批量选择遵守最多 100 个限制 | 分类计数、隐藏选择保留、搜索交集、空分类、全选可见结果、默认模型保持和 100 上限测试 |

“生效中”仍以读取到的配置状态为准，不把浏览中的标签冒充已启用。方向键、Home/End 只移动焦点；Enter/Space 才进入启用流程。取消或 Escape 不提交配置。当前已生效的网关标签可再次点击以应用模型/凭证草稿。已有直连方案的保存/启用操作保留。

## 实际执行

- 红测：实现前 `npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx` 7 失败、19 通过；失败对应标签仍仅浏览、旧按钮仍存在、分类未实现。
- 后续提示红测：状态组件新指引 4 失败，随后同步生产提示并通过。
- 聚焦：`npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx src/pages/CodexPage.memory.test.tsx src/components/CodexStatusPanel.test.tsx`，50/50 PASS。
- 完整 Desktop：`npm --prefix apps/desktop test -- --no-cache`，358/358，41 文件 PASS。
- 构建：`npm --prefix apps/desktop run build`，TypeScript 与 Vite PASS。
- 既有本机服务隔离回归：`node --test tests/runtime/codex-ipc.test.mjs tests/runtime/codex-config-modes.test.mjs tests/runtime/codex-gateway-memory.test.mjs`，34/34 PASS。使用仓内临时假配置、本地 Gateway/Control，不调用真实提供商。
- `git diff --check` PASS。
- `browser-smoke.cjs` 在已安装 Edge 上运行：标签、取消/确认、Home/End/Space/Escape、分类选择保留和无浏览器异常 PASS；1530、1024、390 像素均无横向溢出。结果见 `browser-result.json`。
- 已实际查看 `mode-tabs-*.png` 和 `viewport-*.png` 的宽窄截图；曾发现 390px 滚动网格压缩模型行，已先用内容边界断言复现失败，再设内容行高并重跑通过。最终分类条正常换行，入口与文本未重叠。图片内是明确隔离的假数据，不是用户的账户/模型运行证据。

浏览器复现：启动 Desktop Vite 开发服务到 18541；让 `NODE_PATH` 指向可用的 Playwright 包目录，`CXRG_BROWSER_EXECUTABLE` 指向本机浏览器；执行 `node docs/tasks/evidence/codex-mode-tabs-filter-20261128/browser-smoke.cjs`。仅创建内存 Desktop bridge 假对象，不读取本机账户和密钥。

## 独立审查与边界

- 独立只读审查 Agent `01a21eb6-2c08-7722-b4c0-bfc6f604867e`：当时八个生产/测试文件无可操作缺陷；审查员另外执行 Desktop 355/355 与差异检查 PASS。随后补充的两种模式登录阻断、分类/搜索批量选择和 100 模型边界由主实现者执行，最终 358/358 PASS。
- Agent `01a21ec9-7bd9-7c62-9fd7-8fa38913fae5` 独立复审最新批量选择上限，无可操作缺陷；主实现者额外补充了 99→100 批量填充与默认模型保持断言。
- 同一 Agent 独立复审 `.codex-model-options` 的内容行高与顶部对齐修复：无可操作缺陷；保留原 440px 滚动区域与窄屏换行。浏览器防重叠断言由主实现者执行红→绿核验。
- 首次独立审查连接返回 `route_not_found`，未记为通过；换可用审查通道后得到上述结果。
- 依赖锁文件未改。`npm ci` 报告现有 6 个 moderate 依赖告警，未在本 UI 任务中自动升级或运行 `audit fix`。
- AWG 校验：项目身份、路径范围、创建仓内工作树、`events.jsonl` 留痕。终端源码/合同写入、测试、浏览器与 Git 操作不受 AWG MCP 强制控制。
- 真实 Codex 配置启用、真实模型请求、原生打包应用验收、部署/发布、Owner 验收：全部 `NOT_RUN`。测试和假桥接浏览器通过不代表已部署。

## 交付状态

实现与本地验证 `PASS`；1.1.15 x64 Portable 测试版已交付桌面隔离目录，启动时使用新建的 `isolated-user-data/` 与 `isolated-codex-home/`，不预载入原始上游/路由。旧 1.1.14 文件 SHA-256 与五个现存进程均保持不变。

专属 PR #28 已创建并推送；产品版本和本地测试交付改动已在当前 PR 工作树，尚待提交/推送。主分支未更新；PR 保持 OPEN，未合并、未发布。真实 Codex 配置切换和 Owner 交互验收仍 `NOT_RUN`。
