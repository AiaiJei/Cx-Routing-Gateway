# CXRG-UPSTREAM-PAYLOAD-413-2026-11-21

Project/repo: Cx-Routing Gateway / AiaiJei/Cx-Routing-Gateway  
Base: 'master' at '6446c470b6e71122d6f1dd3c5427f591ef8f2436'  
Branch/worktree: 'codex/upstream-payload-413' / '.worktree/upstream-payload-413'  
Design: 'docs/superpowers/specs/2026-11-21-upstream-payload-413-design.md'

用户选择组合修复，并补充“完整识别错误状态码，参考 Github New API 和 Sub2API”。范围现为：4 MiB 入站 JSON 上限、精确 UTF-8 'Content-Length'、显式上游状态白名单、413 映射为客户端 413 与 'upstream_payload_too_large'、429 与代表性 4xx 稳定错误码、5xx/未知状态继续规范化为 502 'upstream_error'。PR 创建获授权；合并、master 推送、删除分支/worktree 未获授权。

参考证据：New API 'service/error.go' 的 'RelayErrorHandler'/'ResetStatusCode'；Sub2API 'openai_body_limit_failover_test.go' 的 413 固定状态、脱敏和显式 passthrough 规则。当前阶段：设计待确认。实现前需确认设计文档，然后生成计划并按测试优先执行。

并行任务：仓库已有其他 worktree 和一个运行中的 Desktop 任务；本任务不读取其运行时数据、不修改其文件、不清理其目录。

## Implementation and verification

- TDD RED: focused Runtime run exposed 2 implementation failures (1 MiB rejection and upstream 400 mapped to 502); the over-limit response also lacked a stable code.
- Implementation: inbound JSON limit is 4 MiB; request bytes are buffered before UTF-8 decoding so multibyte characters split across chunks are preserved; outbound payload is serialized once after stream flags are applied and sent with exact UTF-8 `Content-Length`; explicit upstream status allowlist returns 400/401/402/403/404/408/409/413/415/422/429 with stable `upstream_*` codes; 5xx/unknown stay 502 `upstream_error`; raw `upstreamStatus` remains in usage records.
- Focused GREEN: 30/30. Full Runtime: 114/114. Desktop TypeScript/Vite production build: PASS. `git diff --check`: PASS.
- Existing failover and request-log regressions were updated to assert the approved client status contract; no retry/failover policy or stream conversion semantics changed.
- Provider calls, native Desktop interaction, installer/release, CI and Owner acceptance: NOT_RUN/pending.

## Capability

- Skills applied: using-superpowers, awg-workspace-governance, brainstorming, using-git-worktrees, systematic-debugging, writing-plans, test-driven-development, executing-plans, verification-before-completion, requesting-code-review.
- Repo MCP: NOT_RUN; repository registration/workspace identity was unavailable, so bounded source inspection and local tests were used.
- Reference evidence read-only: QuantumNous/new-api `service/error.go` (`RelayErrorHandler`, `ResetStatusCode`) and Wei-Shaw/sub2api `openai_body_limit_failover_test.go`; no reference files were modified.


