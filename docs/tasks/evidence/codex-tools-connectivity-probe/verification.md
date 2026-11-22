# Verification Evidence

Date: 2026-11-23
Task: `CXRG-CODEX-TOOLS-CONNECTIVITY-PROBE-2026-11-23`
Branch: `codex/tool-definition-probe`
Base: `f58341f5224224bea9ae7abf03818d9cadb4df47`

## Commands

| Command | Result |
| --- | --- |
| `node --test tests/runtime/protocol-adapters.test.mjs` | PASS: 20/20 |
| `node --test --test-name-pattern="(preferred TCP probe|HTTP health request|in-flight transport check|stalled post-cooldown)" tests/runtime/gateway-server.test.mjs` | PASS: 4/4 |
| `node --test tests/runtime/gateway-server.test.mjs` | PASS: 46/46 (independent review) |
| `npm test -- --test-reporter=dot` from repository root | PASS: Runtime 178/178 |
| `npm test -- --reporter=dot` from `apps/desktop` | PASS: Desktop 158/158 across 23 files |
| `npm run build` from `apps/desktop` | PASS: TypeScript and Vite production build |
| `node --check services/gateway/src/server.mjs` | PASS |
| `node --check services/gateway/src/protocol-adapters.mjs` | PASS |
| `node -e` JSON parse of the task contract and `.codex/awg-task.json` | PASS |
| `git diff --cached --check` | PASS: full staged task diff has no whitespace errors |

## Review Findings

- Initial independent review found two Important issues. Responses explicit function choices bypassed declaration lookup when the tool list was empty. Explicit `format: null` defaulted to text, and incomplete or malformed grammar formats were accepted.
- Regression tests reproduced both findings before code changes. The adapter now resolves all Responses function choices against declared tools and validates custom format objects and grammar fields. The existing valid-choice fixture now declares its tool.
- Follow-up independent review found no Critical or Important issues. It verified that absent and empty tool lists reject explicit choices with the expected field and direction; omitted formats default to text; valid Lark grammar remains accepted.
- The reviewer also ran the full Gateway test file (46/46), adapter tests (20/20), syntax checks, and a diff check.

## Behavioral Evidence

- Local adapter and Gateway fixtures cover namespaced function tools, custom tools, colliding target names, explicit choices, history, streaming, unsupported built-ins, and invalid custom formats.
- Failback fixtures cover refused TCP, recovery without an HTTP health request, shared concurrent checks, and timeout staying on backup.
- The fresh full Runtime suite includes the tool conversion cases and the persisted-upstream-credential restart test.
- Custom grammar instructions can be preserved in the target tool description, but arbitrary grammar enforcement is not supported by Chat or Messages.

## Capability and Limits

- AWG governance, verification-before-completion, requesting-code-review, receiving-code-review, and finishing-a-development-branch workflows are active. Implementation-stage skill invocations are recorded in the task contract and execution ledger.
- The AWG Repo MCP is available, but this checkout has no `.codex/repo-map.json` and no registered `workspace_id`; Repo MCP calls were not made. Local source inspection and tests were used.
- No real third-party provider request was made. Packaged Desktop quit/relaunch UI acceptance, merge, release, and Desktop binary delivery are `NOT_RUN`.
- The user authorized creating a dedicated PR; that authorization does not imply in-product Owner acceptance or permission to merge/release.
- PR: pending.
