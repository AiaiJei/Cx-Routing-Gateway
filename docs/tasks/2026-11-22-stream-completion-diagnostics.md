# Stream Completion Diagnostics

- Task ID: `CXRG-STREAM-COMPLETION-DIAGNOSTICS-2026-11-22`
- Project/repository: Cx-Routing Gateway / `AiaiJei/Cx-Routing-Gateway`
- Contract: `.codex/awg-task.json`
- Base: `master` at `0f57028f80b0707a2d32a83af5bba4f31bf9bb73`
- Branch/worktree: `codex/protocol-completion-state` / `.worktree/protocol-completion-state`
- Status: implementation committed; independent review and PR creation pending.

## Scope

Require protocol-specific terminal evidence for Chat, Messages, and Responses streams. Record suspected empty completions, missing usage, missing terminal events, explicit stream failure, upstream socket resets, and client cancellation with bounded metadata. Preserve partial metrics and legacy log behavior. No real provider calls, retries after streaming begins, schema migration, release, or merge are included.

## Implementation

- `1f44bd2` (`fix: validate streaming protocol completion`) adds bounded protocol completion and output observation to the existing metrics observer.
- `17f9275` (`fix: record stream completion and disconnect causes`) enforces completion in passthrough and converted streams, normalizes disconnects, withholds invalid Chat `[DONE]`, and records sanitized outcomes.
- `838595e` (`feat: surface empty stream diagnostics in logs`) maps optional evidence to concise status badges and full detail text while keeping old rows unchanged.

The UI distinguishes an empty completed stream from a response that produced content but omitted usage. Status badges use short labels to fit the existing fixed-width log table; tooltips and request details include protocol, output, usage, HTTP, and normalized error evidence.

## Verification

See [verification evidence](evidence/stream-completion-diagnostics/verification.md).

## Limits

No real New API or Sub2API request was made. The implementation can identify only evidence exposed by the upstream stream; a provider that fabricates a valid completed event without content remains a suspected empty response, not a confirmed provider-internal cause. Owner acceptance, merge, release, and packaged Desktop runtime verification remain pending.

## Capability Record

- Skills invoked: `using-superpowers`, `awg-workspace-governance`, `systematic-debugging`, `test-driven-development`, `executing-plans`, `using-git-worktrees`, `verification-before-completion`, `requesting-code-review`, and `finishing-a-development-branch`.
- AWG MCP catalog inspected. No Repo Map call was made because source tracing and executable tests provided the required bounded navigation; no external MCP side effect was needed.
- `task-brief` was available and used. The installed plan-execution bundle did not include its referenced `task-start` or `task-done` scripts; focused and full test commands were run directly and a progress ledger was retained in the plan workspace.
- Real New API/Sub2API calls: `NOT_RUN` by contract.
- Electron installer, release, merge, and Owner acceptance: `NOT_RUN` by scope.
