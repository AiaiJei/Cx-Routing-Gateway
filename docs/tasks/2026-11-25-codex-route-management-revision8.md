# PR25 revision8：图片默认与生效检查

Owner要求已设置图片仍无法输入、解释工具未知、默认文本和图片；确认重新启用并完整重启后仍失败。继续已验证原工作树，冻结revision8/before.json。仅本地开发/验证/独立审查/新内测包；无提交、推送、合并或真实提供商请求，不修改实际用户配置/auth。

现场只读诊断：Gateway运行配置gpt-6.1-sol已保存inputModalities text/image；当前用户Codex配置provider custom、loopback15721/v1，无model_catalog_json。当前实际可执行为0.171.0-alpha.13.2，上一轮隔离测试用0.167.0。该时点不能证明用户之前没有启用过，表明现在的文件并未引用Gateway能力目录；其他配置管理器可能改写。不得把隔离成功当当前实际配置修复。

实施范围与验收：
1. 生成的新Gateway和自建直连模型目录默认text/image；显式text-only保留。新schema5记录生成方式，旧schema1-4重建校验保持原字节/hash，旧备份可恢复。
2. 路由表单默认text/image；缺省选项文案“默认（文本和图片）”。未知tools文案改为“按上游处理”，明确请求继续转发、不代表已确认支持；不改变工具能力执行策略。
3. Codex状态提供安全catalogSync（current/stale/unavailable/not-applied）与模型输入能力摘要、路径。管理目录与当前路由生成结果比较：路由能力更新或默认策略升级显示待重新应用；Control不可用不假报同步。非Gateway配置且没有本产品目录时明确路由能力尚未应用；自建/原样导入直连目录按实际值显示，不把Gateway路由当直连生效。
4. 所有配置写入仍由用户点击既有“保存并启用”确认，保存路由反馈指向Codex重新应用，目录刷新后提醒完整重启。不会重启或改写用户正在用的代理。
5. 当前0.171实际二进制隔离model/list和真实图片本地上游测试；缺省image及显式text-only分别验收，旧hash、native状态、UI交互/宽窄、全Runtime/Desktop/build及独立审查。生成新的1.1.10 Image Fix Test桌面文件，保留旧程序与数据。

角色：协调者集成native目录与状态；renderer包按固定catalogSync接口实施；独立审查只读。回退只撤回revision8补丁，保留revision2-7。AWG固定绑定主仓，本支线终端/apply_patch操作未经过MCP校验。
