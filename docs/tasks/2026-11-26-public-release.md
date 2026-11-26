# PR25 正式发布执行记录

项目 cx-routing-gateway，仓库 aiaijei-cx-routing-gateway，任务 CXRG-CODEX-ROUTE-MANAGEMENT-20261125，合同 revision9。

Owner明确授权：提交合并PR、任务工作树同步到主工作树、公开GitHub仓库、只读协作者权限、发布GitHub版本和本地桌面正式版、更新README。此授权替代revision8的Git集成和发布暂停；真实Codex代理/账户配置仍保留，不授权提供商调用或删除其他工作树。

版本1.1.10：已有1.1.10仅本地测试，最新正式Release为1.1.9。复用PR25工作树与分支，提交全部已验收revision2–8成果，加上公开更新与发布文档。新根LICENSE采用Apache-2.0，与已保留的Codex通用指令许可证兼容。

执行顺序：公开前核对受控源码与凭证扫描 → 更新README/公开Releases匿名读取与下载 → 聚焦测试及独立审查 → 全Runtime/Desktop/build → Windows x64 NSIS+Portable及manifest/hash/隔离启动 → 提交推送PR25并等待CI → 合并到master并ff同步主工作树 → 仓库公开/协作者降为pull → 创建v1.1.10 Release并上传正式产物 → 匿名下载与hash验证 → 桌面独立正式程序副本与保留数据检查。

验收分开报告：源码/测试、CI/PR/主工作树、仓库可见性与协作者权限、Release资产、桌面正式包、真实提供商/Owner运行。公开仓库无法禁止克隆/Fork，也不能隐藏代码只留Release；普通用户没有push/merge/release权限。保留Owner管理员权限；现有写权限协作者降为pull，关闭不需要的Issues/Discussions/Wiki。

回退：未发布时保留master与旧程序，任务提交可由后续明确授权revert；已发布修复通过新版本，不静默覆盖旧Release。任务工作树和备份保留，未授权删除。

执行：终端/patch/github CLI，按合同人工核对；当前宿主无AWG MCP工具，未声称MCP已校验。公共查询/资产下载不使用终端GitHub维护令牌；维护操作由现有gh身份执行，不写入程序。
