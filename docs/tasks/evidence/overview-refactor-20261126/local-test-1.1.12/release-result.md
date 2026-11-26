# 本地桌面测试版 1.1.12 交付结果

日期：2026-11-27。范围：本地测试交付，不是 GitHub Release 或主分支集成。

## 交付物

- 桌面入口：`C:\Users\20142\Desktop\Cx-Routing Gateway 1.1.12 测试版.lnk`。
- 文件夹：`C:\Users\20142\Desktop\Cx-Routing Gateway 1.1.12 测试版`，包含 Portable、`Launch-Test.ps1`、使用说明、`test-build.json` 和独立 `Profile`。
- 请从快捷方式启动。它设置 `CXRG_USER_DATA_DIR`，在单实例锁之前显式隔离 userData/sessionData，同时隔离 Codex 配置，使用 Gateway 18418 / Local Control 18419。直接运行文件夹内的 EXE 仍是程序的标准启动行为。
- 正式版 1.1.11 已在桌面且运行中，因此递增为 1.1.12；任务分支原先的 1.1.10 元数据也已统一更新。
- 包来源：`codex/overview-dashboard-20261126`，源提交 `651185fb06043c5d16c93593b145475676d40324`。后续提交仅记录交付证据，不改变已经核验的程序内容。
- Portable：115,092,377 字节；SHA-256：`4c8fb9a50a4ae78266f22fd18d35774481edcfc68bcbbc968adabdd7f4160189`；文件产品版本 1.1.12；未签名。

## 检查结果

| 检查 | 结果及证据 |
|---|---|
| 版本断言先失败后通过 | 初始报告源版本 1.1.10 不等于 1.1.12；同步 metadata 后发布清单 2/2、设置页 14/14 通过。 |
| 显式隔离启动 | 新增 4 项测试覆盖默认路径不改动、绝对路径设置顺序、非法路径和创建失败；完整 Runtime 511/511 通过。 |
| Desktop 测试与生产构建 | 41 文件 / 353 测试通过；TypeScript/Vite 构建通过。见 `runtime-tests.log`、`desktop-tests.log`。 |
| Windows 打包 | x64 NSIS、blockmap、Portable 均构建完成，`--publish never`，未执行安装包。 |
| 发布清单 | `build-manifest.json` 记录 13 项文件的大小与 SHA-256；全部存在且非空，签名状态 false。 |
| 包内来源 | `archive-check.json` 确认包版本 1.1.12、原生入口和隔离模块与源码哈希相同、包含聚合环形图 bundle。Windows ASAR 路径已按本机分隔符规范化。 |
| 解包应用版本 | `packaged-version.json`：实际程序 `--version` 输出 1.1.12。 |
| Portable 启动 | `portable-smoke.json`：临时隔离目录和随机本地端口下，Control/Gateway 均健康。 |
| 桌面副本 | `desktop-delivery.json`：复制哈希与构建产物完全一致，快捷方式参数与工作目录读回一致。 |
| 原生窗口与 IPC | `native-desktop-check.json`：从桌面目录中的启动器启动实际 Portable；Control/Gateway 健康，工作区 runtime=running、gatewayPort=18418；总览为真实运行时空数据、默认 today；设置页显示 1.1.12，未出现 renderer 异常。 |
| 视觉取证 | 已查看 `native-overview.png` 与 `native-settings.png`；来自实际 Electron 程序，不是浏览器 fixture bridge。 |
| 原程序保留 | `postflight.json`：1.1.10 与 1.1.11 的原文件 SHA-256 未变，原 1.1.11 及其已有子进程仍运行；本次验证进程已停止，测试端口已释放。 |

## 边界与下一步

本地交付、包完整性、版本和空配置原生启动：PASS。未复制正式版配置、密钥或日志；新测试版首次无上游和调用记录是预期行为。

真实上游模型调用、有数据的原生调用链、独立审查和 Owner 验收：NOT_RUN。PR #27 继续保持 Draft，未合并，未发布 GitHub Release，主工作树应用代码未更新。下一步由 Owner 双击桌面快捷方式测试。

AWG 核对仓内身份与允许路径；打包、桌面文件/快捷方式交付和原生验证通过终端执行。桌面输出有明确授权，不代表 AWG 对终端施加了系统级沙箱。仓内构建与测试临时文件保留，没有清理其他工作树或原用户数据。
