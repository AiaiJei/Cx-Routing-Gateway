# CXRG-REQUEST-LOGS-2026-11-19

Project/repo: Cx-Routing Gateway / AiaiJei/Cx-Routing-Gateway. Contract: .codex/awg-task.json. Base: merged PR #6 6acebc9. Branch: codex/request-logs-1.0.2. Worktree: .worktree/request-logs-1.0.2.

Plan: docs/superpowers/plans/2026-11-19-request-logs-1.0.2.md. Design: docs/superpowers/specs/2026-11-19-request-logs-design.md.

## Progress
- Inspected live PR #6 MERGED, local and origin/master equal merge SHA; fresh branch/path did not exist. Existing untracked primary worktree contents preserved.
- User detailed change request authorizes implementation and dedicated PR; process approvals not re-requested. Inline implementation with one independent reviewer.
- Native create_worktree placed checkout outside requested repo. Before edits relocated this fresh checkout via git worktree move to required in-repo .worktree/request-logs-1.0.2 and attached it. Local Git exclude protects task scratch/worktree; no unrelated paths cleaned.
- Preserved PR #6 contract verbatim in docs/tasks/2026-11-19-pr6-contract.json; new task contract has no prior merge or cleanup authorization.
- Preflight: runtime observer → stored usage → adapter → typed UI; optional fields allow old records. Repository has no existing tooltip/popover; new shared Tooltip warranted.

