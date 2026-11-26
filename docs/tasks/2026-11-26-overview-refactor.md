# 总览重构

- 任务：`CXRG-OVERVIEW-REFACTOR-20261126`，合同修订 5。
- 工作树：`.tmp/worktrees/overview-dashboard-20261126`，分支 `codex/overview-dashboard-20261126`，基于 `606d069e7b53efa492c86e32856d334d313fbaeb`。
- 范围：总览页面、局部组件与样式、读取现有 Gateway/usage 数据所需的数据映射，以及对应测试和证据。
- 不做：改共享应用壳层、增加服务端时序 API、真实上游探测、引入图表依赖、合并或发布。
- 参考与设计：见 `docs/superpowers/specs/2026-11-26-overview-refactor-design.md`。
- 当前阶段：用量统计、模型调用量/结果/成功率分析已实现，支持统计范围切换和刷新；沿用已确认的图标层级，在原 Draft PR [#27](https://github.com/AiaiJei/Cx-Routing-Gateway/pull/27) 交付。本轮独立审查再次因 `unsupported_feature`（`Res->Chat`）失败，没有形成结论。
- 数据口径：按当前保留日志统一计算，Token 仅累计已上报字段，缺失不当作 0；缓存不重复累加，每项注明上报覆盖。模型行展示请求模型标识，不伪称实际命中的上游模型。
- 证据：桌面套件 40 文件 / 345 测试、生产构建通过，局部视觉 lint 0 FAIL / 0 WARN；1440/768/390px 下实际尺寸、范围切换、刷新与模型表滚动通过。渲染检查 0 FAIL / 4 WARN，截图和交互报告位于 `docs/tasks/evidence/overview-refactor-20261126/visual-usage-analysis/`，总记录见 `docs/tasks/evidence/overview-refactor-20261126/acceptance.md`。
- 限制：真实 Desktop IPC / runtime 页面和 Owner 实际环境验收未运行；浏览器截图是明确标注的非实时示例数据。
- 下一步：Owner 确认新版用量/模型布局；审查通道恢复后由独立审查者补审，并另行进行真实 Desktop 验证。当前不合并、不发布。
