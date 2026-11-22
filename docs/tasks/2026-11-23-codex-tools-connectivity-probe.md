# Codex Tools and Connectivity Probe

Task: `CXRG-CODEX-TOOLS-CONNECTIVITY-PROBE-2026-11-23`
Branch: `codex/tool-definition-probe`
Base: `master` at `f58341f5224224bea9ae7abf03818d9cadb4df47`

## Result

Responses namespace groups containing function or custom tools convert to Chat and Messages definitions with reversible target names. Responses, explicit tool choices, follow-up history, and streaming restore the original tool name and namespace. Unsupported built-in tools and malformed custom formats fail with safe field- and direction-specific errors.

Post-cooldown failback checks validate DNS destinations and test transport reachability using TCP for HTTP URLs or a certificate-verified TLS handshake for HTTPS URLs. They do not retrieve credentials or send HTTP requests; existing cooldown, circuit generation, and concurrent-probe behavior remain covered.

Custom freeform formats are included as model-facing description text. Chat and Messages do not enforce arbitrary source grammars, so returned custom input is not guaranteed to satisfy those grammars.

## Scope

Credential persistence and routing state are not modified in this task; credential persistence was addressed separately in PR #19. This branch focuses on Codex tool-definition compatibility and transport-only failback checks. It does not change versions or releases and makes no third-party provider calls.

## Review

The initial read-only review found two Important adapter validation gaps: undeclared Responses function choices were accepted when no tools were declared, and malformed custom grammar formats were not rejected. Both were fixed with failing tests first. The follow-up read-only review found no Critical or Important findings.

## Verification

See [verification evidence](evidence/codex-tools-connectivity-probe/verification.md) for commands, results, capability limits, and review details.

## Delivery

One dedicated PR against `master` is authorized. It must remain open and unmerged; release, Desktop binary delivery, and branch/worktree deletion are not authorized.
