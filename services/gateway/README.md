# gateway

本机 Gateway 数据面已提供可运行基础：loopback HTTP 监听、客户端 Key 鉴权、模型别名路由、Responses/Messages/Chat 三个入口、同协议转发、文本跨协议转换、文本 SSE 转换和单函数工具转换。

认证客户端还可以调用 `GET /v1/models` 获取其 Key scope 可见的模型别名。

运行 `npm run start:gateway` 后监听 `127.0.0.1:4318`。它与 local-control 共用 `CXRG_DATA_DIR` 和 `CXRG_MASTER_KEY`。当前拒绝工具结果链、工具流式增量、多模态和结构化输出；调用记录只保存协议、路由、上游、模型、状态和请求 ID，不保存正文或密钥。
