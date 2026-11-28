# Cx-Routing Gateway 1.1.15.1 本地测试版

## 交付物

- 新桌面目录：`C:\Users\20142\Desktop\Cx-Routing Gateway Codex Mode Test 1.1.15.1\`。
- x64 Portable：`Cx-Routing Gateway Portable 1.1.15.1.exe`，115,095,229 bytes，SHA-256 `08A88C632B5A7C9EC54FE9F6DDC1C8028D3D7539ABCB3657C488F2C383FD6332`。
- 启动器：`Launch Codex Mode Test 1.1.15.1.cmd`；说明：`README.txt`；保留基线：`preservation-baseline.json`。
- 构建源：PR #28 工作树 `apps/desktop/release/codex-mode-tabs-test-1.1.15.1/`。打包未签名，不是 GitHub Release。
- 发布清单见 `local-release-manifest-1.1.15.1.json`，包含 11 项 x64 Portable 与 unpacked/runtime 文件。

## 验证

- Desktop：`npm test -- --no-cache`，359/359 PASS；TypeScript/Vite build PASS。
- Runtime：`node --test tests/runtime/*.test.mjs`，521/521 PASS。
- 版本测试：SettingsPage 14/14 PASS；发布清单 3/3 PASS。
- `node scripts/verify-release.mjs apps/desktop/release/codex-mode-tabs-test-1.1.15.1 --local-test --write` PASS，版本/包版本均为 1.1.15.1。
- `node scripts/smoke-packaged.mjs <win-unpacked exe>` PASS，版本 1.1.15.1。
- `node scripts/smoke-portable.mjs <Desktop Portable>` PASS，Local Control 与 Gateway 健康；烟测使用临时 userData、CODEX_HOME 和随机端口，并仅关闭自己启动的进程。
- 启动器 PowerShell 语法检查 PASS；桌面 Portable 与工作树制品哈希一致。

## 保留旧版

- 此版放在新建的 1.1.15.1 目录，没有覆盖或移动 1.1.15 文件夹。
- 旧 1.1.15 Portable 哈希仍为 `3082D5AB7E21DCBE900BAD6A90E5F975BBDF3E6747BCF52A1861EDA612CE0904`，PID `24156` 在复核时仍运行；该进程未停止。
- 官方 1.1.14 Portable SHA-256 仍为 `D0C3B29920E38FF0866A0FB8FD873EF8926118D0D9A482F4CE74844C171A188D`。没有读取、复制或修改旧版 Gateway 用户数据、路由、凭证或密钥。
- 新目录尚未创建 `isolated-user-data/` 与 `isolated-codex-home/`；这些仅在用户双击新版启动器时创建。

## 边界

- 本地隔离 UI 浏览器验证：标签只选目标模式；按钮按缺项、未启用、已启用未变更、草稿变更和处理中状态变化；视口 1530/1024/390 无横向溢出。
- 真实 Codex 配置/提供商请求/Owner 验收：`NOT_RUN`。
- PR #28 保持 OPEN；未合并、未发布 GitHub Release。独立审查工具不可用；GitHub 曾报告的 Devin Review 说明为额度耗尽、完整审查跳过，故有效审查仍 `NOT_RUN`。
