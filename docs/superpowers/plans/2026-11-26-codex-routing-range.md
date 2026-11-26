# Codex Routing Range Implementation Plan

> Apply superpowers:subagent-driven-development. Fresh implementers own independent packages; coordinator owns shared contracts/integration. No commits despite generic skill defaults; this local revision has no Git integration authorization.

**Goal:** Repair Codex cross-protocol sessions and move reasoning limits to unified model routes.
**Architecture:** Preserve protocol adapters and authenticated control API; add a small route policy module, split the route editor from its page, and extend managed native catalog/config projections.
**Tech Stack:** Node HTTP, Electron CJS, React/TypeScript, Vitest and node:test.
**Spec:** docs/superpowers/specs/2026-11-26-codex-routing-range-design.md.

- [x] Protocol package: reproduce default installedCLI web_search rejection; correct developer/reasoning/history and tool/stream behavior in services/gateway/src/protocol-adapters.mjs and focused new protocol tests. Own this adapter exclusively; no Gateway server or native edits. Use actual isolated Codex Chat/Mes fixture chain; retain all local tools.
- [x] Route runtime package: own services/local-control/src/server.mjs, new route service/policy modules, packages/shared/src/reasoning-policy.mjs, services/gateway/src/server.mjs and new tests/runtime/route-reasoning*.mjs. Validate/persist/clear per-model intervals and enforce/log effective values across all nine protocol pairs and failover. Preserve route identity/auth/compatibility.
- [x] Native package: own apps/desktop/electron/codex-runtime-client.cjs, codex-config-service.cjs, codex-model-catalog.cjs and necessary codex-direct-* projections plus dedicated new native test file. Pass per-route intervals through catalogv3; compatible v1/v2 recognition; explicit web_search policy/capture/restore and preview facts. Do not change renderer, adapter or Control API.
- [x] UI package: own RoutesPage*, new RouteEditor*/route-selection helpers, styles/routes.css, domain/types.ts, workspace-client mapping/tests; related Codex UI help/confirmation text after native contract agreement. One horizontal upstream selector; unified de-duplicated models; per-model min/max; grouped protocols; robust save/error/keyboard/responsive behavior. Preserve preview/live distinction.
- [x] Coordinator: contract/snapshot, public-source evidence, shared interfaces, independent reviews, full Runtime/Desktop/build/audit, browser/Electron/installedCLI proofs, separate portable Desktop delivery and data preservation. Complete requirement-by-requirement acceptance, leave real provider results unclaimed.

Each package: inspect callers, add meaningful failing test, implement bounded fix, run focused tests, freeze and review. Reviewer findings get regression cases before closure. Do not edit another owner's files without coordinator agreement.

Complete local delivery. Runtime468/Desktop292/build/audit0/reviews/actualCodexlocaltools/nativeUI/Desktoptwo-launch checksPASS. Realprovider/OwnerretentionNOT_RUN; PR25unchanged, localuncommitted/unpushed.
