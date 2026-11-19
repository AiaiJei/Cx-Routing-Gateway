# 验收清单

状态标记：`NOT_RUN`、`PARTIAL`、`BLOCKED`、`PASS`。规划阶段只定义项目验收项，不代表任何实现项已通过。

## 产品与协议合同

- [ ] Owner 确认 Res、Mes、Chat 的准确含义及版本。
- [x] 入站协议取自下游实际请求；每条路由的出站协议取自用户配置。
- [x] 响应（含流式响应）转换回同一请求的入站协议；运行时测试覆盖 Res/Mes/Chat 转换和文本流。
- [x] 三种入站协议与三种出站协议的支持矩阵、限制、错误和流式行为有书面定义。
- [x] 模型别名、目标上游模型、协议转换、禁用和冲突处理语义明确。
- [x] 上游发现模型、测试联通、超时和失败状态可解释。

## Desktop 工作区

- [ ] Desktop 打开后自动启动 Gateway，并展示启动中、运行、启动失败状态。
- [x] 导航覆盖总览、上游、模型路由、调用日志、接入凭证和设置，不出现管理员角色或独立管理后台。
- [x] 上游 CRUD 与测试流程含校验、加载、成功、失败、空和确认状态（本机 API/fixture 范围）。
- [x] 路由编辑清楚区分客户端入站协议与上游出站协议，并展示响应回转为入站协议。
- [x] 接入页显示本机网关 URL；Key 创建只显示一次，并可轮换/撤销。
- [x] 日志可筛选、查看详情；Key、上游密钥、正文默认脱敏/不记录。
- [x] 模拟数据明确标注；真实后端接入时 UI 的错误/分页/流式边界一致（当前真实分页未启用）。
- [x] 响应式布局、键盘可达、焦点可见、标签/错误关联与对比度通过组件测试和已有前端验收。

## Gateway 运行时与安全

- [ ] 客户端鉴权、授权范围、Key 哈希/存储、轮换/撤销与审计通过审查。当前实现证据：`PARTIAL`；Key scope 已在 Control API/Gateway 强制，完整 UI 配置和审计验收仍待完成。
- [ ] 上游凭证不明文回显/日志；存储加密与访问边界验证。
- [x] Gateway 默认只监听本机回环地址；连通测试限制可访问目标，DNS 地址漂移、内网地址、重定向和超时边界已有本地测试/校验。
- [ ] Desktop 退出时 Gateway 行为符合 Owner 确认的生命周期策略。当前证据：`PARTIAL`。
- [x] 请求/响应大小、超时、并发、速率和资源上限明确且有测试；重试策略仍未实现。
- [x] 协议适配覆盖普通响应、错误、文本流式、工具调用及不支持能力。
- [x] 请求关联 ID 可追踪，日志字段白名单和脱敏通过验证。运行时测试覆盖 request ID、正文不入日志、耗时和错误代码。

## 链路与发布

- [x] 每个已实现协议方向的端到端测试覆盖客户端 → 网关 → mock 上游及错误路径；真实 provider 仍未运行。
- [x] 模型同步和连通测试对真实/模拟结果区分清楚。
- [ ] 关键指标、告警阈值、日志保留期与存储容量已确定。当前证据：`PARTIAL`；metrics 聚合、耗时和错误代码已实现，日志保留条数已可通过控制面/Desktop 设置，告警阈值、容量压测和长期容量演练仍待完成。
- [ ] 数据库迁移、配置备份、单适配器关闭和回滚演练有证据。当前证据：`PARTIAL`；配置备份、`restore:config` 和回滚测试已通过，数据库迁移与生产演练未运行。
- [ ] 构建、静态检查、单元/集成/E2E 结果附带命令、时间和摘要。当前证据：`PARTIAL`；运行时/组件测试、生产构建、release manifest 和 packaged smoke 已通过，完整 GUI E2E、窄屏实机检查与 CI 远程执行未运行。
- [ ] 独立审查完成；Owner 对验收清单签收。

## 生命周期决策

