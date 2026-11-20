# Gateway 上游错误状态与 Payload 413 修复设计

日期：2026-11-21
任务：CXRG-UPSTREAM-PAYLOAD-413-2026-11-21
基线：'master' / '6446c470b6e71122d6f1dd3c5427f591ef8f2436'

## 意图

经网关调用时，同一请求在多个上游服务收到 HTTP 413，而绕过网关直连正常。当前网关入口把入站 JSON 限制为 1 MiB，转发时对最终 JSON 未显式设置长度，并把所有上游非 2xx 响应统一隐藏为 502，导致客户端无法区分请求过大、鉴权失败、限流和其他可识别错误。修复要让合理的大请求能够通过网关，并用显式白名单识别上游状态；上游正文仍只用于服务端诊断，不直接暴露给客户端。

## 范围与约束

- 入站 JSON 上限提升到 4 MiB；仍拒绝超过上限的请求，并保留 413 网关错误。
- 只为实际发送的 UTF-8 JSON 设置准确的 'Content-Length'；不改变协议转换、认证、并发、超时或响应大小限制。
- 上游状态只按显式白名单分类：400/401/402/403/404/408/409/413/415/422/429 保留对应客户端状态，并使用稳定的 'upstream_*' 错误码；413 使用 'upstream_payload_too_large'，429 使用 'upstream_rate_limited'。
- 5xx、未知状态和不在白名单中的状态继续返回 HTTP 502、错误码 'upstream_error'；usage 记录保留原始 'upstreamStatus'。所有返回保留 'x-request-id'，不上游正文，不透传任意上游响应头。
- 不调用真实供应商，不改桌面 UI、配置 schema、凭证或发布资产。

## 方案比较

1. **只提高入站上限**：解决网关自身 1 MiB 拒绝，但无法修复网关转发与上游 413 的差异。放弃。
2. **只设置转发长度并映射 413**：针对链路差异有效，但超过 1 MiB 的请求仍在网关入口失败，且其他上游状态仍不可识别。放弃。
3. **组合修复（已选）**：4 MiB 入站上限、最终 JSON 的 UTF-8 'Content-Length'、显式上游状态白名单和 413/'upstream_payload_too_large' 映射；覆盖两条已观测路径，并延续 New API/Sub2API 的脱敏与显式匹配做法。

参考实现：

- New API 'service/error.go'：'RelayErrorHandler'、'ResetStatusCode'。
- Sub2API body-limit regression：413 固定状态、脱敏正文和显式 passthrough 规则。

## 设计

- 'services/gateway/src/server.mjs' 将请求体读取上限从 1 MiB 提升为 4 MiB；响应读取上限保持 4 MiB。
- 在 'fetchWithTimeout' 调用前序列化一次 payload，使用 'Buffer.byteLength' 设置 'content-length'，并复用该字符串作为请求体，避免字符数与字节数不一致。
- 将状态分类封装为单一纯函数，测试白名单中的每一类、未知状态和 5xx 规范化；路由 failover 仍使用原始状态类别判断，不改变已有策略配置。
- 在收到上游非 2xx 响应时记录原始 'upstreamStatus'，按分类结果返回客户端状态和错误码；上游响应体只取消/消费，不解析进客户端错误。
- 'tests/runtime/gateway-server.test.mjs' 增加：大于 1 MiB 且小于 4 MiB 的 UTF-8 请求可转发并检查长度；413、429、代表性 4xx、5xx 和未知状态的映射/脱敏/日志；超过 4 MiB 仍被网关拒绝。

## 验收与回退

先执行新增测试的 RED→GREEN，再执行 Runtime 全套、'git diff --check'，必要时执行生产构建相关回归。证据写入 '.task-evidence/upstream-payload-413/' 与任务记录。回退为撤销本任务提交/关闭 PR；不改 master、不删除其他任务工作树。
