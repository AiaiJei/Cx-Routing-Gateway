# Revision6 协议适配证据

项目 `cx-routing-gateway`，仓库 `aiaijei-cx-routing-gateway`，任务 `CXRG-CODEX-ROUTE-MANAGEMENT-20261125`，合同 revision6。工作树 `.tmp/worktrees/codex-route-management-20261125`，分支 `codex/codex-route-management-20261125`。本包仅修改协议适配器、协议测试和本证据；没有提交、推送、合并或发布。

## 状态与范围

- 本地协议实现与聚焦回归：`PASS`。
- 独立审查：`PASS`，审查者完成边界复核，无遗留阻断；以协调者最终整体验收结论为准。
- 安装版 Codex、Desktop 和真实提供商验收：本包不执行；安装版客户端的本地链路证据由协调者归档，不把单元测试当作安装版或真实提供商通过。
- 真实用户 config/auth、密钥解密及真实提供商调用：`NOT_RUN`。

## 根因与修复

1. Responses 的 system/developer 留在普通消息里，Messages 输出时又跳过这些角色，造成指令丢失。现在把它们按顺序合入规范化 instructions；Chat 和 Messages 都带上，普通历史中不残留不合法角色。
2. Responses reasoning/未知历史落入默认分支，变成空 user。现在按历史类型分类。空 reasoning 是元数据，不生成会话正文。公开 `summary_text` / `reasoning_text` 以可选 `reasoningMetadata: [{messageIndex,item}]` 保留，并可在 Responses 序列化时回写；Chat/Messages 没有通用等价字段，因此不转发成正文、不使用私有 reasoning_content、不伪造 Messages thinking signature。这是明确的跨协议边界。
3. 带 encrypted_content 的 reasoning 无法供另一类提供商使用，明确返回400、`input.reasoning.encrypted_content` 和新会话/兼容 Responses 提供商指引。`web_search_call`、`compaction` 和未知 item 也明确失败，不能静默消失。错误不带历史内容或 ID。
4. hosted `web_search` / `web_search_preview` 仍严格拒绝。保留400、`unsupported_feature`、`tools.type`、方向以及只允许字母数字下划线连字符且不超过48字符的 toolType。固定提示说明重新应用 Gateway 设置以禁用 hosted web_search，或改用直接 Responses 提供商。没有删除请求工具、包装假的本地搜索或伪造搜索结果。
5. 混合正文和工具调用在非流式 Chat/Messages 输出及 Chat→Responses 请求中会丢正文；现保留二者。Messages content_block_start 的初始正文/非空工具输入也被消费。
6. 原 Messages 流输出缺少 message_start、文本 block start、block stop 和 message_delta。现有完整生命周期、稳定连续输出 block 索引、碎片参数合并和一次终止；保留原调用 ID 与名称。
7. 原 Responses reasoning_text 流被当作回答正文；现不把推理流混进答案。原非流式长度限制被当作普通成功，现六向保留长度限制，Responses 使用 incomplete，Chat 使用 length，Messages 使用 max_tokens；未知 Responses incomplete 原因与 failed/error 明确为502，不伪造成功。

公开导出 API 未变：parseRequest、serializeRequest、parseResponse、serializeResponse、parseStreamEvent、serializeStreamEvent、featureError。仅规范化请求可增加上述可选 reasoningMetadata。

## 测试先红后绿

独立新文件 `tests/runtime/protocol-codex-compat.test.mjs` 先写失败断言，再改适配器：

- 首批7项全部失败，分别定位指令、未知/空历史、安全错误、混合正文、请求正文和初始流正文，修复后通过。
- Messages 完整流生命周期、reasoning 流正文隔离、incomplete/failed 三项先失败后通过。
- 非流式长度限制和未知 incomplete 原因两项先失败后通过。
- 公开推理摘要保留/校验两项先失败后通过。
- 摘要插在正文与工具之间的位置、拒绝服务端 tool_search_output 两项先失败后通过。
- 补充本地工具矩阵和六向聊天回归，使用手工推导的 fixture 与真实适配函数，没有调用真实提供商。

工具矩阵覆盖 function、namespace function、custom、namespace custom、client tool_search，分别经 Chat 与 Messages 验证定义、非流调用还原、碎片流一次完成、调用 ID/namespace/原始 custom input、结构化结果续轮及 tool_search 发现后的工具定义。普通聊天流覆盖六个不同协议方向。

## 实际命令与结果

在本工作树执行：

```text
node --test tests/runtime/protocol-codex-compat.test.mjs tests/runtime/protocol-adapters.test.mjs tests/runtime/gateway-server.test.mjs
```

