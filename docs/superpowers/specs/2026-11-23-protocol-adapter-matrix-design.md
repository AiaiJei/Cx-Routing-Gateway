# Six-Direction Protocol Adapter Matrix

状态：待 Owner 批准。日期：2026-11-23。

## 目标

让 Gateway 对 Res（OpenAI Responses）、Mes（Anthropic Messages）和 Chat（OpenAI Chat Completions）提供完整的六条跨协议转换：Res→Chat、Res→Mes、Mes→Res、Mes→Chat、Chat→Res、Chat→Mes。Codex 请求需要的工具调用和结构化控制字段必须得到明确处理；不能因它们出现在跨协议请求中而统一返回 400。

## 当前证据

- Gateway 已有 normalize() 和 outboundBody()，但 normalize() 目前看到 tool_choice、response_format、modalities、logprobs 或 n > 1 就抛出 unsupported_feature。
- 现有三种协议的基础文本、单函数工具、工具结果和部分流式转换已经存在，但字段处理分散在一个大模块中，没有统一能力矩阵，也没有六方向对称测试。
- 仓库 Phase 0 契约要求使用 provider-neutral conversation model，并将六条方向的文本、指令、工具、结构化输出、流式和错误行为逐项分类。
- 用户明确要求六条方向都可用，当前 Codex 的 Res → Chat 错误是该缺口的直接证据。

## 方案比较

1. 统一中间表示 + 六个方向适配器（采用）：每个协议先解析成 NormalizedRequest/NormalizedResponse，再由目标协议序列化；能力判断集中在 profile，六方向共享工具和错误语义，测试可对称覆盖。
2. 在现有 normalize() 上逐字段打补丁：短期改动少，但字段和方向会互相耦合，容易只修 Res→Chat 而遗漏其他五条，不采用。
3. 仅同协议直通、跨协议文本降级：无法满足 Codex 工具/结构化请求和用户要求的六方向能力，不采用。

## 能力矩阵

六条跨协议方向统一支持：有序文本、单/多条 system/developer 指令、输出 token 上限、函数工具定义、函数调用、工具结果轮次、单/并行工具流片段、完成/长度限制/过滤终止原因、请求 ID 和脱敏 usage。目标协议不支持的字段返回稳定的 unsupported_feature，并包含安全的 field 与 direction 元数据。

- tool_choice：映射为 Chat tool_choice、Mes tool_choice、Res tool_choice；auto、none、required 和指定函数保持语义，目标不支持指定函数时返回字段错误。
- response_format / Responses text.format：目标协议支持 JSON object/schema 时转换对应结构；仅目标不支持的 schema 约束才拒绝，不能因为字段存在就拒绝整条请求。
- n：仅 1 或省略；大于 1 返回明确的 multiple_candidates_unsupported，不再误报为一般协议错误。
- logprobs、图像/音频/文件、供应商私有采样参数：若目标 profile 有等价字段则保留，否则返回带字段名的 unsupported_feature；不得静默丢失。
- parallel_tool_calls：当目标协议支持并行工具调用时保留索引；否则返回明确的并行工具能力错误。

同协议方向继续采用 Native-Forward：只改路由模型和 Gateway headers，未知上游字段不在日志中回显。跨协议方向均通过统一中间表示，不复制原始 provider body。

## 架构与接口

- 新增 services/gateway/src/protocol-adapters.mjs：导出 parseRequest(protocol, body, profile), serializeRequest(protocol, normalized, model, profile), parseResponse(protocol, body), serializeResponse(protocol, normalized, requestId, profile), normalizeFeatureError(field, direction)。
- NormalizedRequest 包含 messages, instructions, maxTokens, tools, toolChoice, responseFormat, stream, candidateCount, featureUse。
- NormalizedToolCall 包含稳定 id, name, arguments, index；工具结果按 call ID 关联，不能丢失并行索引。
- server.mjs 只负责选择 inbound/outbound adapter、调用上游和记录错误；协议字段转换移出入口逻辑。
- 流式转换复用同一 normalized tool/event contract；终止和错误事件必须带 request ID，日志不得保存正文。

## 范围与非目标

包含：六方向请求/响应/工具/错误/流式转换、Codex tool_choice 与结构化输出覆盖、能力矩阵错误、对称回归测试、设计/计划/证据和专属 PR。

不包含：真实 provider 请求、模型供应商私有语义猜测、版本号或发布更新、合并主分支、改变凭证/failover/超时逻辑。

## 验收标准

- 六条方向均有本地 HTTP fixture，验证请求字段、响应字段、工具调用和工具结果往返。
- Codex 风格 Res 请求带工具定义、tool_choice 和结构化输出时，目标支持的 Chat/Mes 请求不再在 Gateway 入口 400；目标确实不支持时返回字段级可读错误。
- n > 1、无法映射的多模态、logprobs 和并行工具能力有稳定错误码/字段，不静默丢失。
- 非流和流式文本/工具调用都保留顺序、索引、终止原因和 request ID；中途失败返回脱敏错误。
- Runtime、Desktop、构建、diff 检查通过；所有上游使用本地 fixture，不做真实 provider 请求。

## 证据、回退与授权

- 设计：本文件；计划：docs/superpowers/plans/2026-11-23-protocol-adapter-matrix.md。
- 任务合同：docs/tasks/2026-11-23-protocol-adapter-matrix-contract.json；验证证据：docs/tasks/evidence/protocol-adapter-matrix/。
- 用户已批准开始执行；本任务授权创建隔离分支、实现、验证、提交、推送和创建专属 PR。合并、发布和删除 worktree 不在本任务授权内。
- 回退只撤销本任务提交，保留已发布 1.1.5、主工作树、其他 worktree 和未跟踪治理目录。
