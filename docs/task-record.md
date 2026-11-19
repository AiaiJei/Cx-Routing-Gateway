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
- PR：`https://github.com/AiaiJei/Cx-Routing-Gateway/pull/3`，已于 2026-11-18 合并；合并提交：`8ee341deff499224079f3e604e1a4a77b4a1ab50`。Owner acceptance 仍为 pending。
- 后续修订：按 Owner 反馈补充 Electron 原生窗口与自定义标题栏；窗口无系统 frame，标题栏提供最小化、最大化/还原、关闭和拖拽区域，IPC 通过 preload 暴露且保持 context isolation。
- 修订验证：17 项测试通过，生产构建通过，`electron/main.cjs` 与 `electron/preload.cjs` 语法检查通过；窗口实际进程已启动，Computer Use 后续观察因物理 Escape 被用户中止。
- 交互修订：上游新增改为弹窗，并移除上游出站协议字段；模型路由弹窗支持勾选多个上游、加载各上游模型、分别选择模型，一个客户端模型可配置多个上游承载。专项与全量测试、构建均通过。
- 布局修订：弹窗关闭使用 `X`，上游弹窗补充 Key 输入和模拟连通测试入口；移除取消按钮，统一下拉控件箭头/焦点/边框样式，修正普通输入框误显示下拉箭头的问题。
- 焦点样式修订：移除全局焦点规则与控件局部 outline 的叠加，统一为单层 accent 焦点环，并为搜索框、输入框、下拉框和按钮保持一致的可见选中态。
- 下拉菜单修订：新增全局 `CustomSelect`，替换日志筛选、路由协议和模型选择的原生 select；统一菜单、选中态、键盘导航、Escape、点击外部关闭和表单隐藏值同步。
- 日志详情修订：调用日志详情从页面内嵌面板改为统一弹窗，复用遮罩、`X` 关闭、Escape 和点击外部关闭行为。
- 总览修订：按 Owner 选择的“运行态总览”重排首屏，优先展示 Gateway 状态与快捷入口；失败调用单独进入“需要关注”；配置就绪与运行概况分组，最近调用保留在下方。
- 总览按钮修订：快捷操作统一为规范按钮组，固定高度与对齐方式，统一边框/圆角/间距，并补充 hover、active 和链接按钮去装饰处理。

### 合并归档

- PR #3 已合并至 `master`；主工作树已快进至合并提交 `8ee341d`。
- 主工作树合并后验证：`npm test` 19/19 通过；`npm run build` 通过；Electron 主进程和 preload 语法检查通过；`git diff --check` 通过。
- 任务 worktree `.worktree/desktop-frontend-phase1` 保留为宿主管理目录，未强制删除；主工作树原有未跟踪治理目录保持不变。

## iOS 风格前端精修（2026-11-19）

- 任务 ID：`CXRG-FE-IOS-HIG-2026-11-19`；项目/仓库：Cx-Routing Gateway / `AiaiJei/Cx-Routing-Gateway`。
- 用户要求依据 Apple Human Interface Guidelines 精修现有前端，增加有语义的色彩变化；补充要求：移除左侧菜单栏站点标题，并在每个导航路由标题前增加对应 SVG 标识。
- 隔离：`codex/desktop-frontend-ios-hig`，worktree `.worktree/desktop-frontend-ios-hig`，基于 `master` 的 `e0f3fda`。已有未跟踪目录和其他 worktree 保持不动。
- 范围：沿用 React/Vite/Electron、现有六页和数据边界；采用共享语义颜色与分组控件样式；不增加运行时、网络、持久化或依赖迁移。
- 合同、设计与计划：`.codex/awg-task.json`、`docs/superpowers/specs/2026-11-19-desktop-ios-hig-design.md`、`docs/superpowers/plans/2026-11-19-desktop-ios-hig.md`。
- 回退：撤销该专属 PR；无持久化运行时副作用。
- 实现：移除侧栏品牌标题；六个导航项前加入 SVG；增加 Res/Mes/Chat 协议色、状态色、日志分段筛选、分组表面、聚焦样式与移动端标题操作单行处理。
- TDD：导航/分段控件、协议/状态徽标、宽表格滚动边界、凭证页标题操作均先验证失败，再实现通过。
- 验证：`npm ci` 完成并报告 0 项漏洞；`npm test` 23/23 通过；`npm run build` 通过；Taste App lint 0 FAIL / 0 WARN；`git diff --check` 通过。
- 视觉检查：开发态检查总览、上游、路由、日志、凭证、设置；生产预览在 1440/768/390px 检查总览与日志，页面横向溢出为 0。路由及状态颜色对比检查通过；移动总览仍有约 46% 文本低于 13px，源于紧凑辅助标签；少量 fixture 行造成页面留白，保留真实数据规模。
- 运行证据：开发服务器为 `http://127.0.0.1:4173/`；生产预览检查使用 `http://127.0.0.1:4174/`。原生 Electron 窗口启动 `NOT_RUN`；Owner 最终验收仍 pending。
- 独立审查：只读范围 `e0f3fda..1b88d1b`，无 Critical/Important。Minor 关注 `ProtocolFlow` 的 `aria-label`；Chromium Accessibility Tree 实测该 `generic` 节点名称为完整的 `Res → Chat → Res`，因此无需代码改动。
- PR：#5，`https://github.com/AiaiJei/Cx-Routing-Gateway/pull/5`，分支 `codex/desktop-frontend-ios-hig` → `master`；PR #4 已被另一任务占用，未改动。未合并，Owner acceptance 仍 pending。
- 视觉产物：截图与检查报告保留在 worktree 的 `.taste-skill/`，已纳入本任务授权路径，未加入 PR 文件。
- 能力：已读取 AWG 治理、头脑风暴、计划、worktree、TDD、Taste App Screens、验证、代码审查及接收审查技能；Repo Map 未调用（入口和调用链已由源代码、测试覆盖）；AWG runtime 是否激活不作推断。