最后一次常规输出为148/148通过；随后增加两项先红后绿的位置/执行端回归，再执行：

```text
node --test --test-reporter=dot tests/runtime/protocol-codex-compat.test.mjs tests/runtime/protocol-adapters.test.mjs tests/runtime/gateway-server.test.mjs
```

退出码0，150个测试点通过（新独立协议28项、现有协议41项、Gateway81项），无失败。

```text
node --check services/gateway/src/protocol-adapters.mjs
node --check tests/runtime/protocol-codex-compat.test.mjs
git diff --check -- services/gateway/src/protocol-adapters.mjs tests/runtime/protocol-adapters.test.mjs tests/runtime/protocol-codex-compat.test.mjs
```

均退出码0。全仓 diff check 曾发现非本包 `SettingsPage.test.tsx` 的两处原有尾空格，本包未修改该文件；不能据本包检查声称全仓 diff clean。

操作通过终端/apply_patch完成，未经过 AWG MCP 写入校验；已人工核对工作仓、活动合同 revision6 与允许路径。Skills 提供步骤指导，不是系统沙箱。

## 剩余边界与回退

Chat/Messages 不承载 Responses 专有公开推理元数据；encrypted reasoning、compaction 和 hosted search 需要兼容 Responses 或新会话/重新应用 Gateway 设置。这里只证明协议适配与本地 Gateway fixture，不证明所有提供商接受每种工具模式、reasoning 值或 schema。下一步由协调者完成独立审查、安装版 Codex 本地工具链、全量测试与 Desktop 验证；真实提供商和 Owner 验收单独记状态。

回退应仅撤回本包本轮适配修改与新测试/证据，保留先前 revision2–5 和其他并行参与者的改动；不执行整文件 checkout、不清理工作树或用户数据。

## 独立审查后的边界修复

审查者通过内存复现发现以下边界，本包均先写独立红测再修复：

1. 没有正文/工具输出的合法 Chat `finish_reason:length`、Messages `max_tokens` 先被空输出检查误判为502。现在先读终止原因，返回 `response.incomplete`、`output:[]`、`incomplete_details.reason:max_output_tokens`。普通空成功、原因不明的终止、缺少名称的工具仍明确502，不制造答案。
2. Responses 历史中的截断 function arguments 会在 Messages 序列化时裸抛 SyntaxError。现在在请求解析时验证 JSON 对象并安全400，字段为 `input.function_call.arguments`；`incomplete` / `in_progress` 的函数历史明确400 `input.function_call.status`，不把未完成调用继续发给提供商。错误不带 ID、工具名或参数。
3. 截断的 custom JSON 代理曾回退为 raw custom input，还发出可执行完成事件。现删除这个回退。正常完成的代理必须能解出 `{input:string}`，畸形时安全502；长度限制/未完成的 buffered custom 与 client tool_search 在流式及非流式都不输出可执行调用，只返回未完成状态，已有正文仍保留。不会把代理 JSON 当作原始 patch，也不会把半条搜索当已完成。
4. 官方 Responses `tool_choice:{type:custom,name}` 先前被拒绝。现按 custom kind、名称和 namespace 精确选择已有代理；同名 function 不会误选，未声明名称仍400。保留既有 `type:function` 对 sole custom proxy 的兼容。

新增11项独立测试（其中需要改变的边界先失败，空成功守卫原本通过）；独立协议文件现39项。最终执行：

```text
node --test --test-reporter=spec tests/runtime/protocol-codex-compat.test.mjs tests/runtime/protocol-adapters.test.mjs tests/runtime/gateway-server.test.mjs
```

**161/161 PASS，0失败**（独立协议39、现有协议41、Gateway81）；语法与本包 diff 检查仍通过。此结果替代上面的150项聚焦计数。待独立审查者复核上述四类边界；本包仍未提交、推送、调用真实提供商或访问真实 config/auth。

复核确认上述四类边界通过。审查者补充同名 function/custom 的 forced function 选择会被旧兼容路径误判冲突；已增加第40项独立测试先红后绿，优先选择声明的 function，仅不存在 function 时保留 sole custom 兼容。再次执行同一聚焦命令 **162/162 PASS，0失败**（独立协议40、现有协议41、Gateway81），为本包最新计数。

独立审查者最终确认 `PASS`：独立运行39项完整兼容测试、单独运行新增第40项同名 forced function 及 custom choice/sole custom 兼容项，四类边界与最后选择逻辑均复核，无遗留阻断。审查没有修改本包文件。
