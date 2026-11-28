# 总览 2.0 设计与验证来源

- Owner 确认：本对话中精修图后回复“确认，执行。”，批准当前总览实施及专属 PR；不含其余六页改版或合并/发布。
- 视觉基线：approved-overview.jpg，SHA-256 与 docs/tasks/desktop2-overview-contract.json 的 design_gate.sha256 一致。
- 前端提取：Codex-AWG context_get 对 AppShell、导航、图标、tokens/shell CSS、OverviewPage、趋势/模型组件和用量领域函数的完整读取。工作树创建、路径授权与 JSONL 证据由 AWG 工具检查；文件编辑与测试由终端/补丁工具执行。
- AWG Desktop 参考清单：插件 references/frontend-reference-sources.md。
- 已阅读 Linear 官方设计更新：https://linear.app/now/behind-the-latest-design-refresh ，采用主内容优先、减少装饰分隔与图标噪音。
- 已阅读 Apple HIG Feedback：https://developer.apple.com/design/human-interface-guidelines/feedback ，采用状态紧邻对象、结果明确和出错可恢复。
- Things 侧栏参考未用于更改侧栏，因为 Owner 明确要求原侧栏不动。Base UI 仅作为已有清单中的参考，没有新增组件框架或依赖。
- 依赖：npm ci 使用既有锁文件。安装报告 6 项 moderate 审计结果和既有弃用警告；本任务未执行 audit fix、未扩大升级范围。
- 原型 fixed clock 不进入生产源。浏览器视觉检查的样例时钟由隔离验证服务器注入并明确标记，仅证明真实 UI 构建的显示效果。