### 基于 PR #4 的迁移（2026-11-19）

- Owner 澄清：本次 Desktop UI 精修以 PR #4 `codex/project-stage0-contract` 为基底；此前 PR #5 以 `master` 为 base 的状态已迁移，不覆盖 PR #4 工作树或其未跟踪文件。
- 迁移基点：PR #4 head `480f54cf490cdb58de9a48be891d61135d594ecc`；当前分支 `codex/desktop-frontend-ios-hig` 将改为以 `codex/project-stage0-contract` 为 base。
- 冲突处理：保留 PR #4 的 RuntimeIndicator、真实运行时凭证/上游/路由/设置行为、多模型选择、优先级故障切换、Electron supervisor 与安全边界；重新叠加本任务的 SVG 导航、iOS/HIG 语义色彩、协议徽标、分段日志筛选、分组表面和响应式边界。
- 迁移验证：Desktop 37/37、Runtime 55/55、`npm run build` 通过；Desktop production asset 相对路径测试通过。依赖按 PR #4 lockfile 重装后审计报告 6 项 moderate，未执行破坏性修复。
- Taste App lint：0 FAIL、4 WARN（PR #4 共享 Geist 输入/菜单/按钮阴影与弹窗阴影）；PR #4 既有 CRLF 文件导致普通 `git diff --check` 行尾提示，迁移代码逻辑未新增该类运行时问题。
- 当前 PR：#5 将改为以 PR #4 分支为 base；PR #4 保持 OPEN，未合并、未修改其工作树。

### 交互式真实路由测试（2026-11-19）

- 用户要求在每条启用路由的状态/操作区增加入口；点击后打开交互窗口，预填并发送 `请回复OK`，显示模型响应、请求 ID、耗时或错误。
- 实现：新增 `RouteTestDialog`，允许编辑最多 2000 字提示词，列出协议和目标优先级，显示加载/响应/错误状态，并明确提示真实上游调用可能产生费用。
- 安全边界：Electron IPC 仅接受可信应用文档；Gateway 只为该启用路由创建 60 秒内存测试凭证，scope 限定模型且绑定 route ID，请求结束后删除；凭证不传入 renderer、不写配置或密钥库。测试调用通过 Gateway 原有认证、路由、协议转换、优先级故障切换和调用日志；每个 Gateway 进程限制真实路由测试为 10 次/分钟，输出预算上限为 256 tokens。
- 运行时适配：Electron 开发模式与打包模式均使用进程内 supervisor，使主进程可调用 Gateway 的内部 route-test 方法；非 Electron Node 模式仍保留子进程 supervisor，原有 Runtime 测试接口保持兼容。
- 验证：Desktop 41/41、Runtime 56/56、生产构建通过；Gateway 集成测试覆盖 Res/Mes/Chat 入站到 Chat 上游、真实日志写入、无凭证落盘、禁用/未知路由拒绝、提示词长度及每分钟 10 次 route-test 限流；对话框/页面测试覆盖默认提示、响应元信息、错误和预览模式隐藏入口。宽屏/手机对话框布局用模拟 IPC 做视觉检查；未调用真实第三方 Provider。
## 项目阶段 0 合同任务（2026-11-18）

