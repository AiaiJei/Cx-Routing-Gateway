# Desktop Workspace 1.0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution; one independent whole-branch review follows implementation.

**Goal:** Apply the approved rendering to the six existing Desktop pages and set the product version to 1.0.1.

**Architecture:** AppShell owns navigation and context from shared static metadata. Existing pages retain data/client/IPC responsibilities; shared CSS and presentation components provide the new layout. Desktop package metadata is the version authority for the UI, release verification and CLI defaults.

**Tech Stack:** Existing Electron, React 18, TypeScript, Vite, React Router, plain CSS, Geist; no new runtime dependency.

**Spec:** [Approved design](../specs/2026-11-19-workspace-redesign-design.md), with [refined rendering](../../concepts/workspace-redesign.png).

## Global Constraints

- User explicitly authorized implementation and version 1.0.1 on 2026-11-19. Continue PR #6 on its existing isolated worktree.
- Six routes and all current runtime actions remain available. No backend, storage schema, authentication, failover or protocol-policy change.
- Sidebar 224px, titlebar 36px, context bar 48px, desktop gutters 32px; neutral selection and primary action; protocol colors retain meaning.
- Below 1100px use folded navigation; 390px gutters 16px and 44px touch targets; wide tables scroll within a named, keyboard-accessible region.
- Keep loading, empty, error and fixture/runtime state honest. Never send real provider requests during QA.
- Scope includes version-related script changes because installer/manifest/update defaults currently hard-code 0.1.0; product version is distinct from config schema version 1.
- Commit/push to the task branch and update PR #6 are authorized. Merge, release publication, installing updates and worktree deletion are not.

## Review Focus

- Navigation opened at a narrow width: focus stays usable, Escape restores the trigger; route changes close the panel and move to main content.
- Missing/malformed upstream URLs and long target names: hostname rendering reveals no credentials or query, tables contain overflow.
- Loading/failing workspace read and empty live configuration: no fixture rows appear to be live, no invented metrics, clear state.
- Multiple upstream targets and busy route-test modal: order, protocol labels, real test controls and duplicate-send guard survive layout changes.
- Version boundary: an older signed update must not be accepted for 1.0.1; release validation must require the matching installer and blockmap.

## Task 1: Workspaces and six pages

**Files:** `apps/desktop/src/components/AppShell.tsx`, `navigation.ts`, `WindowTitleBar.tsx`, `PageHeader.tsx`, `ProtocolExplanation.tsx`, existing page files and CSS; corresponding component/page tests. Add a small `WorkspaceState` presentation component if needed to avoid repeating loading/error logic.

**Interfaces:** Navigation metadata exposes label/path/icon/group for the existing URLs. Existing `WorkspaceClient`, `useWorkspace`, `Modal`, `Button`, `TextField`, `CustomSelect`, `SegmentedControl` signatures remain. `ProtocolExplanation()` is static presentational content, not a network operation.

- [x] Install pinned dependencies with `npm ci --prefix apps/desktop`; run existing Desktop suite and build; runtime baseline after build. Keep logs in task-local ignored scratch.
- [x] Add meaningful failing tests for grouped navigation/context and keyboard focus restoration; route hostname redaction/malformed URL fallback and empty route state; pending/error workspace states. Run focused tests and confirm the expected failures.
- [x] Implement shared navigation, semantic context, titlebar mark, neutral shell, foldable keyboard navigation, tokens and coherent table/control surfaces.
- [x] Apply the shell language to all six pages; make route table match the rendering, add existing-data count and hostname, three-stage protocol diagram; preserve all live controls. Group settings, flatten overview panels and retain truthful status.
- [x] Run focused tests then the full Desktop suite and production build; fix regressions. For purely visual CSS adjustments use screenshots rather than mirror tests.
- [x] Commit the task with verification evidence.

## Task 2: Version 1.0.1

**Files:** `apps/desktop/package.json`, `package-lock.json`, version presentation in Settings, optional Vite constant declaration; `scripts/verify-release.mjs`, `check-update.mjs`, `smoke-packaged.mjs`; runtime release/update tests.

**Interfaces:** `app.getVersion()` already comes from Desktop package metadata. `checkUpdate` and `installUpdate` continue to receive `currentVersion` from Electron; remove obsolete implicit function defaults and pass explicit versions in tests. CLI default reads package metadata only in CLI execution. Release tool and packaged smoke read the same package version.

- [x] Add failing release-manifest test that requires installer/blockmap for package version and outputs that version; test signed older update against 1.0.1 is unavailable; assert Settings displays package version.
- [x] Set package and lock root to 1.0.1 with no dependency upgrades; expose package version in Settings. Derive release artifact names/version and packaged smoke expectation; give update CLI the package default, keeping packaged Electron calls explicit.
- [x] Run version-related tests, Desktop suite, build and full runtime suite. Search active product/version tooling for leftover 0.1.0; historical docs and explicit test comparison versions may remain.
- [x] Commit the version change with evidence.

## Task 3: Visual, runtime and PR verification

**Files:** task/evidence records and plan status; any narrowly necessary fixes within authorized scope.

- [x] Serve the current production build locally; inspect all six pages at 1440×900, 768×1024 and 390×844, including local table overflow and narrow navigation.
- [x] Verify long/multiple targets, empty/loading/error states and keyboard/modal behavior through meaningful component tests plus browser interactions; preserve existing route-test tests.
- [x] Run app lint/inspector where supported; record every allowed warning. Retain screenshots and critique in task-local ignored scratch.
- [ ] **PARTIAL: window not enumerated by native UI tools.** Launch Electron on isolated user data and non-conflicting ports, check window/real preload/status and safe local settings operation; no real upstream credentials or provider requests. Verify --version reports 1.0.1. If runtime tooling prevents GUI evidence, record the concrete limitation separately.
- [x] Request one independent review against base 9807fd3 with spec, this plan, changes and evidence. Resolve important findings with targeted reproductions and verification.
- [x] Commit final docs/fixes, push task branch, rewrite PR title/body for the final implementation; watch CI to completion and attach existing PR. Leave merge/Owner acceptance separately pending.

## Evidence and rollback

Task record: `docs/tasks/2026-11-19-workspace-redesign.md`; execution ledger/screenshot logs in `.tmp/workspace-implementation-1.0.1/` (repo-local, ignored, retained). Revert implementation commits to restore PR #5 UI and package version; no data migration. Keep contract revisions and results archived.

## Preflight decisions

- Native execution because shared CSS and page composition are tightly coupled; one fresh reviewer at the end. User's explicit execution instruction covers proceeding without another plan-approval pause.
- Use repository-local scratch and retained ledger to honor the user's archival rule; do not delete evidence after review.
- Navigation metadata feeds the shell only; page business state stays local. Version metadata is shared by UI/tooling only, not runtime config schema.
