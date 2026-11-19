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