- 任务 ID：`CXRG-PHASE0-2026-11-18`；项目/仓库：Cx-Routing Gateway / `AiaiJei/Cx-Routing-Gateway`。
- 用户目标：遵循仓内开发计划，继续完成整个 Cx-Routing Gateway 项目；采用逐阶段合同、验证、独立审查和 Owner 验收。
- 协议方向：Owner 确认 Res = OpenAI Responses、Mes = Anthropic Messages、Chat = OpenAI Chat Completions；要求阶段 0 固定确切 API 版本。
- 合同修订：`.codex/awg-task.json` 当前绑定阶段 0，仅授权任务合同、阶段 0 设计/计划和本记录；阶段 0 不授权应用或运行时实现。
- 隔离：分支 `codex/project-stage0-contract`，worktree `.worktree/project-stage0-contract`，基于 `master` 的 `e0f3fda`。前端阶段 worktree 与主工作树既有未跟踪目录均保留。
- 官方协议证据方向：OpenAI Responses `/v1/responses`，Chat Completions `/v1/chat/completions`；Anthropic Messages `/v1/messages`，版本头建议 `2026-10-21`。OpenAI 接口合同使用 API v1 与参考 schema 检索日期/内容哈希固定；Anthropic 按日期版本头固定。进入实现前需再核对链接、变更内容并记录 schema 哈希。
- 阶段 0 建议：完成九种入站/出站组合能力矩阵、规范化请求/响应/流事件/错误草案、本机控制与 Gateway 边界、生命周期和 SSRF/凭证/脱敏威胁模型。
- 待 Owner 决策：Desktop 关闭后的 Gateway 行为、后台/托盘与开机启动、单实例、监听地址及 LAN 访问；能力矩阵中的有损转换策略；后端语言/存储/密钥存储实现。
- 基线验证：在原始 `master` 工作树实跑 `apps/desktop/npm test`（9 个文件、19 项通过）与 `npm run build`（通过）；本阶段未运行运行时测试。
- Repo Map：已检查连接的 Repo Map 状态，返回 `CONFIG_INVALID`（缺少/无效 `repo-map.json`）；未刷新。直接读取 README、架构和计划文档。
- 技能状态：已调用 AWG 工作区治理、Brainstorming、Writing Plans、Using Git Worktrees、Verification Before Completion；TDD 与 UI 设计技能在本阶段不适用（仅编写合同文档，无实现）。AWG 合同是仓内授权记录，不代表 Desktop AWG runtime 已激活。
- 状态：阶段 0 设计和计划待 Owner 审阅；Owner acceptance pending；不声称后端、协议实现或全项目完成。
- 回退：仅回退该阶段专用合同/规格/计划/记录新增；不删除任何既有 worktree、目录或用户数据。
- 2026-11-19 修订：补充九方向协议矩阵、跨协议文本基线、规范化接口草案、Gateway 错误语义、威胁模型与生命周期草案。官方参考页于 2026-11-19 复核；Anthropic `2026-10-21` 的 Messages 变更包括采样参数移除、assistant 文档块和 user 文本引用位置限制，并且 Bedrock 仅对 Claude 4.7+ 可用。OpenAI schema 内容哈希留到适配器实现任务生成。
- Owner 回复“不需要”按“不需修改现有设计草案”处理；此回复不记录为阶段 0 的正式验收。阶段 0 Owner acceptance 仍为 pending。
- Ruling: 将“不需要”解释为不修改草案并继续文档工作，而不是完整验收 — 对话上下文是在询问需要哪些修改，且用户没有提出修订条目 — 若该理解错误，后续阶段 0 设计仍可在实施前修订。
- 本阶段任务仅产出合同文档；没有应用或运行时代码变更，运行链路测试 `NOT_RUN`。
- 独立只读审查完成：审查者报告 4 项 Important，分别涉及三个原生协议方向的特性分类、OpenAI schema/未知流事件漂移、Anthropic 2026-10-21 文档与引用位置规则、Desktop 崩溃后子进程孤儿。已在一次修订中补全 Native-Forward 配置矩阵、schema 差异审查与未知事件原样转发规则、版本向量，以及 3 秒 liveness-pipe 退出测试门；审查者另提的私网信任显式流程与地址分类也已补入。遵照计划，不发起二次审查；需要 Owner 在进入实现前验收。
- 2026-11-19 合同范围修订：将 `README.md` 与 `docs/architecture.md` 纳入授权路径，更正项目入口和架构树对 Desktop 前端及未实现 Gateway 的状态说明；范围修订经用户“继续完成整个项目”的明确授权，仍不包含应用代码。
- 根 README 与架构树现明确 Desktop UI 可运行且使用 fixture，Gateway、控制服务、协议适配、持久化与部署仍未实现；规划图不作为运行时证据。

## 阶段 2 运行时基础实现（2026-11-19）

