# Request log refresh Implementation Plan

> **For agentic workers:** Use awg-governance:executing-plans inline; one fresh reviewer checks the completed branch. Steps use checkbox tracking.

**Goal:** Add manual refresh and 1500 ms polling to request logs, bump to 1.0.3, create a dedicated PR.
**Architecture:** Extend the existing workspace Hook with opt-in polling, refresh status and lifecycle guards. LogsPage selects the interval and renders existing button/error styles. Existing runtime client, IPC and authentication remain the data path.
**Tech Stack:** React 18, TypeScript, Vitest/Testing Library, Vite, existing Electron/runtime.
**Spec:** docs/superpowers/specs/2026-11-20-request-log-refresh-design.md

## Global Constraints

- Base `272e443` (merged PR #7); product version exactly `1.0.3`.
- Only LogsPage polls, every `1500` ms while visible; no overlapping reads.
- Preserve rows, filters and details. Never show fixture fallback after runtime error.
- Reuse components/interfaces. No backend change, new dependency, merge or release.
- Worktree `.worktree/request-logs-refresh-1.0.3`; evidence `.task-evidence/`. Existing files/worktrees preserved.

## Review Focus

- Slow reads spanning ticks/manual clicks remain single-flight.
- Initial/later failures both recover without fixture leakage.
- Hidden tabs, return and unmount release timers/listeners.
- StrictMode/client replacement ignore responses from an old lifecycle.
- Background updates preserve search/status/detail UI and avoid loading flicker.

## Task 1: Polling and refresh lifecycle

Files: `apps/desktop/src/data/use-workspace.ts`, new `use-workspace.test.tsx`.
Consumes: `WorkspaceClient.getWorkspace(): Promise<WorkspaceFixtures>`.
Produces: `useWorkspace(client?, { pollIntervalMs? }?)` with `refresh(): void`, `refreshing`, `refreshError` plus existing state.

- [x] Add behavior tests for updates, no default polling, concurrent reads, failures/recovery, visibility, unmount/client replacement/StrictMode; observe expected failures.
- [x] Implement single-flight refresh and optional interval/visibility cleanup. Separate first-load and refresh errors; retain stale data.
- [x] Run focused tests; expected all pass.

## Task 2: Logs UI and version

Files: `apps/desktop/src/pages/LogsPage.tsx`, `LogsPage.test.tsx`, Desktop package/lock versions; version-bound fixtures in `SettingsPage.test.tsx` and `tests/runtime/release-manifest.test.mjs`.
Consumes: Hook interface above, existing `Button`/`PageHeader.action`.
Produces: refresh button, quiet background polling and recoverable errors.

- [x] Add UI tests for manual refresh, arrival from empty data, preserved filters/details, initial/later failures; observe expected failures.
- [x] Implement header action/errors, opt into 1500 ms polling, bump manifest/lock to 1.0.3.
- [x] Run Desktop/Runtime suites and build; verify browser controls/layout at desktop/mobile widths.
- [x] Fresh independent review of full change against spec/focus; fix material findings with regressions.
- [x] Update records, commit explicit task paths, push task branch, create/attach PR. Keep worktree; do not merge.

## Roles and evidence

Main agent implements/verifies; fresh reviewer reads only. Raw evidence in `.task-evidence`; durable results/review/CAPABILITY in `docs/tasks/2026-11-20-request-log-refresh.md`. Rollback: revert task commits, no migration.
