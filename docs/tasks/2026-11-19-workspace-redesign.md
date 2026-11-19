# CXRG-WORKSPACE-DESIGN-2026-11-19

## 绑定与授权

- 项目：Cx-Routing Gateway；仓库：`AiaiJei/Cx-Routing-Gateway`。
- 原始请求：建立专属 PR，采用 Notion 框架与架构、Linear 布局、Apple HIG 组件库。
- 合同：`.codex/awg-task.json`；分支：`codex/desktop-workspace-redesign`；目标：`master`。
- “建立专属 PR”授权覆盖必要的设计提交、任务分支推送、Draft PR 创建，不包含合并或发布。
- 独立 worktree：仓内 `.worktree/desktop-workspace-redesign`；创建前确认路径/分支无冲突。
- 用户要求仓内目录，原生创建工具无目标路径参数，故使用 `git worktree add` 并 `attach_worktree`。只向本地 `.git/info/exclude` 追加新 worktree 路径。
- 未修改主工作树的产品文件或既有未跟踪部署文件。

## 新鲜现状与成果

- `git rev-parse --show-toplevel` 已核对主仓库与任务 worktree；本地/远程 master 为 `9807fd32b27c436dde55129308799ec4d6187643`。
- GitHub 确认 PR #4、#5 已合并，PR #1 仍打开；本次不复用其他任务分支。
- 原合同仍以 PR #5 为 active；本分支替换为新合同，旧版本保留在 Git 历史，不沿用其合并授权。
- 已读 App/AppShell、PageHeader、tokens、六页相关入口、WorkspaceClient、useWorkspace、类型与 fixture。
- 浏览器已读用户三条链接及 Notion 工作区帮助、HIG Components / Layout and organization。
- [设计稿](../superpowers/specs/2026-11-19-workspace-redesign-design.md)；[静态示意](../concepts/workspace-redesign.svg)。
- 产品源码、依赖、后端与配置 schema 未改；具体设计尚待批准。
- 用户已回复“采用信息架构，改版现有六页（推荐）”，确认范围不含可编辑块与嵌套页面。

## CAPABILITY

当前 session 技能和工具目录已检查，单一 AWG 0.4.1 provider 可区分，无重复 Superpowers provider 冲突。

| 能力 | 状态与用途 |
| --- | --- |
| using-superpowers | 已读取工作流和 Codex 适配 |
| awg-workspace-governance | 已读取；核对合同、范围、证据与运行时边界 |
| brainstorming | 已读取；设计与独立 builder check，批准待用户 |
| design-taste-frontend | 已读取 App screen 适用规则；用户参考优先，不随机替换方向 |
| using-git-worktrees | 已读取；仓内独立 worktree，关联当前对话 |
| awg-repo-map | 已读取；MCP `NOT_RUN`：本基线无 `.codex/repo-map.json` 与可核实 workspace_id，使用有界源文件读取，不猜 ID |
| verification-before-completion | 已读取；提交前检查文档结构、路径与 diff |
| requesting-code-review | 已读取；与 builder check 合并为一次独立只读设计审查 |
| computer-use | 技能已读取；CUA 浏览器读取参考，无 Windows 原生 UI 操作 |
| writing-plans / TDD / executing-plans / subagent-driven-development | `NOT_RUN`：设计阶段，不提前实施 |
| systematic-debugging / receiving-code-review / finishing-a-development-branch | 按阶段使用；本轮无产品 bug 修复或合并决策 |
| 其他媒体、Office、安装、平台问答技能 | 与本次文档 PR 不相关，未调用 |
| 实际 runtime / Desktop 原生插件、Hook 激活 | `NOT_RUN`，静态能力不证明运行时验收 |

## 审查与验证

- 独立 builder check：PASS。独立 reviewer 核对当前基线、六条 URL、现有组件、fixture 与 SVG、真实测试链路、任务合同；结论 `nothing important left`，无重大设计问题或实质矛盾。它不等于产品代码审查或 Owner 批准。
- 文档/合同/静态图验证：PASS。JSON 解析、合同分支/基线一致、SVG XML 与 1440×900 声明、4 个仓内文档链接、5 个变更路径范围检查及 CRLF 感知 diff check 通过。
- 静态图浏览器检查：PASS。文字、导航分组、协议表格和预览标记可见且无重叠。全页截图 API 首次超时，浏览器普通截图成功。只检视静态设计，不视为响应式或产品交互验收。
- Runtime / Desktop tests / build：本次未执行，仅文档变更；旧结果不继承。
- 产品视觉、真实 IPC、真实 provider、发布包、Owner acceptance：`NOT_RUN` / pending。
- PR URL 和最终提交由创建后的 GitHub 元数据提供，不预占编号。

