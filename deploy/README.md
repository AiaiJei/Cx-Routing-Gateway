# deploy

当前运行时使用本机 loopback 服务和版本化 JSON 配置。复制 `.env.example` 后为 `CXRG_MASTER_KEY` 和 `CXRG_CONTROL_TOKEN` 注入随机值，再启动：

```powershell
npm run start:control
npm run start:gateway
npm run health
```

本地诊断：`npm run doctor` 只读检查 control/Gateway 健康、密钥/token 配置和 release manifest；服务未启动时返回非零并列出失败项。

`CXRG_DATA_DIR/config.json` 是配置快照，`config.json.bak` 是最近一次原子写入前的备份。回滚前停止两个服务，执行 `npm run restore:config -- <data-dir>`；命令会把当前配置保存为 `config.json.before-rollback`，再恢复 `.bak`，随后重新运行 `npm run health`。不要把 `.env`、`secrets.json` 或 master key 提交到 Git。

生产安装器、自动更新、OS keychain 适配器的非 Windows fallback、迁移演练和发布审批仍未完成。

构建产物校验：

```powershell
npm run verify:release
```

该命令验证 exe、app.asar、安装器和 blockmap 存在、非空并输出 SHA-256，不代表签名或安装成功。
校验命令同时写入 `release/manifest.json`；当前 manifest 明确标记 `signed: false`，不能作为已签名发布证明。

提供 `CXRG_RELEASE_PRIVATE_KEY` 和 `CXRG_RELEASE_PUBLIC_KEY` 后，校验命令会对 manifest payload 生成 RSA 签名并写入公钥；私钥不写入产物或日志。

更新发现检查：设置 `CXRG_UPDATE_MANIFEST_URL` 后运行 `npm run check:update`。它只报告更高版本且 `signed: true` 的 manifest；当前不下载、安装或重启应用。
