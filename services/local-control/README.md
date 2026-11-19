# local-control

本机配置控制接口：供 Desktop 工作区管理上游、路由、凭证与设置使用，不是独立 Web 管理后台。

运行 `npm run start:control` 后监听 `127.0.0.1:4319`。数据目录由 `CXRG_DATA_DIR` 指定，主密钥由 `CXRG_MASTER_KEY` 注入。控制 API 提供 `/health`、`/v1/control/state`、上游/路由/客户端 Key 管理、模型发现与连通测试、以及脱敏调用日志查询。

上游指向回环或私网地址时必须在创建请求中显式设置 `allowPrivateNetwork: true`；默认拒绝私网、元数据和无凭证 URL。上游 API Key 只在加密 SecretVault 中保存，普通配置只保留引用。