## 回退

回退本任务文档提交或关闭 Draft PR；无数据迁移。保留分支与 worktree，实施前需设计批准和合同修订。

## 2026-11-19 渲染图精修修订

- 用户要求：“精修下细节吧；这个渲染图；”。授权更新当前设计材料并续更 PR #6，未视为批准产品实现。
- 范围：字体层次、统一导航图标、上下文栏、表格列宽与基线、协议路径图、缩小设计注释，以及新增 2880×1800 PNG 导出。字体使用当前 Windows 可用的 Segoe UI / Microsoft YaHei UI；产品仍保留既定 Geist 字体方案。
- 依赖与复用：导航图标复用现有 NavigationIcon 的 20px 几何；模型、调用名、上游 hostname 和协议仍来自两条 fixture；无新增服务或功能按钮。
- 主 agent 负责 SVG、文档与图像检查；独立 reviewer 负责最终设计一致性审查。验收是图像可读、无遮挡、字段与来源一致，PNG 与 SVG 对应；回退本次设计提交即可恢复上一稿。
- 本地工具：使用已打包的 sharp 在 144 DPI 栅格化，不安装产品依赖；临时对比图保留在仓内 `.tmp/workspace-render-refinement/`（本地 exclude），不纳入产品提交。
- visualize 技能已查看但未用于输出：本次是对既有仓内设计图的精修，不是新建对话可视化；沿用 SVG/PNG 工件。应用层 tests/build、真实 IPC/Provider 与响应式验收不属于此次静态图修改。
- 图像检查：PASS。已查看最终 PNG；浏览器读取 64 个文本边界，重叠 0、超出画布 0；SVG 引用、JSON、5 个文档链接和变更范围检查通过；重新栅格化逐字节比对确认 PNG 与最终 SVG 一致。
- 视觉复核：路由表仍是主要内容；左右 32px 边距、列标题与数据共享左边缘；颜色仅用于协议，主按钮为中性深色；两条计数与数据一致；说明区没有额外图例或虚构指标。移动端产品画面未在本次静态图任务检验。
- 独立 reviewer 复核：无阻塞问题。已独立查看 PNG、确认 2880×1800 与 2 倍关系、六列对齐、fixture/hostname/协议/计数一致、图标复用和仅设计范围。未重跑产品测试，不替代 Owner 验收。

## 2026-11-19 实施授权与进度

- 用户明确：“按渲染图执行更新，版本号定义1.0.1”。具体设计和实施现已批准，最终产品验收仍独立 pending。
- [实施计划](../superpowers/plans/2026-11-19-workspace-redesign-1.0.1.md)采用主 agent 连续实施、最后独立审查；原任务分支续作，不再创建 worktree。
- 新鲜基线：Desktop 45/45、Runtime 59/59、生产构建通过。
- Task 1：分组导航/上下文、窄屏焦点控制、六页共享样式、模型路由六列/安全 hostname/三段协议说明，以及加载和错误隔离已实现。
- 新增测试先复现 5 个失败，再实现通过。原有 9 个同步访问 fixture 的测试调整为等待工作区读取完成；表格滚动 containment 保留。Desktop 50/50、生产构建通过。
- 版本链路、生产构建截图、隔离 Electron 以及最终独立审查继续执行；上述为阶段证据，不作为最终完成声明。

## 1.0.1 实施结果与最终证据

