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
