# Codex capabilities revision7 implementation plan

Goal: 修复旧会话跨协议400，让逐模型能力在界面、目录、网关一致生效。
Spec: docs/tasks/2026-11-25-codex-route-management-revision7.md
Worktree: .tmp/worktrees/codex-route-management-20261125
Constraints: revision7 local only; preserve preexisting edits; no Git integration/live provider/user config access.

- [x] Protocol package: protocol-adapters.mjs and protocol-media helper/tests. RED encrypted history preserving text/tools; image Res/Chat/Mes URL/data roundtrip; malformed input rejected. GREEN normalize and serialize with structured media. Confirm same-protocol pass-through. Record scoped test evidence.
- [x] Capability contract/integrator: shared model-capabilities.cjs validation, route-service and control create/update/batch retention; Gateway applies output budget and capability rejection; native runtime-client carries capabilities; model-catalog schema4 maps context/modalities/efforts and reads legacy schema1-3. RED boundary and end-to-end HTTP tests before production edits. Preserve same-protocol parameters absent explicit policy.
- [x] UI package: route types, workspace mapping, focused RouteCapabilitiesFields, RouteEditor drafts per protocol/model and CodexModelsPanel summaries. RED input retention, save payload, validation, reset and protocol-switch tests. Preserve existing route selection behavior.
- [x] Client integration: verify actual installed Codex model/list reads context/image/reasoning metadata; local loopback request captures demonstrate image/history/output enforcement. Direct custom profiles use optional per-model capability metadata if needed to cover direct mode.
- [x] Verification and independent review: focused suites then full Runtime/Desktop/build; review delta against frozen before.json; resolve and re-review findings. Inspect real wide/narrow UI; separate local Windows portable with original binaries/data retained and hash verification.
- [x] Evidence and delivery: record CC Switch pinned source comparison, fresh acceptance limits, exact commands, artifact path/hash and PR unchanged state. Goal complete only when development deliverables done.

Ownership: protocol worker owns protocol adapter/helpers/tests; UI worker owns renderer UI/types/tests; coordinator owns shared contract/backend/native catalog/integration/evidence. Shared interfaces above are fixed; workers are not alone and must preserve others' edits. Independent review is read-only. Steps use TDD; commits omitted because current Owner policy forbids them.

Completion: local stage PASS; see acceptance.md. Direct independent custom profile capability editing deliberately not expanded; Gateway route scope fulfilled. No Git integration.
