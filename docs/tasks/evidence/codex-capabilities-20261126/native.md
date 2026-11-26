# Revision7 安装版与界面取证

工作树 .tmp/worktrees/codex-route-management-20261125；所有测试使用仓内独立CODEX_HOME和userData，假密钥与本地上游；真实config/auth/提供商NOT_RUN。

## 安装版Codex 0.167.0

运行 `.tmp/codex-route-management-20261125/revision7/installed-capabilities-proof.mjs`。实际安装可执行文件app-server stdio，读取生成模型目录。Res→Chat与Res→Mes均completed，无error；每条链2次本地请求、13个实际工具定义、1次fixture_echo执行和1次工具结果续轮。使用实际用户图片输入，代理夹入人工opaque历史以复现旧会话条件。

- model/list实际报告text/image，支持low/high；原始目录context128000。
- thread/tokenUsage/updated实际报告modelContextWindow121600，即客户端默认95%可用窗口，证明客户端使用了目录窗口。
- 两次上游请求均保留图片、system/developer、工具定义/结果；密文未泄露。
- xhigh经路由上限调整到high；最大输出8192实际到达上游。
- 日志保存opaque_reasoning_ignored计数；Mes另存image_detail_omitted计数，不记录密文/图地址。
- 初次测试图片PNG本身CRC无效，被客户端转成文本错误；修正合成PNG后最终实际图片链路通过，未拿坏fixture当产品失败或成功。

原始简洁结果：revision7/installed-capabilities-result.json 与 installed-final.log。

## Electron生产界面

用built dist启动独立Electron，窗口CxRG Capabilities isolated smoke，本机Gateway运行。通过真实界面点击模型路由→编辑，原128000/8192回填正确。输入131072/16384，滚动到保存路由，页面立即显示“已保存1个统一模型”，列表显示新值；随后只读fixture runtime/config.json确认实际持久化。图片、工具、low/high仍保留。

实际窗口1224×765。原窗口隐藏启动无可见窗口，重启本任务测试实例并明确显示后完成UI检查；没有停止用户已有应用。

## 宽窄布局

CUA浏览器打开本地React界面，选择预览样例模型并填写能力。390×844下单列表单，dialog宽366.4；1440×960下双列数字和能力控件。两种宽度document无横向溢出，截图检查输入、标签、下拉与按钮无重叠；滚动可到保存。样例数据仅用于标明的浏览器预览；持久化证明来自上面的真实Electron。最终viewport已reset。该检查使用CUA而非taste脚本，不声称自动inspector全量评分。

当前限制：需要显式保存启用并完整重启Codex读取新目录；本任务未改实际用户配置，也未自动重启用户Codex。Gateway本轮能力配置不扩展独立直连自建目录编辑。
