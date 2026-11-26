# gateway

本机 Gateway 数据面已提供可运行基础：loopback HTTP 监听、客户端 Key 鉴权、模型别名路由、Responses/Messages/Chat 三个入口、同协议转发、文本跨协议转换、文本 SSE 转换和单函数工具转换。

认证客户端还可以调用 `GET /v1/models` 获取其 Key scope 可见的模型别名。

运行 `npm run start:gateway` 后监听 `127.0.0.1:4318`。它与 local-control 共用 `CXRG_DATA_DIR` 和 `CXRG_MASTER_KEY`。当前拒绝工具结果链、工具流式增量、多模态和结构化输出；调用记录只保存协议、路由、上游、模型、状态和请求 ID，不保存正文或密钥。
## 请求体上限

Gateway 默认接受最大 64 MiB 的请求体，以覆盖包含长上下文、工具定义或大段文本的正常模型请求。可通过 `CXRG_MAX_REQUEST_BODY_BYTES` 设置为正安全整数（字节）：

```powershell
$env:CXRG_MAX_REQUEST_BODY_BYTES = '33554432'
npm run start:gateway
```

超过上限的请求会在选择上游前返回 HTTP 413，响应错误码为 `request_body_too_large`，并包含 `limitBytes` 与 `requestId`。这表示 Cx-Routing Gateway 本地限制；若请求已通过 Gateway、但响应中记录的上游状态仍为 413，则应检查对应供应商或供应商网关的请求体限制。Gateway 只监听回环地址，不提供公网入口。