- 六页已使用分组侧栏、当前位置、中性选中/主按钮、统一列表/表单和响应式间距。模型路由按精修图呈现模型/调用名、脱敏 hostname、六列状态、三段协议方向；真实编辑、多目标优先级和测试调用继续复用原链路。
- Desktop `package.json` 与 lockfile 根版本为 **1.0.1**，设置页直接读取 package 元数据；发布校验使用相应安装器/blockmap 文件名与版本。更新函数要求显式 currentVersion，Electron 原有调用已提供；CLI 默认读 package，并修复带空格路径的启动判断。未修改配置 schema version 1。
- Task 2 先复现版本/CLI 回归失败后修复；最终 Desktop **55/55**（16 files）、Runtime **61/61**、TypeScript/Vite production build 通过。生产依赖 audit **0 vulnerabilities**。依赖安装报告的 6 项 moderate 位于开发依赖范围，本次未进行无关依赖升级。
- Taste App lint **0 FAIL / 3 WARN**；三条警告均命中 `box-shadow: none`（搜索字段/多选列表），没有实际静态阴影。仅弹窗与浮动菜单保留已有浮层阴影；协议紫色沿用既有 Res 语义，属于用户指定设计。
- 最终生产构建使用 CUA 检查六页 **1440×900 / 768×1024 / 390×844**，共 18 张视口截图，均无页面级横向溢出。实际 CSS 视口由 DOM 读取核对；宽表格在可命名、可聚焦容器内部滚动。初版日志/凭证窄列导致断词，已调整最低列宽并复拍。已查看全部最终截图及此前完整长页面截图。
- 浏览器行为：窄屏菜单打开聚焦当前页、Esc 回到触发按钮；多选 Escape 只关闭列表，取消弹窗返回触发按钮；实际同页历史回退后导航关闭、遮罩消失且 focus 为 `main-content`。
- 静态视觉复核：路由列表为主要内容，标题/内容共用边缘，单页一个主要操作，数字与真实 fixture 计数一致。小屏保留字段并明确滚动，不用省略协议信息换取整齐。空列表与读取失败由测试覆盖，未把模拟 IPC 结果描述为真实 provider 验收。
- 全部截图、指标、测试日志、执行 ledger 和本地包保留于仓内 `.tmp/workspace-implementation-1.0.1/`，不提交生成产物。最终截图以 `final-` 开头，`final-visual-metrics.json` 记录尺寸与溢出结果。

### 独立审查与修复

- 独立 reviewer 对 `9807fd3 → 36efbc8` 完成只读审查，独立运行界面关键测试 19/19 与版本测试 9/9。
- 发现 P2：历史回退没有关闭窄屏导航。新增 history navigation 回归先失败，再将 location 变化统一接入导航关闭、滚动恢复和主内容焦点；浏览器再次确认。
- 发现 P2：routes/upstreams/credentials 的被动 effect 同步可能在单次 DOM commit 中将 fixture 与 live 标签混用。新增 React Profiler 回归逐次检查三个页面提交，三项先失败；共享 `useWorkspaceCollection` 将局部修改绑定到当前数据快照，三项通过，既有增删改回归仍通过。
- 两项均已修复；无未解决的 Critical/Important，未列 deferred minor。遵循 native execution 的一次最终审查流程，修复通过针对性 RED→GREEN 与全套测试验证，未将其写成额外独立复审通过。
- Reviewer 未代判的范围：原生 GUI 见下方 PARTIAL；既有后端/更新信任模型未改且不宣称重新验证；最终 Owner 接受、合并、发布不由代码审查授予；全套 tests/build/audit 使用主任务的本轮证据。

### Electron 与打包边界

- 本地 x64 解包构建通过，位置：`.tmp/workspace-implementation-1.0.1/package/win-unpacked/`；最后源码构建后重新打包，实际 `smoke-packaged` 验证退出码 0 且版本输出 **1.0.1**。该包未签名，使用现有默认 Electron 图标；未生成本轮 NSIS 安装器或发布正式版本。
- 隔离 QA 使用仓内独立 userData 和端口 4618/4619，加载实际生产 `dist/index.html`。Electron `did-finish-load` 记录版本 1.0.1、隔离路径与 file URL，Gateway/control 的 health 均为 ok；测试进程已停止。
- 原生 GUI/真实 preload 操作 **PARTIAL / NOT_RUN**：进程和窗口加载事件存在，但 CUA Windows inventory 未枚举此隔离窗口，因此未宣称点击原生窗口或实际设置写入成功。真实 provider、安装器安装、签名、发布、Owner 最终验收仍 **NOT_RUN / pending**。

### CAPABILITY 补充

