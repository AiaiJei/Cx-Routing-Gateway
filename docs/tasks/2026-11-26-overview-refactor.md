# 总览重构

- 任务：`CXRG-OVERVIEW-REFACTOR-20261126`，合同修订 7。
- 工作树：`.tmp/worktrees/overview-dashboard-20261126`，分支 `codex/overview-dashboard-20261126`，基于 `606d069e7b53efa492c86e32856d334d313fbaeb`。
- 范围：总览页面、局部组件与样式、读取现有 Gateway/usage 数据所需的数据映射，以及对应测试和证据。
- 不做：改共享应用壳层、增加服务端时序 API、真实上游探测、引入图表依赖、合并或发布。
- 参考与设计：见 `docs/superpowers/specs/2026-11-26-overview-refactor-design.md`。
- 当前阶段：已按 Owner 最新澄清，将当天全部模型聚合为一张环形调用占比图，每个模型独立色块，取消分组和翻页。图例固定 288px 高、内部滚动，只保留一个模型详情区；继续在原 Draft PR [#27](https://github.com/AiaiJei/Cx-Routing-Gateway/pull/27) 交付。独立审查通道尚未恢复，没有形成结论。
- 数据口径：默认本地自然日零点至本次读取，模型色块合计与同范围用量统计一致；可明确切换近 24 小时或已保留记录。Token 仅累计已上报字段，缺失不当作 0，缓存不重复累加。模型使用请求模型标识，不伪称实际命中的上游模型。独立的 24 小时趋势按自己的完整窗口统计。
- 证据：完整套件 41 文件 / 353 测试通过；最后配色调整后再次通过 6 项图表测试、构建和浏览器矩阵。1440/768/390px 下，2/6/60/200 个模型均在同一张图中，颜色匹配图例，合计一致，昨天记录正确排除，模块不增高。源码 lint 0 FAIL / 1 WARN（RGB 编码补零），空示例数据渲染检查 0 FAIL / 4 WARN。当前入口为 `verify-model-distribution.mjs`，证据位于 `visual-model-distribution/`，总记录见 `docs/tasks/evidence/overview-refactor-20261126/acceptance.md`。
- 限制：真实 Desktop IPC / runtime 页面和 Owner 实际环境验收未运行；浏览器截图是明确标注的非实时示例数据。
- 下一步：Owner 确认模型图表布局；审查通道恢复后由独立审查者补审，并另行进行真实 Desktop 验证。当前不合并、不发布。
