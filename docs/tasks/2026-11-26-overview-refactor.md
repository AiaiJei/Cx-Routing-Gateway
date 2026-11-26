# 总览重构

- 任务：`CXRG-OVERVIEW-REFACTOR-20261126`，合同修订 3。
- 工作树：`.tmp/worktrees/overview-dashboard-20261126`，分支 `codex/overview-dashboard-20261126`，基于 `606d069e7b53efa492c86e32856d334d313fbaeb`。
- 范围：总览页面、局部组件与样式、读取现有 Gateway/usage 数据所需的数据映射，以及对应测试和证据。
- 不做：改共享应用壳层、增加服务端时序 API、真实上游探测、引入图表依赖、合并或发布。
- 参考与设计：见 `docs/superpowers/specs/2026-11-26-overview-refactor-design.md`。
- 当前阶段：合同与隔离工作树已建立；设计待 Owner 审阅；功能实现、测试、独立审查和 PR 均未完成。
- 下一步：Owner 审阅设计后，按获批范围先写测试，再实现并逐级验证。
