# PR25 revision7：历史兼容与模型能力

项目 cx-routing-gateway / aiaijei-cx-routing-gateway；任务 CXRG-CODEX-ROUTE-MANAGEMENT-20261125；合同 revision7。继续已核对的 codex/codex-route-management-20261125 工作树。Owner 本轮明确要求完成修复；本地实现、测试、独立审查、内测包属于延续范围；无提交、推送、合并、发布、真实账户配置或提供商调用。

## 设计和接口

- Res 转 Chat/Mes 时校验 reasoning 项结构，保留公开摘要元数据，忽略目标协议无法使用的 opaque encrypted_content。不得把密文变成正文、解密或伪造签名；Res 直通完整保留。保留正文、工具定义、调用和结果的顺序及 ID，未知业务历史仍明确拒绝。通过日志记录只有类型和数量的兼容提示。
- 图片经规范化媒体块在 Res/Chat/Mes 间转换，覆盖 HTTPS URL 和受支持 base64 data URL；不下载图片。未支持的文件 ID、音视频和块必须明确报错，不能丢失。文本旧路径保持兼容。
- 每条模型路由可选 capabilities：contextWindow、maxOutputTokens 为正安全整数（最大 100000000，输出不超过已知窗口）；inputModalities 为包含 text 的唯一 text/image 数组；reasoningEfforts 为唯一标准强度 none/minimal/low/medium/high/xhigh/max 数组，空数组表示不接受推理参数；tools 为可选布尔值。未知字段拒绝。null 清除，省略保留。能力是操作者按供应商官方资料录入的配置，不声称已验证供应商。
- 批量保存新增 modelCapabilities: [{modelId, capabilities: object|null}]，绑定已选模型并防重复。原 reasoning min/max 是路由约束；有能力清单时目录仅显示交集，空交集拒绝保存。未知旧模型兼容旧默认，不从模型名推断能力。
- 最大输出在实际网关请求生效：未传时取已配置上限，超过上限降到上限，合法更小值保留；无配置保持旧行为。明确不支持图片/工具/推理的请求安全拒绝。contextWindow 写入模型目录供客户端管理上下文，不用字符数冒充 token 精确计数。
- Codex 模型目录新版本保留旧版本读取和哈希校验。context_window/max_context_window、input_modalities、supported_reasoning_levels 按逐模型配置生成。Codex 当前 ModelInfo 无 max_output_tokens 通用字段，不能伪造客户端支持；输出上限由网关执行，元数据中可审计。刷新需显式保存启用，并提示完整重启 Codex 以重载启动目录。
- UI 延用现有路由编辑、表单和样式，新增逐模型的能力输入，保存中禁重、错误保留输入，宽窄视口检查。直连自定义模型若扩展同样采用逐模型配置；原官方和导入 recipe 保留。

## 证据和回退

先失败测试再最小实现；单元、HTTP 本地上游、安装版 Codex 隔离目录、真实 Electron/浏览器界面、完整 Runtime/Desktop/build、独立审查分别记录。真实供应商与 Owner 验收 NOT_RUN。

改动前冻结 .tmp/codex-route-management-20261125/revision7/before.json、before-manifest.json、before-status.txt。只回退本轮补丁，不覆盖已有多轮未提交修改。AWG MCP 固定绑定主仓，支线 PROJECT_ROOT_MISMATCH；支线写入来自终端/apply_patch，经人工合同核对，未经过 MCP 校验。

## 审查修订

Res/Chat 的图片 detail high/low 在 Mes 没有同等参数：保留图片，明确记入 compatibilityWarnings 的 image_detail_omitted 计数，不泄露图片地址或内容。auto/缺失不计。Chat 非 user 角色图片和图片工具结果无法表达，安全400，不改写历史角色。此边界不阻止已验证 Codex 用户图片续聊。当前本轮模型能力配置覆盖 Gateway 路由；官方直连/原样导入方案保持原提供商目录，未扩展自建直连模型目录编辑。