- 合同修订：用户明确目标为“完整的开发整个项目”，将阶段 2 的运行时基础纳入当前合同授权；新增 `package.json`、`packages/shared/**`、`services/local-control/**`、`services/gateway/**`、`tests/runtime/**`。
- 已实现：版本化 JSON 配置原子写入与 `.bak` 备份；AES-256-GCM 加密 SecretVault；loopback 控制 API；上游/路由/客户端 Key 创建；Key 哈希存储与一次性回显；Gateway Bearer/x-api-key 鉴权；Chat 原生转发；Chat→Messages 文本转换；跨协议 streaming/tools/多模态/结构化输出拒绝；稳定错误响应和 request ID。
- 验证：`npm test` 5/5 运行时测试通过；测试使用本地 mock 上游，不依赖外部 provider。
- 已知未完成：Desktop 页面仍未覆盖完整 CRUD 编辑、真实流式和工具调用、用量限流/指标、发布打包；模型发现与连通测试 API 已实现，Desktop 入口已接入读取工作区和测试上游。
- 安全边界：当前 master key 通过 `CXRG_MASTER_KEY` 注入；未提供 OS keychain 适配；Gateway 默认 loopback 运行，重定向被禁止；生产部署和密钥轮换审查仍未完成。
- 回退：删除本阶段新增运行时文件并恢复合同授权范围；不删除既有 Desktop 或治理目录。
- 后续实现：补充了上游/路由删除与更新、模型发现/连通测试、脱敏使用日志、Responses→Chat 与 Chat→Messages 转换、运行时 supervisor 和 Electron 主进程启动/停止接入。
- 运行时安全补充：控制面显式要求私网/回环上游信任；Gateway 在请求时再次 DNS 校验并拒绝元数据地址、未信任私网和重定向；按客户端 Key 维护 60 次/分钟内存限流。
- 独立运行时审查后修订：Desktop control API 由 supervisor 注入随机 token，Electron IPC 校验 sender URL 并禁止远程导航/新窗口；原生同协议请求保留 Gateway 未拥有的字段；上游响应增加 4 MiB 限制；配置与 SecretVault 增加跨进程锁；Electron master key 优先使用 `safeStorage` 加密存储；supervisor 健康检查校验服务身份。
- 最新验证：运行时 11/11 测试通过；Desktop 19/19 测试通过；Desktop 生产构建通过；Electron main/preload/supervisor、control、Gateway 语法检查通过。
- 2026-11-19 后续实现：协议运行时测试扩展到 13 项，覆盖六个跨协议方向、Res/Mes 原生字段保留、原生 SSE 流式转发和原生工具字段透传；模型发现结果写回配置并进入 Desktop 路由数据；控制面支持路由更新和 Key 轮换；凭证页在运行时模式支持创建/轮换/撤销。
- 最新运行时扩展：实现简单文本跨协议 SSE 事件转换，以及单函数工具定义/调用在 Chat↔Messages/Responses 方向的基础转换；复杂工具结果链、工具流式增量和多工具编排仍待独立能力门。
- 工具链修订：单函数及多函数工具结果回传已加入 Chat→Messages 的第二轮请求测试；单工具 Messages→Chat 流式增量已实现，平行工具流仍保持拒绝。
- 最新验证：运行时 27/27 测试通过；Desktop 19/19 测试通过；Desktop 生产构建通过；主进程、preload、supervisor、control、Gateway、健康脚本语法检查通过。
- Control API 安全边界修订：缺少 `CXRG_CONTROL_TOKEN` 时独立服务拒绝启动；只有测试显式设置 `allowUnauthenticated` 才允许匿名控制服务。
- Key 授权范围：客户端 Key 可携带模型别名 scope，Gateway 在路由前返回 `forbidden` 拒绝越权；Desktop 当前仍默认创建“全部模型”范围。
- Gateway 客户端兼容性：新增认证的 `GET /v1/models`，按 Key scope 过滤可见路由模型。
- 请求追踪：Gateway 将 `x-request-id` 传给上游，并在下游响应、失败记录和成功记录中保持同一关联 ID。
- 响应安全头：Control/Gateway JSON 响应统一设置 `X-Content-Type-Options: nosniff` 和 `Cache-Control: no-store`，并有 Gateway 回归覆盖。
- 上游 URL 兼容性：统一 endpoint join 逻辑，Base URL 已含 `/v1` 时不再重复拼接；回归测试覆盖该配置形式。
- Desktop Key scope：凭证页支持输入逗号分隔的模型别名范围，创建 Key 时通过 IPC 传入 Control API；留空表示全部模型。
- Desktop 模型同步：上游连通/发现操作成功后刷新本机状态并更新页面模型列表，供路由编辑使用。
- Desktop metrics 接入：Electron 工作区读取 control metrics，总览运行态显示真实调用总数、成功/失败和平均耗时；fixture 浏览器测试保持示例数据。
- Desktop 异常状态：runtime supervisor 记录子进程失败/停止状态，Electron 通过 IPC 暴露 runtime status，工作区状态映射为“启动失败”而不是继续显示运行中。
- 运维诊断：新增 `npm run doctor`，只读检查 control/Gateway 健康、密钥/token 配置和 release manifest。
- 验收清单同步：metrics、回滚、构建和 release manifest 证据已标为 `PASS`/`PARTIAL`，未把远程 CI、真实 E2E 或生产演练写成完成。
- 资源边界补充：Gateway 增加最大并发请求数和请求体读取超时，运行时测试覆盖并发超限返回 `concurrency_limited`。
- 最新审查修复：Electron sender 校验改为 origin 精确比较；新 Key 使用服务端 ID，撤销状态正确显示；Desktop 增加路由启停更新 IPC；上游创建/发现/运行时请求保存并比对 DNS 地址快照，拒绝解析漂移和不受信任目标。
- 可观测性补充：UsageRecord 现在保存耗时和失败/拒绝代码；control API 增加聚合 metrics；Desktop 运行时日志和总览使用真实 duration。
- 验收清单已追加 2026-11-19 证据修订，明确 PASS/PARTIAL/NOT_RUN 边界；未把 Owner 签收、发布、安装器或真实 provider 联调写成完成。
- 打包验证：`apps/desktop` 的 `npm run desktop:dist` 通过，Electron Builder 生成 `release/win-unpacked/Cx-Routing Gateway.exe`；当前未配置图标、签名或安装器目标，release 目录已加入本地排除。
- 安装器验证：`apps/desktop` 的 `npm run desktop:installer` 通过，生成 `release/Cx-Routing Gateway Setup 0.1.0.exe` 和 blockmap；签名、自动更新和实际安装/卸载仍未运行。
- 发布产物校验：`npm run verify:release` 通过，检查 unpacked exe、NSIS exe、blockmap 均存在且非空，并输出 SHA-256 哈希。
- Release verifier 还检查 `win-unpacked/resources/app.asar`，确认 packaged Electron 应用内容存在。
- Packaged smoke：新增 `npm run smoke:packaged`，实际启动 unpacked Windows executable 的 `--version` 路径并以 exit code 0 验证 shell 可启动；CI package job 同样执行该 smoke。
- Release manifest：`verify:release` 现在写入 `release/manifest.json`，记录版本、平台、文件大小、SHA-256 和 `signed: false` 状态，供后续签名/更新服务使用。
- 自动更新准备：新增 `check:update` manifest 检查器和测试；仅识别更高且已签名版本，不执行下载、安装或重启。
- Desktop 更新发现接入：设置页新增“检查更新”入口，Electron 主进程通过 preload 调用 manifest 检查；未配置更新源或未签名版本会明确提示，不执行安装。
- 更新安全增强：manifest 检查器现在验证 RSA signature/publicKey，篡改或仅设置 `signed: true` 的 manifest 不会被报告为可更新。
- 发布签名准备：`verify-release` 支持通过 `CXRG_RELEASE_PRIVATE_KEY`/`CXRG_RELEASE_PUBLIC_KEY` 生成签名 manifest；当前构建未提供证书，因此实际 manifest 仍为 `signed: false`。
- CI 补充：新增 `.github/workflows/ci.yml`，在 Windows runner 上运行运行时测试、Desktop 测试、生产构建和生产依赖审计；GitHub 远程 workflow 尚未执行。
- CI 发布补充：workflow 支持 `workflow_dispatch` 和 `v*.*.*` tag，构建并上传 unsigned Windows NSIS release artifact；不会自动签名、发布或更新。
- CI 发布校验：安装器 job 在上传 artifact 前运行 `verify-release.mjs`，验证 exe、app.asar、安装器和 blockmap。
- CI 配置验证：本地 YAML parser 成功解析 `.github/workflows/ci.yml`；远程 GitHub Actions 尚未执行。
- 聚合验证：`npm run verify:all` 已通过运行时测试、Desktop 测试、构建和 release manifest；生产依赖审计保留在 CI 独立步骤及单独 npm 命令中，避免宿主 npm allowScripts 配置污染聚合子进程。
- 聚合验证扩展：`verify:all` 现在还执行 packaged Windows executable smoke，确认 unpacked shell 可启动并正常退出。
- 最新聚合验证：`npm run verify:all` 完整通过（27 runtime tests、19 Desktop tests、Desktop build、release manifest、packaged smoke）；生产依赖审计仍由 CI 独立执行。
- 回滚工具验证：`restore-config.mjs` 已实现并测试通过，会在恢复 `.bak` 前保存当前配置为 `.before-rollback`。
- 依赖验证：Desktop `npm audit --omit=dev` 返回 0 vulnerabilities；开发依赖审计仍有 Electron Builder 链中的 6 个 moderate，未执行破坏性 `audit fix --force`。
- Desktop 运行时工作流扩展：上游新增/测试/删除、路由新增/删除、凭证创建/轮换/撤销均已通过 preload IPC 连接本机控制 API；浏览器 fixture 模式仍保持会话演示并明确标记。
- 安全修复后复测：上述运行时、Desktop 测试和生产构建再次通过；`git diff --check` 通过。独立审查仍标记完整协议覆盖、OS keychain fallback 处理、真实流式/工具、限流指标和发布验收为后续工作。
- 当前状态：已从“仅文档”推进到“Desktop + 本机运行时基础可运行”；完整项目仍未完成，继续进入数据面完整协议、Desktop IPC、流式/工具、限流指标和发布阶段。