## CAPABILITY
Skills read/invoked: using-superpowers, awg-workspace-governance, brainstorming (direct change request), using-git-worktrees, writing-plans, executing-plans, test-driven-development + writing-good-tests, design-taste-frontend app screens (existing PR #6 design retained). Will invoke verification-before-completion/requesting-code-review/finishing before their stages.
Repo MCP: live awg_repo tools enumerated. NOT_RUN: registered workspace identity unavailable in project config, bounded direct source reads more useful for this known entry. No runtime/plugin activation inferred from static files.
Tools: exec/gh/git available, native worktree create+attach exercised. Browser/independent review pending. Temporary evidence in .task-evidence; task records tracked.

## Verification
Pending. Owner acceptance pending; real provider/native installer/publish NOT_RUN.

### Implementation findings
- Runtime JSON/SSE tests first failed for missing stream metadata; observer and Gateway instrumentation now pass. Test teardown initially raced a final credential write; retain scoped temp evidence and await store.writeQueue after closing test servers.
- Ruling: cross-protocol requests previously dropped stream=true in outboundBody, proven by an upstream fixture honoring the flag. Forward it explicitly and request Chat stream_options.include_usage so providers can return usage. This is necessary to collect the requested real stream metrics; existing response conversions stay intact.
- Version-bound Settings/release fixtures still expected 1.0.1, causing full-suite failures after the bump; update both to 1.0.2 within the version scope.
- Implementation remains in this worktree; no user runtime/config/provider requests.

## Independent review and resolution
Reviewer: fresh-context gpt-6-astra/high, read-only whole branch (base 6acebc9). Initial verdict With fixes, no Critical finding or body persistence leak.

- P2: Tooltip closed when clicking request ID. Browser reproduced click falling through; regression `keeps selectable details open when pointer focus moves into the floating panel` failed, then passed with focus staying inside the portal and Escape restoring the trigger. Keyboard Tab/Enter/Escape test also passes.
- P2: Reported total stayed stale after component-only usage update. Regression 10+1=11 then output=3 first failed (11), then passed (13) after invalidating a total when its components change.
- P2: Mes total treated missing/invalid cache counts as zero. Regression first failed (16), then passed (unknown) after requiring known cache components for derived Mes totals.
- Release check note regraded as dependency-integrity risk: request-metrics.mjs is now an unconditional Gateway import; an incomplete package cannot start. Added it to required release artifacts and proved a missing module is rejected (RED→GREEN).
- No deferred actionable findings. Fixes verified by regression and full suites; no redundant second whole-branch review.

Rulings on reviewer boundaries:
- Real-provider compatibility of Chat include_usage remains NOT_RUN. Standard Chat streaming usage is requested to satisfy logged token counts; provider-specific compatibility is a remaining acceptance limit, and no automatic retry of a charged request is introduced.
- Existing cross-protocol SDK transformation scope is unchanged apart from forwarding stream=true. Existing full runtime regression passed; this is not proof of every SDK/provider.
- Deprecated Chat function_call and Responses custom-tool/audio-only generation events remain unmeasured for TTFT; UI displays —. Standard text/refusal/reasoning/function-tool streams are covered. Unknown events never get a fabricated time.
- Native installer was not requested; screenshot evidence is real-browser fixture mode, not a native runtime or real-provider acceptance claim.

## Final verification (2026-11-19)
- `npm test`: 72/72 passed, including bounded SSE, zero/invalid/missing counters, stale totals, Mes cache accounting, Gateway→Control JSON/SSE usage, same/cross-protocol stream forwarding, failure type, and release dependency validation.
- `npm test --prefix apps/desktop`: 61/61 passed (18 files), including adapter compatibility, search/filter/detail, accessible disclosures, pointer/keyboard behavior, shell navigation and version display.
- `npm run build --prefix apps/desktop`: PASS (TypeScript + production Vite build).
- `npm audit --prefix apps/desktop --omit=dev --ignore-scripts --allow-scripts=`: 0 vulnerabilities.
- `git -c core.whitespace=cr-at-eol diff --check`: PASS.
- Taste app lint: 0 FAIL / 2 WARN, both intentional: shadow on the floating tooltip; em dash is the requested truthful missing-data marker. Existing PR #6 style retained; no random redesign.
- Real browser via CUA: 1440×900, 768×1024, 390×844. Document widths exactly match viewport; at 1440 all columns fit; at 768/390 only table scrolls horizontally. At 390 token popup x32..382 remains in viewport, outside the table's clipping. Checked request ID, full protocol, token details, Escape, pointer focus and detail Modal. Viewport reset after verification.
- Browser screenshots tracked under `docs/tasks/evidence/request-logs-1.0.2/`. They contain clearly marked fixtures. The local preview remains at http://127.0.0.1:4182/#/logs.

## CAPABILITY final
Invoked requesting-code-review, verification-before-completion and finishing-a-development-branch; systematic-debugging used for observed failures. CUA browser capability exercised for DOM, viewport and screenshots; manual responsive inspection substituted for taste inspect.mjs to follow the available browser-control interface. Computer-use Windows instructions were read; native Windows automation NOT_RUN. No new dependencies. Development dependency advisories remain outside the production-only audit claim.

Task 1: complete. Task 2: complete. Verification and independent review: complete. Integration choice already supplied by user: commit/push dedicated branch and create PR against master. No merge, release, native installer, provider request or worktree cleanup authorized in this task. Owner acceptance remains pending.

## PR integration
- Dedicated Draft PR #7 created and attached: https://github.com/AiaiJei/Cx-Routing-Gateway/pull/7 . Base master, head codex/request-logs-1.0.2, implementation commit d5904ef.
- Push-event CI at d5904ef: runtime SUCCESS, desktop SUCCESS, package SKIPPED (expected for nonrelease branch). PR-event CI was in progress when this record was written; final live status is on PR #7.
- Main checkout remains master 6acebc9, with its original untracked directories retained. Task worktree and scratch evidence are preserved. No merge, release or deletion performed.

## 2026-11-20 Desktop 启动与集成授权修订

- 用户要求“拉起desktop”：已重新生产构建并生成 Windows x64 解包版，路径 `.task-evidence/desktop-1.0.2-20261120/win-unpacked/`，可执行文件产品版本 1.0.2.0；新增 request-metrics.mjs 随包存在。实际启动 PID 28860，窗口标题 Cx-Routing Gateway、非零窗口句柄、Responding=true，4318/4319 均由此进程监听，Gateway 和 local-control health 均 ok。未生成 NSIS 安装器；真实 provider 和原生像素验收仍未执行。
- 用户现明确授权“提交合并pr，任务工作树合并主工作树。”：覆盖原合同的 merge 排除项，授权提交本修订、将 PR #7 转为 ready 并合并远端 master、将本地主工作树 master 快进至合并提交；不授权直接推送 master、发布、删除分支或工作树。运行中的任务解包版与已有证据保留。
- 合并前核对：PR #7 OPEN/Draft、MERGEABLE/CLEAN，base master，head cf7ba943aaac13375ee8b0da422bddac36d0b012；此前 head 的 Runtime/Desktop 两套 GitHub CI 全通过。任务工作树干净，主工作树仅有原有未跟踪治理/归档目录，master 为 PR #6 合并提交 6acebc9。
- 既有独立审查及修复结论继续适用；本轮只追加授权与验证记录，无产品逻辑修改。Owner acceptance 保持独立 pending。

### 合并前回归修复：Windows 瞬时文件占用

- 本轮完整复验 Runtime 首次 71/72，失败为 `passthrough and converted streams preserve responses and persist first-generation timing and usage`，错误 Usage not persisted；Desktop 61/61、build 通过。单独重跑通过后未忽略失败，继续进行有诊断信息的并发复现。
- 第二次复现明确抓到 ConfigStore.update 的 `EPERM`：Windows 临时文件 rename 到 config.json 时被占用；Gateway appendUsage 的既有容错吞掉异常，第二条日志未写入。属于现有共享原子写入的瞬时锁冲突，被本任务新增链路测试暴露。
- 范围修订：将 packages/shared/src/config-store.mjs 与其回归测试纳入本轮必要修复；仅对 EPERM/EBUSY 的 rename 有界重试，不重放 mutator、不改变 schema 或持久化字段，其他错误立即返回。保留测试层的失败诊断以便定位后续问题。

- 修复验证：ConfigStore 新增三项回归；其中瞬时锁/重试上限测试先失败后通过，EIO 非重试测试确认立即失败。旧配置和 backup 在失败时保持原样，锁释放，下一次 update 可恢复，mutator 仅执行一次。
- 修复后 Runtime 75/75、Desktop 61/61 通过；在两套完整测试同时运行的负载下，流式日志链路连续 10/10 轮（每轮 3 项）全部通过。生产 build 在本轮前置验证已通过，后续仅修改共享 Node 存储代码和测试/文档。
- 原生已运行解包版来自 cf7ba94，本轮新增存储锁重试是源码修订，尚未重打包或替换正在运行的窗口。

- 本轮共享存储修复的独立定向审查通过：重试仅覆盖 rename 的 EPERM/EBUSY，6 次内累计等待375 ms；锁与原子替换语义保持，失败释放锁且后续队列恢复，未发现需修复问题。
