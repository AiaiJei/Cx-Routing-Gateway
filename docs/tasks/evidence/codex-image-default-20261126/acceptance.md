# PR25 revision8 图片默认与生效诊断

2026-11-26。任务CXRG-CODEX-ROUTE-MANAGEMENT-20261125，项目cx-routing-gateway / aiaijei-cx-routing-gateway，合同revision8；原codex/codex-route-management-20261125工作树。Owner最终明确“保留当前代理，只交付程序修复”。本轮程序开发/本地验证/内测交付PASS；实际账号切换及真实提供商NOT_RUN，按Owner决定保留原代理。

## 现场结论

Owner确认勾选文本和图片、重新启用并完整重启后仍无法输入。只读白名单提取确认：Gateway保存的gpt-6.1-sol路由inputModalities确为text/image；当时用户Codex配置provider为custom、指向loopback15721/v1且无model_catalog_json。该时点未引用Gateway模型目录，不推断用户此前没有执行启用，也不确定哪一个管理器何时改写。

当前进程实际可执行版本0.171.0-alpha.13.2；上一轮验证的旧安装路径是0.167.0。本轮用当前实际二进制完成独立CODEX_HOME验证，未修改真实Codex配置/auth、未调用真实提供商；取证输出不包含Key或auth。

## 程序改动与验证

- 新schema5目录默认text/image，Gateway和本产品自建直连一致；显式仅文本保持。旧schema1–4生成与hash读取保持原行为，不后台改写旧备份。
- 表单默认“文本和图片”；工具“未知”更名“按上游处理”，解释继续转发而非确认支持。省略与null清空语义不变。
- 新catalogSync检查磁盘已引用目录与当前路由，显示actual modalities、路径及current/stale/unavailable/not-applied。不把磁盘当前等同进程已重载。活动profile或模型覆盖不假报一致；missing/invalid明确不可用；原样导入的直连旧目录不强制换模板，按实际内容报告。
- 真实Electron生产dist页面确认“已应用的网关目录一致、gpt-6.1-sol文本和图片”；随后仅修改隔离route为text，刷新实际显示“目录待重新应用”，同时区分旧目录图片与当前路由仅文本。1224×765实际截图无文本重叠，长路径换行。未重复宣称本轮手机视口已检查；上一轮390/1440能力表单证据保留，新诊断手机布局未实测。
- 当前Codex0.171实际model/list：缺省Gateway=text/image、显式text-only=text、缺省自建直连=text/image；无模型请求。实际图片输入→Chat/Mes各2个本地请求、13工具+1次echo续轮completed；context128000报告121600，输出8192；真实提供商0。
- 全Runtime506/506PASS；Desktop318/318PASS（revision8/desktop-final.log）；最后文案变动针对状态10/10及buildPASS。
- 独立backend_review75/75PASS；旧schema1 snapshot服务导入→预览→启用→getStatus完整复核current且旧bytes不变，missing/invalid unavailable。ui_review89项与最后状态10项PASS，三个状态提示问题全部修复，无遗留阻断。

## 交付

`C:/Users/20142/Desktop/Cx-Routing Gateway Portable 1.1.10 - Codex Image Fix Test.exe`

- SHA256 `26da252ff009c0abf90907d7ec76ed2191e1d9c20395436af0f008068c7aa85c`，115087546字节，Windows x64未签名测试版。
- 54个打包native/dist/runtime文件与源码相同；Desktop副本与原产物hash一致；版本命令1.1.10PASS。
- 桌面Portable两次隔离启动PASS，routes/capabilities/加密凭证/草稿/日志保留；每次1个本地Res→Chat请求，输出4096与opaque兼容生效。
- 原6个Gateway数据文件及当前桌面已有2个程序hash不变，97828字节opaque备份验证；只停止本任务隔离测试进程。
- 原始结果在.tmp/codex-route-management-20261125/revision8/：default-image-proof.log、installed-capabilities-result.json、model-list-result.json、runtime-final.log、desktop-final.log、build-final.log、package.log、portable-smoke.log、delivery-result.json。before.json冻结原修改；源码写入通过终端/apply_patch，UI通过CUA，未经过固定绑定主仓的AWG MCP写入校验。

PR25仍OPEN、HEAD d1fe810529ed59455bb1854da05fa21a39d2c671；本轮未提交/推送/合并/发布，master未更新。下一步：Owner按需使用新测试版；当前代理按明确要求保留，无待执行切换。程序开发侧无未完成项；实际供应商图片能力及当前账号可用性不由本地fixture推定。
