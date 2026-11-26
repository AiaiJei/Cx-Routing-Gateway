# 总览重构

- 任务：`CXRG-OVERVIEW-REFACTOR-20261126`，合同修订 4。
- 工作树：`.tmp/worktrees/overview-dashboard-20261126`，分支 `codex/overview-dashboard-20261126`，基于 `606d069e7b53efa492c86e32856d334d313fbaeb`。
- 范围：总览页面、局部组件与样式、读取现有 Gateway/usage 数据所需的数据映射，以及对应测试和证据。
- 不做：改共享应用壳层、增加服务端时序 API、真实上游探测、引入图表依赖、合并或发布。
- 参考与设计：见 `docs/superpowers/specs/2026-11-26-overview-refactor-design.md`。
- 当前阶段：实现与本机验证完成；独立评审因本地评审代理路由不可用而未运行；专属 PR 待创建。
- 证据：`docs/tasks/evidence/overview-refactor-20261126/acceptance.md`，浏览器宽窄屏截图和报告位于同目录 `visual/`。
- 限制：真实 Desktop IPC / runtime 页面和 Owner 实际环境验收未运行；浏览器截图是明确标注的非实时示例数据。
- 下一步：推送本任务分支并创建 Draft PR，等待独立审查；不合并、不发布。
