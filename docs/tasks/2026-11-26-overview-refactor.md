# 总览重构

- 任务：`CXRG-OVERVIEW-REFACTOR-20261126`，合同修订 6。
- 工作树：`.tmp/worktrees/overview-dashboard-20261126`，分支 `codex/overview-dashboard-20261126`，基于 `606d069e7b53efa492c86e32856d334d313fbaeb`。
- 范围：总览页面、局部组件与样式、读取现有 Gateway/usage 数据所需的数据映射，以及对应测试和证据。
- 不做：改共享应用壳层、增加服务端时序 API、真实上游探测、引入图表依赖、合并或发布。
- 参考与设计：见 `docs/superpowers/specs/2026-11-26-overview-refactor-design.md`。
- 当前阶段：模型分析已从可展开表格改为固定高度的横向对比图，每组最多 5 个模型，可翻组或下拉定位，并切换调用量、Token、成功率、耗时。只保留一个模型详情区；继续在原 Draft PR [#27](https://github.com/AiaiJei/Cx-Routing-Gateway/pull/27) 交付。独立审查仍因 `unsupported_feature`（`Res->Chat`）失败，没有形成结论。
- 数据口径：按当前保留日志统一计算，Token 仅累计已上报字段，缺失不当作 0；缓存不重复累加，每项注明上报覆盖。模型行展示请求模型标识，不伪称实际命中的上游模型。
- 证据：桌面套件 41 文件 / 351 测试、生产构建通过，局部视觉 lint 0 FAIL / 0 WARN。1440/768/390px 下，用 2、60、200 个模型验证同屏宽模块高度完全一致，绘图区均为 220px，轴标签无重叠、页面无横向溢出。渲染检查 0 FAIL / 3 WARN，当前截图和检查入口位于 `visual-model-chart/` 与 `verify-model-chart.mjs`，总记录见 `docs/tasks/evidence/overview-refactor-20261126/acceptance.md`。
- 限制：真实 Desktop IPC / runtime 页面和 Owner 实际环境验收未运行；浏览器截图是明确标注的非实时示例数据。
- 下一步：Owner 确认模型图表布局；审查通道恢复后由独立审查者补审，并另行进行真实 Desktop 验证。当前不合并、不发布。
