# 任务记录

- 任务：Cx-Routing Gateway 产品规划、前端静态概念图、docs 蓝图/计划/验收文档与仓内架构目录骨架。
- 项目 / 仓库：Cx-Routing Gateway / `C:/Users/20142/Desktop/Cx-Routing Gateway`。
- 日期：2026-11-18。
- 任务状态：规划产物完成，等待 Owner 评审。
- 合同状态：本仓未发现 `.codex/awg-task.json`；本记录依据本对话的明确范围留痕，不宣称 AWG 运行时合同已激活。
- 排除范围：任何可运行的前端、后端、API、测试、部署或真实上游连接实现。
- 假设：Res=Responses、Mes=Messages、Chat=Chat Completions；须由 Owner 确认。
- Git 起点：`master`，HEAD `a84258c`；未创建分支/worktree；未提交、推送或合并。
- 初始状态：仓库存在既有未跟踪 `.agent-workspace-governance/`、`.agents/`、`.tmp-awg-source/`、`plugins/`，本任务保留未改。
- 回退：本任务新增的 `docs/` 规划文件和空架构目录可按任务范围整体移除；删除前需复核用户后续变更。本任务没有修改上述既有未跟踪路径。

## 需求修订（2026-11-18）

用户明确产品为 Desktop 程序，无管理员；打开程序时自动启动本机 Gateway。本次据此修订蓝图、开发计划、验收清单、架构目录和概念图。Desktop 退出策略、托盘/后台常驻、开机启动、监听范围仍待 Owner 决策。

## 能力与验证记录

- 技能：使用 Superpowers、AWG 工作区治理、头脑风暴、计划编写、Git worktree、前端设计/应用屏幕参考指引；文档/PDF/计算机操作技能与此次 Markdown/SVG 交付无关。
- 设计参考：Taste skill 的 `Framed sheet` 应用方向；SVG 为静态概念图，不是网页实现。Codex Desktop 仅借鉴其侧栏组织项目/任务、在工作区检查结果的工作流结构；本图不是官方界面复刻。参考：[OpenAI, Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/)；[OpenAI, Codex](https://openai.com/codex/)。
- MCP：未调用 Repo Map；当前仓库入口极少，直接读取 README/Git 状态已足够导航。
- 网络：计划核对 Codex Desktop 公开布局参考；具体来源记入蓝图或此记录。
- 检查：规划文档链接/路径、SVG XML 与图像预览待完成。
- 前端/后端运行时及测试：`NOT_RUN`，符合本轮排除范围。

## 概念图修订（2026-11-18）

按用户要求，将 Desktop 工作区的总览、上游服务、模型路由、调用日志、接入凭证、设置分别渲染为独立 PNG 预览及 SVG 源图，并建立页面图册索引。仍是静态设计稿，不含交互或可运行前后端。


## 协议方向修订（2026-11-18）

按用户澄清明确通用语义：入站协议取自任意下游客户端实际请求，出站协议由对应模型路由配置；上游响应转换回该请求的原入站协议，不绑定特定客户端。概念图总览、路由、日志示例同步调整。

## 阶段 1 前端任务（2026-11-18）

- 任务 ID：`CXRG-FE-PHASE1-2026-11-18`；项目/仓库：Cx-Routing Gateway / `AiaiJei/Cx-Routing-Gateway`。
- 设计范围已由 Owner 批准：可运行 Desktop 界面、六个规划页面、fixture 状态和未来 API/IPC 接缝；不含 Gateway、后端、真实上游调用、密钥持久化、合并或发布。
- 合同：`.codex/awg-task.json`，记录授权路径、验收及回退；这是仓内任务记录，不代表 AWG runtime 已加载或生效。
- 隔离：`codex/desktop-frontend-phase1`，worktree 位于 `.worktree/desktop-frontend-phase1`；原有未跟踪 `.agent-workspace-governance/`、`.agents/`、`.tmp-awg-source/`、`plugins/` 与既有 `.worktree/frontend-scaffold` 保持不动。
- 技术方向：沿用 React/Vite/TypeScript/React Router/Vitest/Testing Library，并补充 Electron shell；当前提供可启动 Desktop 进程，但不含安装器、自动更新或 Gateway 生命周期实现。
- 实现：六页导航、typed fixtures/client boundary、上游与路由会话内表单、搜索/过滤、模拟状态、掩码凭证、只读运行时设置及键盘跳过导航。
- 当前检查：页面组件测试与生产构建在 PR 前重跑；浏览器已覆盖六页主要视图；Electron Desktop 进程需用 `npm run desktop:dev` 启动；窄屏截图受宿主窗口最小化影响，记为 `NOT_RUN`；安装器/后端联调仍为 `NOT_RUN`。
- 依赖风险：完整 `npm audit` 报 5 项 high，位于 Vite/Vitest 开发依赖链 `picomatch`；生产依赖审计为 0。常规 `npm audit fix` 未修复，强制修复要求破坏性降级，当前保留并披露。
- 回退：撤销该专属 PR；无运行时或持久化副作用。
- 状态：设计范围已批准；合同/设计/计划/实现已记录；全量复测、独立审查和 Owner 最终验收待完成。

### 能力记录

- 已调用：AWG 工作区治理、头脑风暴、Git worktree、计划编写、TDD、计划执行、Taste 前端设计、代码审查、完成前验证、Computer Use。
- Repo Map 未调用：本仓入口与依赖文档足以直接导航；无外部 MCP 调用。
- `ui-ux-pro-max` 未调用：本会话技能清单未提供其可读取/调用入口。
- AWG task 文件是仓内任务合同，不表示 AWG runtime 已激活。

### 独立审查处理

- 审查范围：`9b9bc23..2be6541`，只读审查；结论无 Critical，提出两项 Important 和两项 Minor。
- 已修复 Important：调用日志新增详情对话区，展示脱敏摘要并明确正文未记录；所有页面通过 `useWorkspace` 读取 typed client 数据，并提供读取错误提示。
- 已处理 Minor：总览空日志时平均耗时显示 `-`；日志增加状态筛选测试。异步上游测试仍保留错误边界作为 client 替换时的保护点，当前 fixture ID 不会触发该路径。
- 修复后验证：17 项测试通过，生产构建通过，生产依赖审计 0 项漏洞，Taste lint 0 FAIL/6 WARN；窄屏真实浏览器截图仍为 `NOT_RUN`。
- PR：`https://github.com/AiaiJei/Cx-Routing-Gateway/pull/3`，状态：已创建、未合并；Owner acceptance 仍为 pending。
- 后续修订：按 Owner 反馈补充 Electron 原生窗口与自定义标题栏；窗口无系统 frame，标题栏提供最小化、最大化/还原、关闭和拖拽区域，IPC 通过 preload 暴露且保持 context isolation。
- 修订验证：17 项测试通过，生产构建通过，`electron/main.cjs` 与 `electron/preload.cjs` 语法检查通过；窗口实际进程已启动，Computer Use 后续观察因物理 Escape 被用户中止。
- 交互修订：上游新增改为弹窗，并移除上游出站协议字段；模型路由弹窗支持勾选多个上游、加载各上游模型、分别选择模型，一个客户端模型可配置多个上游承载。专项与全量测试、构建均通过。
