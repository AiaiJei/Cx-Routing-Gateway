# Codex Tools and Connectivity Probe

Task: `CXRG-CODEX-TOOLS-CONNECTIVITY-PROBE-2026-11-23`
Branch: `codex/tool-definition-probe`
Base: `master` at `f58341f5224224bea9ae7abf03818d9cadb4df47`

## Result

Responses namespace groups containing function or custom tools convert to Chat and Messages definitions with reversible target names. Responses, explicit tool choices, follow-up history, and streaming restore the original tool name and namespace. Unsupported built-in tools and malformed custom formats fail with safe field- and direction-specific errors.

Post-cooldown failback checks validate DNS destinations and test transport reachability using TCP for HTTP URLs or a certificate-verified TLS handshake for HTTPS URLs. They do not retrieve credentials or send HTTP requests; existing cooldown, circuit generation, and concurrent-probe behavior remain covered.

Custom freeform formats are included as model-facing description text. Chat and Messages do not enforce arbitrary source grammars, so returned custom input is not guaranteed to satisfy those grammars.

## Scope

Credential persistence and routing state are not modified in this task; credential persistence was addressed separately in PR #19. This branch focuses on Codex tool-definition compatibility and transport-only failback checks. Release/version work was excluded by the original contract, then explicitly added as revision 1 after the user authorized version 1.1.7, PR #21 merge, GitHub publication, primary master synchronization, and Desktop delivery on 2026-11-23. No third-party provider calls are authorized or made.

## Review

The initial read-only review found two Important adapter validation gaps: undeclared Responses function choices were accepted when no tools were declared, and malformed custom grammar formats were not rejected. Both were fixed with failing tests first. The follow-up read-only review found no Critical or Important findings.

## Verification

See [verification evidence](evidence/codex-tools-connectivity-probe/verification.md) for commands, results, capability limits, and review details.

## Delivery

PR #21 was merged into `master` as `5455e0bd4c8b6397f1381ff2e31995d29e9e925e` after Runtime and Desktop checks passed; the package job was skipped by workflow condition. Revision 1 authorized version 1.1.7, GitHub publication, primary `master` synchronization, and verified Desktop delivery. Release v1.1.7 is published with Setup, blockmap, Portable, and manifest; the Desktop Portable smoke passed. The task branch/worktree remain preserved, and no real provider request was made.
