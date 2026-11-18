# Desktop Frontend Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable, fixture-backed Cx-Routing Gateway Desktop workspace for the six planned screens.

**Architecture:** A React/Vite/TypeScript renderer assembles a responsive shell and route-based screens. Typed fixtures sit behind a small client interface so screens consume domain-shaped data and simulated actions without pretending a backend exists.

**Tech Stack:** React 18, React Router, TypeScript, Vite, Vitest, Testing Library, IBM Plex Sans/Mono.

**Spec:** `docs/superpowers/specs/2026-11-18-desktop-frontend-phase1-design.md`

## Global Constraints

- Frontend only; no Gateway runtime, IPC server, backend API, real upstream network requests, credential persistence, or database.
- Every fixture or simulated result must be identified as simulated or unavailable where shown.
- Preserve the protocol contract: inbound protocol comes from the client request; outbound protocol comes from the route; the response returns to the original inbound protocol.
- Do not expose actual secrets; fixtures use clearly fake, masked values.
- Do not add an administrator role or hosted management dashboard.
- Keep the selected Framed Sheet direction, IBM Plex fonts, and existing React/Vite stack.
- Native Desktop packaging and Gateway lifecycle behavior remain `NOT_RUN`.

## Review Focus

- A UI action or badge could imply a live upstream or Gateway success; tests must assert simulated/unavailable language.
- A route may conflate inbound and outbound protocol; tests must assert both fields and response return semantics.
- Search or filters may fail on empty/partial fixture data; tests must cover zero results and clear/reset behavior.
- Narrow layout or keyboard navigation may hide controls; verify focus order and responsive navigation.
- Credential or log fixtures may reveal secret-like values; tests must assert masking and redaction.

---

### Task 1: Renderer Foundation and Shell

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/src/main.tsx`
- Create: `apps/desktop/src/App.tsx`
- Create: `apps/desktop/src/components/AppShell.tsx`
- Create: `apps/desktop/src/styles/tokens.css`
- Create: `apps/desktop/src/styles/app.css`
- Test: `apps/desktop/src/components/AppShell.test.tsx`

**Interfaces:**
- Produces the app root, six screen routes, shell navigation, responsive menu controls, and shared design tokens.

- [x] **Step 1: Write the failing shell test** for product identity, all six navigation destinations, current-page indication, mobile menu keyboard behavior, and skip navigation.
- [x] **Step 2: Run the focused test and confirm it fails** because the renderer and shell do not exist.
- [x] **Step 3: Add the Vite/React/TypeScript setup and minimal shell** with the Framed Sheet frame, loaded IBM Plex fonts, semantic navigation, and route placeholders.
- [x] **Step 4: Run the focused test and production build** and confirm both pass.

### Task 2: Domain Fixtures and Data Boundary

**Files:**
- Create: `apps/desktop/src/domain/types.ts`
- Create: `apps/desktop/src/data/fixtures.ts`
- Create: `apps/desktop/src/data/workspace-client.ts`
- Test: `apps/desktop/src/data/workspace-client.test.ts`

**Interfaces:**
- `WorkspaceClient` exposes typed reads for overview, upstreams, routes, logs, credentials, and settings plus local-only simulated actions.
- `fixtureWorkspaceClient` returns consistent fixture records and explicit simulation metadata.

- [x] **Step 1: Write failing client tests** for stable fixture shapes, simulated status, and masked credential values.
- [x] **Step 2: Run the focused tests and confirm they fail** because the client contract is absent.
- [x] **Step 3: Implement domain types and fixture client** with no network access and no persistent mutation.
- [x] **Step 4: Run the data tests** and confirm they pass.

### Task 3: Upstream and Route Workflows

**Files:**
- Create: `apps/desktop/src/pages/UpstreamsPage.tsx`
- Create: `apps/desktop/src/pages/UpstreamsPage.test.tsx`
- Create: `apps/desktop/src/pages/RoutesPage.tsx`
- Create: `apps/desktop/src/pages/RoutesPage.test.tsx`
- Modify: `apps/desktop/src/App.tsx`

**Interfaces:**
- Pages consume `WorkspaceClient`; submit and test actions return local simulated outcomes.
- Route records preserve separate inbound/outbound protocol values and explicit response return-to-inbound copy.

- [x] **Step 1: Write failing page tests** for empty/search states, simulated test labels, session-only forms, and inbound/outbound protocol separation.
- [x] **Step 2: Run the focused tests and confirm they fail.**
- [x] **Step 3: Implement upstream and route screens** with semantic forms, tables, action feedback, and no real network calls.
- [x] **Step 4: Run page tests and confirm simulated actions never present as live success.**

### Task 4: Overview and Call Logs

**Files:**
- Create: `apps/desktop/src/pages/OverviewPage.tsx`
- Create: `apps/desktop/src/pages/OverviewPage.test.tsx`
- Create: `apps/desktop/src/pages/LogsPage.tsx`
- Create: `apps/desktop/src/pages/LogsPage.test.tsx`
- Modify: `apps/desktop/src/App.tsx`

**Interfaces:**
- Overview uses aggregate fixture values derived from fixture records and clearly marks usage as sample data.
- Logs supports local text/status filtering, reset, and a detail view with redacted sensitive fields.

- [x] **Step 1: Write failing tests** for internally consistent overview totals, empty-filter behavior, reset, and log secret redaction.
- [x] **Step 2: Run the focused tests and confirm they fail.**
- [x] **Step 3: Implement the overview and log screens** following the Framed Sheet patterns and compact data-first layout.
- [x] **Step 4: Run the page tests and confirm totals and redaction behavior.**

### Task 5: Credentials and Settings

**Files:**
- Create: `apps/desktop/src/pages/CredentialsPage.tsx`
- Create: `apps/desktop/src/pages/CredentialsPage.test.tsx`
- Create: `apps/desktop/src/pages/SettingsPage.tsx`
- Create: `apps/desktop/src/pages/SettingsPage.test.tsx`
- Modify: `apps/desktop/src/App.tsx`

**Interfaces:**
- Credentials show only fake masked fixture values and label create/rotate/revoke actions as local demonstrations; no secret is generated or stored.
- Settings controls are presentation-only and identify runtime-dependent settings as unavailable.

- [x] **Step 1: Write failing tests** for masked values, simulated action notices, and unavailable runtime settings.
- [x] **Step 2: Run the focused tests and confirm they fail.**
- [x] **Step 3: Implement credential and settings screens** without local storage or external effects.
- [x] **Step 4: Run the page tests and confirm the UI makes no security or persistence claims.**

### Task 6: Responsive, Accessibility, and End-to-End Verification

**Files:**
- Modify: `apps/desktop/src/styles/app.css`
- Modify: `apps/desktop/package.json`
- Test: `apps/desktop/src/**/*.test.tsx`

**Interfaces:**
- App provides visible focus, labeled controls, keyboard-operable navigation/dialogs, and usable layouts at desktop and narrow widths.

- [x] **Step 1: Run all unit/component tests and the production build.**
- [ ] **Step 2: Start the local development server** and inspect all six screens at desktop and narrow viewport sizes. Desktop screenshots and navigation were inspected; narrow viewport screenshots remain `NOT_RUN` because the host browser window was minimized.
- [x] **Step 3: Exercise navigation, filters, forms, keyboard focus, and simulated/error/empty states.**
- [x] **Step 4: Fix verified defects and rerun the affected tests and build.**
- [ ] **Step 5: Record native packaging and backend integration as `NOT_RUN`; request an independent review of the final diff.**