- [ ] Owner 决定 Desktop 退出后 Gateway 停止、后台常驻或托盘驻留。
- [ ] Owner 决定是否支持开机启动、单实例与崩溃恢复。
- [ ] Owner 决定网关监听范围及局域网访问认证边界。

## 本轮规划产物

- [x] 蓝图、开发计划、开发执行计划、验收清单已起草。
- [x] 六个主要页面分别生成 PNG 预览与 SVG 源图，并通过图册索引。
- [x] 目录骨架说明与任务记录已建立。
- [x] 实际前端、后端基础、接口和本地测试已实现；生产部署和真实 provider 联调仍为 `NOT_RUN`。

## 2026-11-19 实现证据修订

状态含义：`PASS` 表示本地证据已通过；`PARTIAL` 表示有实现和测试但仍缺少完整环境或 Owner 验收；`NOT_RUN` 保留给尚未执行的范围。

- 协议术语：`PARTIAL`。Owner 已选择 Responses / Messages / Chat；API profile、能力矩阵和错误语义已记录，但正式 Owner 签收和官方 schema hash 归档仍待完成。
- 上游 profile：`PASS`（本地结构范围）。Control API 会为每个上游持久化 `providerId` 与 `apiProfile`，Res/Mes/Chat 默认分别绑定 OpenAI Responses、Anthropic Messages 2026-10-21、OpenAI Chat profile；官方 schema hash 归档仍待完成。
- 协议转换：`PASS`（当前 TextCore 基线）。运行时测试覆盖六个跨协议文本方向、三条原生转发方向、文本 SSE、索引化单工具与平行工具流式增量、多函数工具定义/调用/结果和不支持能力拒绝；provider-specific 非函数事件仍未纳入。
- Desktop 启动：`PARTIAL`。supervisor 测试验证 control/Gateway 健康启动、控制 token 和 stdin 停止；真实 Electron GUI 启动截图、端口冲突界面和异常进程状态仍未运行。
- Desktop 页面与 IPC：`PARTIAL`。Desktop 22 项测试和生产构建通过；凭证、上游、路由创建/编辑/启停/删除、设置保存均已接入 preload IPC，但完整 Electron 端到端交互和窄屏实机检查仍未运行。
- 上游与模型发现：`PASS`（本机 API/模拟上游）。CRUD、删除保护、连通测试、模型发现持久化、DNS 地址快照校验均有运行时测试；真实第三方 provider 兼容性未运行。
- 凭证生命周期：`PASS`（当前实现范围）。Key 哈希存储、一次性创建/轮换回显、撤销、脱敏 UI 和控制 token 有测试；OS `safeStorage` 在当前 Desktop 路径优先使用，非可用 fallback 仍需发布策略审查。
- 日志与指标：`PARTIAL`。正文/密钥不写入，调用耗时、错误/拒绝代码、查询和聚合 metrics 已实现；保留条数可配置并有边界测试，容量压测、告警阈值和持久化运维演练未完成。
- SSRF 与网络边界：`PARTIAL`。loopback/private 显式信任、元数据拒绝、DNS 地址快照、重定向手动处理和请求超时已实现；仍需真实 DNS 重绑定/peer 绑定测试和跨平台网络验证。
- 发布与部署：`PARTIAL`。Electron Builder `desktop:dist` 已生成 Windows x64 unpacked 产物，`desktop:installer` 已生成 NSIS 安装器，`verify:release` 已校验产物、runtime 文件及 SHA-256，packaged smoke 已验证自包含运行时和 `--version` 退出；更新下载/签名校验/用户触发安装代码已实现并有本地下载测试，但真实签名安装器、干净机器安装和发布 Owner 签收未运行。
- Owner acceptance / merge / release：`NOT_RUN`。当前分支尚未提交、推送或合并。

## 2026-11-19 后续实现证据