## 2026-11-19 持续实现与发布包修复

- 本轮代码改动：控制面补充 IPv4/IPv6 地址分类、批准地址固定的模型发现请求、私网信任不跨目标复用、路由 PATCH 冲突检查和可配置日志保留上限；Desktop 补充凭证 scope/服务器 ID 保留、路由编辑、日志保留设置保存及对应 IPC。
- 本轮测试：运行时 `npm test` 为 32/32；Desktop `npm test` 为 22/22；Desktop `npm run build` 通过。
- 发布包回归：首次聚合发现 packaged smoke 无法启动本地服务，根因为打包后 `process.execPath` 是 Electron 应用 exe，不能直接作为 Node 脚本宿主。修订为 Electron packaged 直接加载同一份 runtime 模块，并通过 `extraResources` 携带 `services/`、`packages/`、`scripts/`；`npm run smoke:packaged` 修复后退出码 0。
- 运行时策略：开发环境继续使用独立 control/Gateway 子进程与 liveness pipe；打包 Electron 使用 supervisor 管理两个本地 HTTP server，保持同一控制 token、数据目录和停止接口。
- 当前仍未完成：Owner 正式验收、官方 schema hash 归档、真实第三方 provider、完整 Electron GUI/窄屏 E2E、告警阈值与容量压测、真实 DNS 重绑定跨平台验证、代码签名、自动更新安装和干净机器安装。
- 安全收口：Gateway 同步拒绝混合公网/私网 DNS 解析；Electron 新增应用文档 URL 判定，禁止任意本地文件和 userinfo 伪造 origin 触发 IPC。
- 发布校验收口：`verify-release` 纳入 `resources/runtime` 下的 control、Gateway、shared storage 和 update script 文件，避免安装器外壳存在但运行时文件缺失仍被误判为可发布。
- Desktop 实测白屏修复：验收启动发现 packaged 窗口空白，根因为 Vite 输出 `/assets/...` 绝对路径与 Electron `file://` 加载不兼容；设置 `base: "./"`、加入 `desktop-build.test.mjs`，重新打包后窗口与两个 health endpoint 均正常。
- 上游页验收修复：测试按钮增加 loading/异常反馈和独立测试色；运行时上游新增弹窗、连接按钮、保存按钮及页脚不再显示示例/模拟措辞，组件测试 23 项通过。
- 更新链路：`check-update.mjs` 增加签名 manifest、相对路径、下载内容 SHA-256 校验和临时文件落盘；Desktop 设置页增加用户触发安装入口，未配置或未签名版本不会执行安装。真实签名安装器执行仍未运行。
- 上游 profile：Control API 新增并持久化 `providerId`/`apiProfile`，协议默认值与 Res/Mes/Chat 对齐，协议版本不再隐含在模型 ID 中。
- 平行工具流：Gateway 已支持标准 Chat/Messages/Responses function-call SSE 的多工具索引、开始事件和参数增量，终止时 Chat 返回 `tool_calls`；provider-specific 非函数事件仍保持拒绝/忽略边界。

## 2026-11-19 Desktop 设计系统更新

