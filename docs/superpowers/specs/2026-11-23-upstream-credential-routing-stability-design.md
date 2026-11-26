# Upstream Credential Persistence and Routing Stability

状态：待 Owner 批准。日期：2026-11-23。

## 目标

修复两个用户可见故障：退出 Desktop 后上游 API Key 不再丢失，且一次上游请求在成功或已开始向客户端发送响应后不再被来回切换；保留现有自动故障切换给后续请求使用。

## 当前证据

- `SecretVault` 已使用 AES-256-GCM、原子替换和稳定文件路径；`ConfigStore` 已使用串行更新与原子写入。现有测试验证单进程写入，但没有验证 Desktop 退出后再启动时仍使用相同 master key 与数据目录。
- Desktop 通过 `app.getPath("userData")/runtime-master.key` 生成或读取 master key，并把配置、密钥库交给内嵌运行时；需要用退出/重启回归确认该路径和密钥恢复链路，而不是在 Gateway 里缓存明文。
- Gateway 当前每次请求只选择一个可用目标；连续达到路由失败阈值后，后续请求才会选备选。截图显示 `apikey` 成功后出现三条 `a6api` 失败，不能证明一次请求内部发生了三次重试。
- 既有 failover 测试覆盖阈值、冷却和无当前请求重试，但需要补充“目标绑定到请求生命周期”和“迟到失败不能覆盖同目标成功恢复”的回归。

## 方案比较

1. **重做凭证存储并改为全局路由锁**：改动面最大，会绕过现有加密/原子组件，也会阻塞独立请求；不采用。
2. **仅延长密钥缓存生命周期并固定主上游**：可能掩盖退出恢复问题，并取消用户已配置的自动 failover；不采用。
3. **复用现有持久化组件，补齐退出/重启证据；按请求绑定目标并以代际处理迟到结果（采用）**：保留现有安全边界和自动切换，只在实际故障处收紧状态转换，回退为撤销本 PR 提交。

## 设计

### 凭证持久化

- Desktop 启动时只从稳定 `userData` 目录读取同一 master key；退出时等待运行时停止，不删除 `runtime-master.key`、`runtime/config.json` 或 `runtime/secrets.json`。
- 上游 API Key 只进入 `SecretVault`，配置只保存 `credentialRef`。更新顺序固定为：写入新密钥 → 原子更新配置引用 → 成功后清理旧引用；任何中间失败都保留旧引用和旧密钥。
- 增加真实边界回归：使用同一 dataDir/masterKey 启动控制与 Gateway，创建带 API Key 的上游，停止服务，再以同一 dataDir/masterKey 启动，确认 Gateway 能读到原凭证并成功请求本地 fixture。另测 master key 变化时明确失败并返回可诊断的 502，而不是静默生成新 key。

### 请求级路由与 failover

- 请求选择一个目标后保存该目标的 `upstreamId`、健康代际和响应状态；请求期间不重新运行目标选择。
- 只有连接错误、超时或配置的 4xx/5xx 类响应才记录一次失败；一旦收到成功头或成功 body/stream，记录一次成功并结束该请求的状态更新。
- 同目标成功无论属于当前或旧代际都清零失败与熔断时间，并递增代际；更早发起、较晚返回的失败因代际过期而被忽略。
- 自动 failover 仍只作用于后续请求；失败阈值、状态类别、60 秒冷却和当前失败请求不重试保持不变。优先目标熔断冷却到期后，后续请求先对该目标执行一次去重的 `/v1/models` 健康探测，探测成功才清除熔断并恢复优先级；探测失败继续使用备选并记录下一次探测时间。
- 健康状态按 route + target 隔离；路由相关配置变化继续刷新状态，显示名称或模型发现变化不刷新。

## 范围

包含：Desktop master-key/data-dir 重启回归，凭证更新失败保护回归，Gateway 请求目标绑定与迟到结果处理，运行时/监督器测试、任务证据和一个面向 `master` 的专属 PR。

不包含：真实第三方调用、失败阈值/冷却策略变更、路由协议重设计、发布/合并/删除分支或 worktree。

## 验收标准

- 同一 Desktop userData 退出再启动后，已保存上游 Key 仍可被 Gateway 使用；`secrets.json` 不含明文，配置只含引用。
- 新 Key 写入或配置写入失败时，旧 Key 仍可用且临时新引用会被清理。
- 一次请求最多绑定一个目标；成功后不会继续切换或再次尝试。
- 三次明确失败后，后续请求才切换备选；冷却结束不会盲目回切，只有主目标健康探测成功才恢复优先级；主目标迟到成功会恢复优先级，旧失败不能重新打开断路器。
- 运行时全量测试、Desktop 测试、TypeScript/Vite 构建、语法检查和 `git diff --check` 通过；不做真实 provider 请求。

## 角色、证据与回退

- 实施者负责源码、回归测试、构建和任务证据；独立审查者只读检查凭证边界、请求状态和范围。
- 任务合同：`docs/tasks/2026-11-23-upstream-credential-routing-stability-contract.json`。
- 计划：`docs/superpowers/plans/2026-11-23-upstream-credential-routing-stability.md`。
- 证据：`docs/tasks/evidence/upstream-credential-routing-stability/`。
- 回退只撤销本 PR 提交，保留现有 release、分支、worktree 和其他未跟踪目录。
