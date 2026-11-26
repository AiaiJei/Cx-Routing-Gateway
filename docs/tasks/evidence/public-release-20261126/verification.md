# v1.1.10 正式发布候选验证

Owner授权revision9，沿用PR25原工作树与1.1.10版本。版本正式发布状态以GitHub Release实际状态为准。

- Runtime507/507、Desktop319/319、TypeScript/Vite build PASS，生产依赖audit0。聚焦公开更新23项、Settings14项PASS。
- 正式发布改动：匿名读取公开Releases及下载；固定仓库/资产URL和SHA256校验保留；生产IPC不读旧Token，Settings说明无需写入/发布权限。CI GITHUB_TOKEN设contents:read。
- README包含当前1.1.10、Codex完整能力、匿名更新、下载入口、公开权限边界及Apache-2.0 LICENSE。Codex通用prompt的Apache许可证和NOTICE保留。
- 公开前扫描426个文本文件和207个本地历史commit。仅出现人工确定的单元测试假Token github_pat_replacement_0987654321，非真实凭证。无其他命中；扫描不是对所有第三方内容的绝对保密证明。
- 历史revision2–8原生/协议/UI/集成审查已通过，证据保留。新增release独立agent分派连续空任务及模型effort失败，未产生有效审查；发布改动独立审查NOT_RUN，协调者完成源码、异常/匿名请求及完整测试复核，不冒称独立PASS。
- Windows x64 NSIS+Portable、manifest/hash、包内模块一致性、两次隔离启动及GitHub资产匿名下载由发布执行阶段完成。最终Git/Release/Desktop状态见本聊天结尾与仓内临时release9档案。
- 原真实Codex代理/账号配置保留。正式包意味着本地和发行验证完成，不代表已验收全部真实提供商模型能力。

任务目录/旧程序保留；未授权删除。所有写入来自终端/apply_patch，当前宿主未暴露AWG MCP。