- 用户指定 Vercel Geist Typography 与 Apple Human Interface Guidelines 为视觉与控件参考。
- Desktop 全局字体替换为本地打包的 Geist Sans/Geist Mono 可变字体；色彩、字号、间距与 focus tokens 统一，中文使用系统中文字体回退。
- 新增复用的 `Button`（primary/secondary/tertiary/accent/danger）和 `TextField` 组件，迁移页面主要操作、表单和设置字段；保留窗口控制、下拉选择等专用控件语义。
- 验证：Desktop 27/27 组件测试、生产构建、Windows 安装器、release manifest、packaged smoke 均通过；生产依赖审计 0 vulnerabilities。未执行浏览器尺寸截图比对；当前窗口由 Owner 继续实测。

## 2026-11-19 Geist / HIG Desktop design system

- 参考：Vercel Geist Typography 与 Apple Human Interface Guidelines（用户指定）。
- Desktop 字体改为本地打包 `@fontsource-variable/geist` / `geist-mono`；中英文字体栈含 Windows 中文系统字体回退。
- 建立共享 `Button` variants（primary、secondary、tertiary、accent、danger）与 `TextField`（标签、提示、描述关联）组件，主页面业务操作和文本表单已迁移；窗口控制、自定义下拉保留专用交互。
- 统一 Geist 风格中性色、蓝色 accent、字号层级、边框/焦点/hover/disabled 状态；减少常驻高饱和按钮色。
- 验证：Desktop 27/27 组件测试与生产构建通过；生产依赖审计 0 vulnerabilities；Windows 安装器、release manifest 与 packaged smoke 通过。


## Desktop 多选模型与运行状态验收修订

- 范围：按用户四项反馈更新全局下拉箭头、模型多选、移除路由表单别名输入、修复顶栏固定的“运行时未接入”文字。沿用现有 CustomSelect、Button、ConfigStore 与 supervisor 接口，主 agent 完成实现和验证。
- 下拉：矢量箭头/勾选，展开箭头翻转，保持协议单选；模型列表支持连续勾选与键盘切换，Escape 先关闭列表，保留外层弹窗。多选列表放在弹窗流中独立滚动。
- 路由：每个所选模型按原模型名创建一条路由；通过单次 ConfigStore 事务批量保存，冲突/无效目标不部分提交；支持编辑后新增选中模型。旧路由调用名和 ID 保留兼容，新增界面无需别名。当前同入站协议下同名模型仍报冲突。
- 顶栏：读取 preload getStatus，每 3 秒刷新，区分预览/启动/运行/停止/异常/读取失败；卸载后停止轮询。启动失败由主进程回传 failed。
- 验证：Desktop 31/31、Runtime 48/48；verify:all（测试、构建、manifest、版本 smoke）通过。一次与打包同时运行的 Runtime 测试因产物正在被重建而失败；打包完成后全量复测通过。
- 实机：使用打包 Electron 的真实 preload、用户现有只读配置及渲染页面，确认 Gateway 运行中、无别名输入、多选 2 个模型、保存可用、3 个 SVG 下拉图标与 Escape 行为；1440×900/960×720 截图已检查。未在用户数据中保存测试路由，也未触发真实供应商请求。浏览器调试端点仅本次检查使用，最终重新启动为普通 Desktop。
- 截图/报告：`.tmp/route-controls-qa-s9oTPU/`；首次截图 harness 关闭调试连接没有返回响应，调整为终止自身启动的检查进程后成功退出，正式 UI/布局断言通过。
- 回退：只回退本修订的控件、表单、状态组件及批量 API/IPC 接线，保留用户已有配置与此前工作。未提交/推送/合并；完整项目 Owner 验收仍未完成。

## 2026-11-19 多上游优先级续作

- 关联需求：同名模型关联多个上游；支持调整顺序、设置连续失败阈值和 4xx/5xx 计数类别。失败的当前请求不重发；切换后的冷却时间为 60 秒，状态保存在 Gateway 进程内，重启后重置。
- 验证：`npm run verify:all`：Runtime 52/52、Desktop 32/32、Desktop 生产构建通过。聚合脚本中的 release manifest 和 smoke 针对既有 release 目录，不能用来证明该包含最新代码。
- 最新代码另行打包为 Windows x64 解包版 `apps/desktop/.tmp/priority-verification-20261119/`；新包 `--version` smoke 通过，Gateway 打包文件 SHA-256 与源码一致。真实 GUI 操作、真实 provider、安装器、签名和 Owner 验收均未执行。
- 本次审查发现并发上限计数问题：拒绝的请求会释放其他请求的名额。新增回归测试先失败后通过，现仅由实际获得名额的请求释放名额。
- `git diff --check` 对既有 CRLF 文件报告行尾空白；`git -c core.whitespace=cr-at-eol diff --check` 通过。所有现有未提交内容保留；未提交、推送、合并或部署。
- 独立审查：`PARTIAL`。发现多上游路由只有一个出站协议，保存时不验证每个目标的实际协议能力；异构协议上游发生切换后可能使用错误协议。Desktop 创建上游默认 Chat，不能简单把当前 upstream.protocol 视为可靠能力声明；此项仍需补齐设计、实现和链路验证，不能视为完成。

### Owner 范围澄清

- 用户明确：优先级用于主上游不可用或维护时，由备用上游顶替；本功能不考虑异构上游协议能力适配。上面独立审查中所列的逐目标协议适配不再作为本功能的待办或验收阻塞项。保留审查记录以反映当时发现。
- 路由所有目标继续使用该路由配置的出站协议；本次范围澄清没有改变运行时代码，也不代表真实 provider 或 Owner 完整项目验收已完成。

### 模型路由名称显示修订

