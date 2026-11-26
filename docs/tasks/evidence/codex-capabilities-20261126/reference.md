# CC Switch 与 Codex 对照

2026-11-26；只读公开源码，无 CC Switch 私有配置/数据库/账户访问。CC Switch main 固定提交 aa4a8c63365d1d3ed2eb27872a7da6a0709d0629，原始文件保存在 revision7 临时取证目录。

| 来源 | 观察 | 本轮处理 |
| --- | --- | --- |
| [modelMetadata.ts](https://github.com/farion1231/cc-switch/blob/aa4a8c63365d1d3ed2eb27872a7da6a0709d0629/src/lib/modelMetadata.ts) | KnownModelMetadata 包含 contextWindow/maxOutputTokens/reasoningEfforts/inputModalities；按同地址预设、models.dev同供应商、原厂条目补空字段，并有GPT窗口封顶策略 | 建立逐模型完整配置链路，不从转售商模型名猜官方能力，不引入全局GPT封顶或未经核实的供应商预设 |
| [codex_config.rs](https://github.com/farion1231/cc-switch/blob/aa4a8c63365d1d3ed2eb27872a7da6a0709d0629/src-tauri/src/codex_config.rs) | 模型目录写context_window/max_context_window/input_modalities；图片能力与工具配置分离 | 显式逐模型配置写入新schema4目录；仍读取旧schema1–3 |
| [transform_codex_chat.rs](https://github.com/farion1231/cc-switch/blob/aa4a8c63365d1d3ed2eb27872a7da6a0709d0629/src-tauri/src/proxy/providers/transform_codex_chat.rs) | reasoning分支消费公开文本；没有把其他提供商opaque密文作为Chat正文 | 目标不能使用的密文不再阻断，保留正文和工具历史，日志安全计数 |
| [transform_codex_anthropic.rs](https://github.com/farion1231/cc-switch/blob/aa4a8c63365d1d3ed2eb27872a7da6a0709d0629/src-tauri/src/proxy/providers/transform_codex_anthropic.rs) | 只恢复自身前缀封装的签名thinking；不会把其他厂商密文伪造成Anthropic签名；Codex缺max_output_tokens时补Messages必需上限 | 不解密/伪造签名；明确配置的输出上限在Gateway实际执行 |
| [codex_client_catalog.rs](https://github.com/farion1231/cc-switch/blob/aa4a8c63365d1d3ed2eb27872a7da6a0709d0629/src-tauri/src/services/provider/codex_client_catalog.rs) | app-server保留启动时目录；单开新会话不保证重载 | 保存启用后提示完整退出并重启Codex |
| OpenAI Codex官方 openai_models.rs；安装版0.167.0 | ModelInfo定义context_window/max_context_window/input_modalities，未定义通用max_output_tokens；默认有效窗口95% | 128000目录窗口实际收到modelContextWindow121600；输出8192由网关上游请求直接验证 |

这是源码对照与本地实证，不声称复制CC Switch全部功能。Gateway配置提供文本、图片、工具、推理档位和限制支持；其他媒体/厂商专用字段不虚报支持。真实模型参数须按提供商官方说明录入，填值不代表已验收提供商。
