# Cx-Routing Gateway 1.1.2

## 修复内容

- 修复经网关发送较大 JSON 请求时被错误拒绝的问题：网关请求体上限从 1 MiB 提升到 4 MiB，并在 Buffer 层累计后按 UTF-8 解码，避免多字节字符跨网络分块损坏。
- 转发上游前按最终 JSON 的 UTF-8 字节数设置准确 `Content-Length`。
- 补齐上游 HTTP 状态识别：明确映射常见 4xx；413 返回 `upstream_payload_too_large`，429 返回 `upstream_rate_limited`；5xx/未知状态仍脱敏为 502 `upstream_error`，日志保留上游状态码。
- 上游错误正文和任意响应头不会透传给客户端；保留请求 ID。

## 更新内容

- 合并 PR #12 的请求日志来源显示、状态/错误详情与产品四段版本支持。
- 新版本号为 1.1.2；更新检查支持旧三段版本号。

## Windows x64 下载

- `Cx-Routing Gateway Setup 1.1.2.exe`：安装包。
- `Cx-Routing Gateway Setup 1.1.2.exe.blockmap`：增量更新块映射。
- `Cx-Routing Gateway Portable 1.1.2.exe`：单文件便携版，下载后可直接双击运行，无需安装或手动解压。
- `manifest.json`：构建文件 SHA-256 清单。

## 说明

- 仓库为私有仓库；应用内更新需要在设置中配置有 `Contents: Read` 权限的 GitHub Token，令牌保存在本机安全存储中。
- Windows 文件未进行代码签名。发布包含安装版与 Portable；Portable 在隔离数据目录和非默认端口下通过本机服务健康检查。
- 网关最大入站 JSON 请求体为 4 MiB；上游仍可按自身限制拒绝更大的转换后请求。