- 根据用户截图，模型列改为每条路由显示首个目标模型一次；保留旧调用名提示及多上游优先级显示，不改动持久化配置与转发逻辑。
- 回归测试先复现重复名称，修正后 Desktop 测试 33/33 和生产构建通过；新 Windows x64 解包版位于 `apps/desktop/.tmp/route-name-once-20261119/`，已启动，Gateway 与 Control health 均正常。
- 实际窗口截图 `NOT_RUN`：Windows 截图返回 FrameArrived timeout；由组件测试覆盖该显示行为。未提交、推送、合并或部署。

### 集成授权修订

- 用户要求提交、推送并创建指向远程 master 的 PR，同时将任务成果合入本地主工作树 master；该授权覆盖原合同中的提交、推送及本地合并排除项，不包含 GitHub PR 合并、推送 master、发布、部署或删除工作树。
- 本次提交前复验：Runtime 52/52、Desktop 33/33、Desktop 生产构建通过。真实 provider、签名安装和 Owner 最终验收仍未执行。
- 生成的解包程序、临时截图和运行数据保留在原工作树，不纳入提交；提交后以 PR 和本地 master 的实际状态为准。
- 集成审查：发现 Gateway 在 DNS 校验后重新解析域名，可能连接未经批准的地址。现将实际连接绑定至已验证地址，同时保留原始 Host 与 TLS 主机名；新增回归先失败后通过，Runtime 53/53 通过。HTTPS 实际 provider 与跨平台重绑定验证仍未执行，已有解包版也尚未包含此修订。
- 审查中提出“编辑路由无法删除备用目标”；根据实际路径，原路由从 retained 中移除后按新 selection 保存，新增 API 回归已确认可删除，故不作为缺陷修复。
- PR CI 首次运行在干净检出缺少 Desktop 构建和发布产物，运行时两项测试失败。CI 现先构建 Desktop，release manifest 测试使用独立模拟产物并检查缺失文件；本地 Runtime 54/54 通过，CI 结果以远端实际运行为准。
- 独立复审确认地址绑定与路由删除回归，并发现非成功响应体未关闭；新增回归先失败后通过，Gateway 现在取消上游错误响应流，本地 Runtime 55/55 通过。

## PR #5 交互式真实路由测试（2026-11-19）

- 用户补充：路由操作入口应打开可交互窗口；提示内容默认 `请回复OK`，允许编辑并查看真实响应结果。
- UI：启用的运行时路由显示“测试调用”入口；窗口列出入站/出站协议与上游优先级，支持编辑提示词，展示发送状态、模型文本、HTTP 状态、请求 ID、耗时和错误。提示真实上游请求可能产生费用；浏览器 fixture 模式不展示真实调用入口。
- 链路：通过 renderer → preload IPC → Electron main → Gateway 内部 route-test 方法；Gateway 以随机 route-scoped、内存临时凭证调用标准入站端点，复用认证、路由、协议转换、failover 和 usage logging。请求结束后删除临时凭证，不写入 config/vault、不向 renderer 提供 key。
- Electron 开发与打包模式均使用 in-process runtime supervisor，使 main process 能调用 Gateway 内部 route-test 方法；普通 Node 子进程模式与原 supervisor 测试不变。
- 初次独立审查（head `09a88af`）提出三项 Important：响应体 deadline 后关闭 Gateway 请求并释放容量；发送中阻止弹窗关闭以免重复计费；Modal focus trap/restore。Minor 要求失败结果保留请求 ID/HTTP 状态/耗时。上述项均新增回归测试并修复；失败上游详情保持脱敏。
- 修复后独立复审：全部初次 Important/Minor 均已解决；无剩余 Critical/Important/Minor 发现，审查接受。Electron 窗口真实启动及真实 Provider 调用仍为 `NOT_RUN`。
- 最终验证：Desktop 45/45，Runtime 59/59，`npm run build` 通过；新增集成用例覆盖 Chat/Res/Mes 入站、日志落盘、无永久 client key、失败请求关联 metadata、拒绝与 refusal 文本、256 token 输出预算、禁用/未知 route、prompt 上限、每分钟 10 次限流、响应体超时槽位释放、客户端断连取消上游请求与 bounded server shutdown。Taste App lint 0 FAIL / 4 WARN（共享 control/modal 阴影）；CRLF 感知 diff check 通过。未触发真实第三方 provider 请求。
- 视觉检查：交互窗口在 1440px 与 390px 显示模拟 IPC 的 `OK` 响应，检查了提示词编辑、费用提示、状态/request ID/耗时，无截图覆盖行为；不代表真实 provider 已验收。
- PR #5 base 为 PR #4 分支；本轮实现提交 `4caa5a1` 已推送，PR 标题为 `feat: refine Desktop UI and add route testing`。GitHub CI 状态以 PR 实时页面为准；Owner 验收仍 pending。

### 集成授权修订（2026-11-19）

- 用户明确授权提交并合并 PR #5，将任务成果同步到主工作树，并在合并后移除任务工作树；此授权扩展原合同排除的合并/清理范围。
- PR #4 已合并至 `master`（当前合并提交 `41b2a39`），因此 PR #5 应以 `master` 为目标；本次不授权直接推送 `master`、删除任务分支、发布或部署，Owner acceptance 仍单独 pending。
- 当前 PR #5 head 为 `306c2dc`。任务工作树唯一未跟踪内容为 `.taste-skill/`，应在移除工作树前保留归档副本，不加入产品提交。
- 新鲜验证：Runtime 59/59、Desktop 45/45、Desktop 生产构建通过；GitHub runtime/desktop 检查通过。`npm run verify:all` 最终因本地缺少 `apps/desktop/release/win-unpacked/Cx-Routing Gateway.exe` 在 release manifest 步骤退出 1；release/package smoke 本次未运行。
- 集成状态：进行中，尚未改 PR base、合并远端 PR、更新本地主工作树或移除任务工作树。

