# Codex 模式标签与模型分类核验

## 范围与位置

- 项目 `cx-routing-gateway`；仓库 `aiaijei-cx-routing-gateway`。
- 任务 `CXRG-CODEX-MODE-TABS-FILTER-20261128`；合同 revision 10。
- 分支 `codex/codex-mode-tabs-filter-20261128`；工作树 `.tmp/worktrees/codex-mode-tabs-filter-20261128`。
- 基线 `master@ad8fd690d800c299bb145f73962b6982c36e2df1`。不合并、不发布 GitHub Release、不删除工作树，不修改真实 Codex 配置或密钥。
- 专属 PR #28：`https://github.com/AiaiJei/Cx-Routing-Gateway/pull/28`，当前 OPEN，最新 head `342e227fee8286e25def5e4ec02a60dad0557cf8`。未合并；GitHub 当前未报告检查项。
- Owner 已授权独立合同、活动绑定与专属 PR。原总览任务绑定在主工作树本地档案保留，SHA-256 `6465F499A368EFC5574B01ED57E798E7ABA3859199516A424A7FCB09DD92C838`；总览合同、历史证据和 PR #27 未改。

## 需求与证据

| Owner 要求 | 实现 | 核验 |
| --- | --- | --- |
| 标签只选择目标模式 | 点击标签仅切换查看内容，不会自动预览、确认或修改当前配置；“生效中”仍取自已应用状态 | 定向页面与记忆测试覆盖标签选择、已生效标记保持；隔离浏览器验证切换标签不创建弹窗或写入 |
| 页面右上角状态按钮负责执行 | 未配置 Gateway 时引导去模型路由/接入凭证；未启用时显示“保存并启用网关”；已启用且无变化时显示禁用的“Gateway 已启用”；草稿变更时显示“保存并重新应用”；处理中和官方登录分别显示等待/阻断状态 | 30 项页面测试和 12 项凭证记忆测试；隔离浏览器覆盖未配置引导、启用、无变化、草稿变更、取消与再次应用 |
| 分类与“模型路由”一致 | 复用 `ModelFamilyFilter` 和 `getRouteModelFamily`；分类基于上游模型，计数仅包括可供 Codex 使用的路由；筛选式批量选择遵守最多 100 个限制 | 分类计数、隐藏选择保留、搜索交集、空分类、全选可见结果、默认模型保持和 100 上限测试 |

“生效中”只在配置应用成功后变化。标签只选目标模式；用户需明确点击右上角按钮才会预览并确认切换。取消不写入，已启用 Gateway 的草稿变化需显式重新应用；新环境缺项时通过按钮引导补齐，不自动启用。

## 实际执行

- 红测：实现前 `npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx` 7 失败、19 通过；失败对应标签仍仅浏览、旧按钮仍存在、分类未实现。
- 后续提示红测：状态组件新指引 4 失败，随后同步生产提示并通过。
- 聚焦：`npm --prefix apps/desktop test -- src/pages/CodexPage.test.tsx src/pages/CodexPage.memory.test.tsx src/components/CodexStatusPanel.test.tsx`，50/50 PASS。
- 本次改动定向：Codex 页面与凭证记忆测试 42/42 PASS。
- 完整 Desktop：`npm --prefix apps/desktop test -- --no-cache`，359/359，41 文件 PASS。
- 构建：`npm --prefix apps/desktop run build`，TypeScript 与 Vite PASS。
- Runtime：`node --test tests/runtime/*.test.mjs`，521/521 PASS。
- 1.1.15.1 专项：SettingsPage 14/14、发布清单 3/3 PASS。
- `git diff --check` PASS。
- `browser-smoke.cjs` 在已安装 Edge 上运行：标签只切换视图、空配置导航、启用/重新应用按钮状态、取消保留草稿、成功后标记和分类选择保留均 PASS；1530、1024、390 像素均无横向溢出。结果见 `state-aware-browser-result.json`。
- 已实际查看本次新截图 `state-aware-mode-1530.png` 与 `state-aware-mode-390.png`；状态按钮在宽屏位于刷新按钮左侧、窄屏能换行，不遮挡标题、标签或配置内容。
- 已实际查看 `mode-tabs-*.png` 和 `viewport-*.png` 的宽窄截图；曾发现 390px 滚动网格压缩模型行，已先用内容边界断言复现失败，再设内容行高并重跑通过。最终分类条正常换行，入口与文本未重叠。图片内是明确隔离的假数据，不是用户的账户/模型运行证据。