- 已使用 writing-plans、test-driven-development、executing-plans、systematic-debugging、receiving-code-review、requesting-code-review、verification-before-completion 和 finishing-a-development-branch；现有用户执行/PR 授权覆盖继续实现、提交、推送，无二次方案审批暂停。
- Repo MCP 保持 NOT_RUN（本 worktree 无注册 workspace_id）；未把静态 MCP/Hook 配置当成运行证据。
- Taste browser inspector 的测量改由可用 CUA 完成，保留真实 DOM 尺寸与截图；未声称运行 inspect.mjs。采用用户已定渲染方向，不随机重抽风格。
- 归档决策：沿用现有独立 worktree 和仓内 scratch，保留证据；不按技能默认清理删除，遵循用户“归档时保留成果”的要求。

### PR 集成状态

- 实施提交 `b8ff64f` 已推送 PR #6；GitHub push / pull_request 两组 Runtime 和 Desktop 检查均通过，package 按工作流条件跳过。
- PR 标题/描述已改为最终 1.0.1 实现；仍为 Draft。后续仅证据文档修订，当前 head 与最终 CI 以 PR 元数据为准。
- 本地 x64 包的 14 个生产 dist 文件与最终生产构建逐字节一致；首次校验工具使用了 POSIX 分隔符导致 Windows asar 查找失败，改用原生路径后通过，不是包文件缺失。
- 主工作树与远端 master 仍为 `9807fd3`，已有未跟踪目录保留。没有合并、直接推送 master、发布或删除 worktree。

## 按钮布局与内部滚动修订（2026-11-19）

- 用户截图要求：优化模型路由和凭证页操作按钮；上下滚动放入内容区，滚动条全局统一细小、淡化。
- 最小方案：运行时表格把操作从状态单元格拆到独立列；复用 Button 和共享行操作样式，预留固定宽度、防止按钮任意换行；保持现有功能与 1.0.1 版本。
- 外壳使用固定窗口高度，标题栏/侧栏/上下文栏不随内容滚动，main 内部滚动；弹窗、列表和表格沿用原生滚动，全局浅灰 6px 轨道/滑块样式与 hover 反馈。切换页面回到主内容顶部。
- 主 agent 实现和验证；独立审查检查布局、键盘与滚动回归。验证两页真实 IPC 只读画面、窄屏和长列表、现有 Desktop suite/build；不触发真实上游请求或凭证变更。
- 回退本轮提交即可恢复原按钮布局和外层滚动；不涉及持久化数据或 API 合同。新包输出到仓内独立目录，确认后重启到新版用于查看。
- Desktop 已在用户要求下启动；原生 AX 已确认真实 preload 数据和“Gateway 运行中”。截图通道仍曾 FrameArrived timeout，不据此冒称原生截图通过。
- 本轮完成：运行时独立操作列；路由操作固定网格让启用/停用行的编辑、启停、删除横向对齐；凭证操作单行。窗口内部 main 滚动；全局 6px 淡灰原生滚动条，透明轨道，无箭头，hover 加深；页面跳转复位内部滚动。
- 回归：滚动复位断言先失败（240 → 预期 0），修复后 Desktop 55/55、production build 通过；独立审查相关 25/25 和 build/diff check 通过，无实质问题。
- 浏览器合成 IPC 数据验证：两页 1440/960/390 的操作分组换行数 0、越界数 0；六页 1440/390 的 document 高度均等于视口，滚动条实测 6px。长列表滚到底时 documentTop=0、mainTop≈846、标题栏 y=0、上下文栏 y=36；切页 mainTop=0。Modal 仍在视口内且滚动条一致。
- 验证中发现绝对定位 sr-only 文本的包含块落到根文档，导致隐藏外层仍可被键盘滚动；将 main 设为相对定位后根文档高度和位置恢复正确。
- 截图与指标位于 `.tmp/button-scroll-refinement/`；测试数据明确为合成数据，不代表真实供应商调用。未操作真实路由/凭证的写入按钮。
- 新 Windows x64 包位于 `.tmp/button-scroll-refinement/package/win-unpacked/`，版本 smoke 为 1.0.1；构建未覆盖当前运行的旧包。
- 准备重启时 CUA 收到用户物理 Escape 停止信号；已停止所有后续电脑操作，未关闭或重启当前 Desktop。新包的启动留待用户继续操作；没有以 shell 绕过 UI 停止。