- 控制面网络边界：`PASS`（本地回归范围）。地址分类覆盖整个 IPv4 loopback/RFC1918、IPv4-mapped IPv6、ULA、link-local、未指定和 metadata 地址；模型发现连接固定到批准的解析地址，更新目标不会继承旧私网信任。
- Gateway 网络边界：`PASS`（本地回归范围）。Gateway 与控制面一致拒绝混合公网/私网 DNS、link-local、metadata、未指定和未批准地址，并覆盖 DNS 漂移回归。
- 平行工具流：`PASS`（标准 SSE 事件范围）。Chat↔Messages、Chat→Responses 的多工具 start/argument 增量会保留工具索引和请求关联 ID；非标准 provider 事件仍需单独 profile。
- Electron 页面信任：`PASS`（本地回归范围）。IPC sender 与导航仅接受应用自身 `dist/index.html` 或精确 dev origin；任意本地 `file://` 页面和 userinfo 伪造 origin 均被拒绝。
- 路由完整性：`PASS`（本地回归范围）。PATCH 更新会复用创建时的活动 alias/inbound 冲突检查；Desktop 运行时新增编辑弹窗并覆盖保存回读。
- 日志保留：`PASS`（本地回归范围）。`settings.usageRetentionCount` 有 1–100000 边界校验，Gateway append 使用该上限，Desktop 设置页可保存。
- Packaged runtime：`PASS`（本地 Windows x64）。发布包通过 `extraResources` 携带 services/packages/scripts；packaged Electron 直接加载本地 runtime 模块，`npm run smoke:packaged` 退出码 0。
- Release manifest：`PASS`（本地 Windows x64）。`verify:release` 现在同时校验 packaged runtime 的 control、Gateway、shared storage 和 update script 文件，不只校验外层安装器。
- Desktop 白屏回归：`PASS`（本地 Windows x64）。修正 Vite packaged build 的资源基路径为相对路径，`file://` 加载的 JS/CSS 可正常解析；新增构建产物回归测试并重新通过 packaged smoke。
- 上游测试交互：`PASS`（组件回归范围）。运行时测试按钮使用独立测试色，点击后显示加载态并禁用重复点击，成功/失败均反馈；运行时上游弹窗和页脚移除示例/模拟文案。


## Desktop 路由多选与状态反馈修订

- `PASS`：全局矢量下拉标识、模型连续多选、键盘/Escape 与模态内滚动。
- `PASS`：新增路由不再填写模型别名，按模型名批量保存；事务冲突回滚、并发批次防重复、旧调用名兼容、Gateway 按原模型名调用均有自动化覆盖。
- `PASS`：顶栏读取真实运行状态，启动/运行/失败/读取失败明确显示；固定“运行时未接入”已替换。
- `PASS`（本次改动范围）：Desktop 31/31、Runtime 48/48；打包 Electron 实际页面在 1440×900 与 960×720 完成截图和交互检查。该证据不代替全项目或真实 provider 验收。

## 多上游优先级续作

- `PARTIAL`：同名模型多上游保存、顺序和失败策略设置已有控制面、组件与模拟上游测试；阈值、4xx/5xx、连接失败、成功清零和冷却恢复已覆盖。运行时健康状态保存在进程内，重启后清零，当前失败请求不自动重发。
- `PASS`（本地自动化）：Runtime 52/52、Desktop 32/32、生产构建及新 Windows x64 解包版版本冒烟通过；并发名额回归已复现并修复。最新包中的 Gateway 文件与源码哈希一致。
- `NOT_RUN`：本次新包的完整 GUI 交互、真实 provider、独立完整项目验收、安装器签名、发布及 Owner 签收。旧 release manifest 和旧包 smoke 不作为最新包的证据。
- `PARTIAL`：独立审查指出异构协议上游没有逐目标协议能力校验或配置；切换时可能采用不兼容的出站协议。Desktop 创建上游默认 Chat，现有字段不能可靠代表能力。修复与回归验证待完成。
- Owner 后续范围澄清：优先级功能只要求主上游不可用或维护时由备用上游顶替，不要求处理异构上游协议能力适配。前一条审查记录保留作历史证据，但逐目标协议校验和适配不再是该功能的验收阻塞项；各目标继续采用该路由配置的出站协议。
