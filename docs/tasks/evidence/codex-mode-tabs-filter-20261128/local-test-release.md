# 1.1.15 本地测试版交付记录

## 制品

- 版本：1.1.15（仅本地测试版）。
- x64 Portable：`C:\Users\20142\Desktop\Cx-Routing Gateway Codex Mode Test 1.1.15\Cx-Routing Gateway Portable 1.1.15.exe`。
- 文件大小：115,092,322 bytes；SHA-256：`3082D5AB7E21DCBE900BAD6A90E5F975BBDF3E6747BCF52A1861EDA612CE0904`。
- 构建来源：PR #28 分支 `codex/codex-mode-tabs-filter-20261128`，任务工作树 `apps/desktop/release/codex-mode-tabs-test-1.1.15/`；本地构建，无代码签名证书。
- Desktop 副本哈希与仓内构建源完全一致。

## 验证

- `npm test -- --no-cache`（在 `apps/desktop`）：358/358 PASS。
- `npm run build`（在 `apps/desktop`）：TypeScript 与 Vite PASS。
- `node --test tests/runtime/release-manifest.test.mjs`：3/3 PASS；本地测试清单包含 x64 Portable 与 unpacked runtime，不要求安装包。
- `npm test -- src/pages/SettingsPage.test.tsx`（在 `apps/desktop`）：14/14 PASS，界面版本显示 1.1.15。
- `node scripts/verify-release.mjs apps/desktop/release/codex-mode-tabs-test-1.1.15 --local-test --write`：PASS，版本 1.1.15，清单覆盖 11 项 unpacked/runtime/Portable 文件。
- `node scripts/smoke-packaged.mjs <unpacked exe>`：PASS，版本 1.1.15。
- `node scripts/smoke-portable.mjs <Desktop Portable>`：PASS，Local Control 和 Gateway 均返回健康状态。此烟测自动使用临时 userData、临时 CODEX_HOME 和随机 loopback 端口；临时数据由烟测脚本回收。

## 数据保留与使用

- 官方 Portable `Cx-Routing Gateway Portable 1.1.14 - GitHub Release.exe` 保持原样：SHA-256 `D0C3B29920E38FF0866A0FB8FD873EF8926118D0D9A482F4CE74844C171A188D`，115,098,062 bytes；复核时原有 5 个官方应用进程仍在运行。
- 未覆盖、退出或迁移 1.1.14；未读取、复制或改写原有 Gateway 数据、密钥或真实 Codex 配置。测试版不预装原有上游/路由数据。
- Desktop 测试目录同时提供 `Launch Codex Mode Test.cmd` 和 `.ps1` 启动器。启动器清除可能继承的主密钥/令牌/开发环境变量，为新版本分配专用 userData 与 CODEX_HOME 目录及动态 loopback 端口。
- 若希望测试版使用现有上游/路由，需另行确认是否制作一份包含凭证数据的本地快照；本次没有复制真实配置。
- 无真实提供商请求、无 GitHub Release、无 PR 合并。现有官方应用未切换。

## 位置

- 用户目录：`C:\Users\20142\Desktop\Cx-Routing Gateway Codex Mode Test 1.1.15\`。
- 用户手动双击 `Launch Codex Mode Test.cmd` 后才会创建 `isolated-user-data/` 和 `isolated-codex-home/`。
- PR #28 保持 OPEN；版本与验收更新位于专属 PR 分支，尚未推送该轮版本提交。
