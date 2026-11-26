# PR25 revision7 验收记录

2026-11-26；项目cx-routing-gateway，仓库aiaijei-cx-routing-gateway，任务CXRG-CODEX-ROUTE-MANAGEMENT-20261125，合同revision7。分支codex/codex-route-management-20261125；工作树C:/Users/20142/Desktop/Cx-Routing Gateway/.tmp/worktrees/codex-route-management-20261125。

**当前阶段：本地修复、独立审查、内测交付完成。开发目标PASS；真实供应商及Owner验收NOT_RUN，整体验收PARTIAL。**

| Owner要求 | 当前证据 | 结果 |
| --- | --- | --- |
| Res→Chat encrypted_content 400 | 不解密、不转正文；保留可读历史和工具，安全日志计数。安装版Codex与打包程序实际本地请求携带opaque历史成功 | PASS |
| 模型上下文大小 | 逐模型保存→native schema4→安装版modelContextWindow121600（128000×95%） | PASS |
| 最大输出 | 3入×3出HTTP测试未传/较大/较小；8192安装版、4096打包上游捕获 | PASS |
| 图片/工具/推理能力 | 逐模型配置校验、原值保留/清空、与路由区间交集；三协议能力限制、合法图片六向转换；13实际工具和续轮 | PASS |
| 参考CC Switch | 固定aa4a8c6公开源码逐项核对，见reference.md；未照抄供应商猜测和窗口封顶 | PASS |
| 原有代码和数据保留 | 冻结before.json；旧6数据文件、5原程序SHA256不变；84469字节opaque备份校验 | PASS |
| 界面可操作 | 真实Electron保存131072/16384到配置，及时成功反馈；390/1440截图无横向溢出 | PASS |
| 独立审查 | backend/protocol/UI/final无遗留阻断，见review.md | PASS |
| 真实提供商/用户Codex配置 | 未读取真实auth、未解密用户凭证、未调用真实上游 | NOT_RUN |

## 新程序

桌面文件：`C:/Users/20142/Desktop/Cx-Routing Gateway Portable 1.1.10 - Codex Capabilities Test.exe`

- Windows x64、本地未签名测试版1.1.10，115085502字节。
- SHA256：`57f7c526c3e78e2cdcbd1858028cc127e3ccdb55e0981612948a8a07109a2bb7`。
- 独立文件名，原程序保留；实际拷贝与产物hash一致。
- 包内53个native/dist/runtime文件逐字节等于本轮源码；版本启动PASS。
- 桌面Portable两次独立userData启动：route capabilities、凭证加密文件、草稿、日志保留；Res→Chat密文兼容和输出上限实际通过。每轮1次本地mock调用，真实提供商0次。
- 构建工具遇到其新建临时目录重命名EPERM，自身fallback copy后退出0并产出完整包；最终包证据有效。

## 实际验证

```text
node --test tests/runtime/*.test.mjs                       501/501 PASS
npm --prefix apps/desktop test                            306/306 PASS
npm --prefix apps/desktop run build                       PASS
node .../revision7/installed-capabilities-proof.mjs        Chat/Mes completed, image+tools+context+limits PASS
electron-builder --projectDir apps/desktop --win portable --x64 --config.directories.output=release/1.1.10-codex-capabilities-20261126  PASS
node scripts/smoke-packaged.mjs <new win-unpacked exe>     1.1.10 PASS
node .../revision7/portable-preservation-smoke.mjs <desktop exe> 2launch PASS
node .../revision7/verify-delivery.mjs                     PASS
git diff --check -- <revision7 changed paths>              PASS
```

原始日志、结果和hash清单位于`.tmp/codex-route-management-20261125/revision7/`，摘要分别见native.md、protocol.md、ui.md、reference.md、review.md。全树diff检查仍有之前已存在的SettingsPage.test.tsx两处CRLF空白提示，本轮按冻结快照确认未修改，未宣称全树diff clean。无追加生产依赖。

## 适用边界与下一步

- 本轮能力配置面向Gateway模型路由；自建直连目录能力编辑未扩展。未知模型不会自动获得未经官方证实的数值或图片能力；需在模型路由编辑里按供应商官方说明填写。多目标路由填写共同可满足的能力。
- 修改能力后在Codex页保存启用，并完整退出/重启Codex。仅新会话不保证重载启动目录。实际用户配置由Owner通过产品操作，本任务只验证隔离目录。
- 不能把其他供应商opaque推理状态无损迁移；此修复续接可读对话/工具。Chat图片限user，图片工具结果安全400；Messages丢弃无法表达的high/low detail并安全记录提示。压缩、未知业务历史、文件ID和音视频仍明确拒绝。
- 原截图tools.type对应托管工具：该边界保持明确报错，网关启用时禁用官方hosted web_search，本地工具仍保留；不伪造搜索结果。
- PR25仍OPEN，远程HEAD d1fe810529ed59455bb1854da05fa21a39d2c671；本轮未提交、未推送、未合并、未发布，master未更新。
- AWG MCP固定绑定主工作树，支线调用PROJECT_ROOT_MISMATCH。源码/证据/构建经终端与apply_patch，UI经CUA；人工核对任务合同，不声称经过MCP写入校验。
- 下一步：Owner运行桌面新测试版，填写目标模型官方能力，保存启用并完整重启Codex后复测真实上游；提交/推送/合并/发布继续保持原暂停边界。开发侧无未完成项。