## 2026-11-19 Notion / Linear / Apple HIG 专属设计 PR

- 用户要求建立专属 PR，采用 Notion 框架与架构、Linear 布局及 Apple HIG 组件规范。
- 新鲜核查 PR #4、#5 已合并，master 为 `9807fd32b27c436dde55129308799ec4d6187643`；上方 PR #5 的“集成进行中”为历史记录。
- 在仓内 `.worktree/desktop-workspace-redesign` 和 `codex/desktop-workspace-redesign` 分支开展，不继承 PR #5 的合并/删除授权。
- [设计稿](superpowers/specs/2026-11-19-workspace-redesign-design.md)记录参考分工、共享组件、六页布局、验收与回退；[任务记录](tasks/2026-11-19-workspace-redesign.md)记录合同、能力和证据。
- 当前为设计提案与 Draft PR 阶段；产品实现、Owner 设计批准与验收尚未完成。

### 1.0.1 实施修订

- 用户已批准按精修渲染图执行，并明确版本 1.0.1；专属 PR #6 继续承载六页改版及版本链路修正。
- 已完成分组导航/上下文、共享样式、路由列表/协议路径、设置版本显示；保留既有 Gateway/IPC 行为。修复独立审查指出的历史导航遮罩和 fixture/live 混合提交问题。
- 本轮 Desktop 55/55、Runtime 61/61、production build、生产依赖 audit、Windows x64 解包构建及实际 1.0.1 版本 smoke 均通过；六页三尺寸截图无页面级横向溢出。
- 原生 GUI 操作为 PARTIAL/NOT_RUN（隔离窗口未被 UI inventory 枚举）；真实 provider、NSIS 安装/签名/发布、Owner 最终验收尚未执行；没有合并或推送 master。
- 详细证据与局限：[任务记录](tasks/2026-11-19-workspace-redesign.md)。

### PR #6 集成授权

- 2026-11-19 用户授权合并 PR #6、同步主工作树并移除本任务 worktree；未授权发布或删除其他工作树/分支。
- 合并前 Desktop 55/55、Runtime 61/61、production build 新鲜验证通过；详细授权、证据归档与最终结果入口见 [任务记录](tasks/2026-11-19-workspace-redesign.md)。

## 请求日志 1.0.2（2026-11-19）

- 基于已合并 PR #6 的 master `6acebc9`，在 `.worktree/request-logs-1.0.2` / `codex/request-logs-1.0.2` 实施独立变更。
- 调用日志改名请求日志；时间/请求 ID、入站/完整协议、Token 摘要/明细分层展示，新增流/非流与首字/总耗时；真实 Gateway usage 采集和旧日志兼容同步完成，版本 1.0.2。
- Runtime 72/72、Desktop 61/61、生产构建、生产依赖 audit 与三尺寸浏览器检查通过；独立审查问题均有回归修复。
- [设计](superpowers/specs/2026-11-19-request-logs-design.md)、[计划](superpowers/plans/2026-11-19-request-logs-1.0.2.md)、[证据/审查/限制/回退](tasks/2026-11-19-request-logs.md)。真实 provider、原生安装发布、Owner 最终验收 NOT_RUN/pending；不沿用 PR #6 合并或清理授权。

### PR #7 集成授权（2026-11-20）

- 用户授权提交并合并 PR #7，将任务成果同步到主工作树 master；任务分支、worktree、运行中的 Desktop 和本地证据保留。
- Windows x64 1.0.2 解包版已实际启动，窗口响应及两项 health 正常；NSIS、真实 provider、Owner 最终验收仍为未执行/pending。集成验证及结果入口见 [任务记录](tasks/2026-11-19-request-logs.md)。

## 请求日志刷新 1.0.3（2026-11-20）

- 基于 PR #7 合并提交 `272e443`，独立分支 `codex/request-logs-refresh-1.0.3`，仓内同名工作树。
- 日志页新增刷新按钮和 1500 ms 轮询；后台读取保留筛选/详情/已有数据，失败可恢复，隐藏暂停、返回立即刷新，防止并发读取。
- Desktop 74/74、Runtime 75/75、TypeScript/生产构建与独立审查通过。生产构建受控浏览器数据测试中新日志 1556 ms 后出现；1440/768/390 布局检查通过。
- [设计](superpowers/specs/2026-11-20-request-log-refresh-design.md)、[计划](superpowers/plans/2026-11-20-request-log-refresh.md)、[证据与限制](tasks/2026-11-20-request-log-refresh.md)。原生 Electron 耗时、安装器、真实 provider、Owner 验收未执行；本任务授权止于专属 PR。

### PR #8 追加：排序与日期筛选

- 用户要求最新日志排第一，新增实时/今日/近7天/近30天。继续 1.0.3，展示层按时间倒序并复用共享分段控件；日期范围按本机日历，近7/30天含今天，均保留自动刷新。
- Desktop 88/88、Runtime 75/75、生产构建通过；独立审查发现的午夜夏令时边界已有 RED→GREEN 回归修复。三尺寸浏览器通过；包含最终修复的 Windows x64 Desktop 已重新打包并启动，现有数据保留、服务健康正常。原生日期控件自动操作 PARTIAL；详细边界见任务记录。