浏览器复现：启动 Desktop Vite 开发服务到 18541；让 `NODE_PATH` 指向可用的 Playwright 包目录，`CXRG_BROWSER_EXECUTABLE` 指向本机浏览器；执行 `node docs/tasks/evidence/codex-mode-tabs-filter-20261128/browser-smoke.cjs`。仅创建内存 Desktop bridge 假对象，不读取本机账户和密钥。

## 独立审查与边界

- 独立只读审查 Agent `01a21eb6-2c08-7722-b4c0-bfc6f604867e`：当时八个生产/测试文件无可操作缺陷；审查员另外执行 Desktop 355/355 与差异检查 PASS。随后补充的两种模式登录阻断、分类/搜索批量选择和 100 模型边界由主实现者执行，最终 358/358 PASS。
- Agent `01a21ec9-7bd9-7c62-9fd7-8fa38913fae5` 独立复审最新批量选择上限，无可操作缺陷；主实现者额外补充了 99→100 批量填充与默认模型保持断言。
- 同一 Agent 独立复审 `.codex-model-options` 的内容行高与顶部对齐修复：无可操作缺陷；保留原 440px 滚动区域与窄屏换行。浏览器防重叠断言由主实现者执行红→绿核验。
- 首次独立审查连接返回 `route_not_found`，未记为通过；换可用审查通道后得到上述结果。
- 依赖锁文件未改。`npm ci` 报告现有 6 个 moderate 依赖告警，未在本 UI 任务中自动升级或运行 `audit fix`。
- AWG 校验：项目身份、路径范围、创建仓内工作树、`events.jsonl` 留痕。终端源码/合同写入、测试、浏览器与 Git 操作不受 AWG MCP 强制控制。
- 真实 Codex 配置启用、真实模型请求和 Owner 交互验收：`NOT_RUN`。1.1.15.1 x64 Portable 已做版本、清单及隔离健康烟测；假数据验证不代表真实 Codex 配置或提供商可用。

## Owner 后续交互修正

- Owner 采纳方案：标签仅作目标模式选择；动作按钮置于标题右侧并随目标模式、生效状态、配置差异、配置缺项和处理状态变化。
- 交互修正通过定向与全量桌面回归；浏览器验证使用内存假数据，不连接真实配置或提供商。
- Owner 明确要求新建 1.1.15.1 测试目录，不覆盖仍运行的 1.1.15。1.1.15.1 已独立构建、复制与隔离烟测。
- 旧版 1.1.14 文件哈希与基线一致，Gateway 用户数据未读写；五个原进程在先前保留检查时仍运行，但最终复核时这些 PID 均已不在运行。本任务没有停止它们。
- 旧 Desktop 1.1.15 测试进程 PID `24156` 仍运行；1.1.15 原文件夹和二进制哈希保持原样。新版本位于独立的 `Cx-Routing Gateway Codex Mode Test 1.1.15.1` 目录。

## 交付状态

源码实现、本地测试、隔离浏览器验证与 1.1.15.1 x64 Portable 桌面烟测 `PASS`。新版位于 `C:\Users\20142\Desktop\Cx-Routing Gateway Codex Mode Test 1.1.15.1\`，SHA-256 `08A88C632B5A7C9EC54FE9F6DDC1C8028D3D7539ABCB3657C488F2C383FD6332`；详见 `local-test-release-1.1.15.1.md`。原 1.1.15 目录、文件与运行进程均未替换或停止。官方 1.1.14 文件 SHA-256 与基线一致；五个基线进程最终复核时均已不运行，且不是由本任务停止。

专属 PR #28 的状态按钮修正和 1.1.15.1 版本更新已提交至 `342e227` 并推送；PR 仍 OPEN。有效独立审查、真实 Codex 配置切换、提供商请求和 Owner 交互验收均为 `NOT_RUN`。主分支未更新、PR 未合并、GitHub Release 未发布。
