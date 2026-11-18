# Desktop Frontend Phase 1 Design

## Intent

Deliver the first runnable Cx-Routing Gateway Desktop workspace so a local user can inspect the planned gateway workflows and exercise their UI states before a local API or Gateway runtime exists. The interface must clearly distinguish fixture data from live runtime evidence.

## Goals

- Provide a desktop application shell with navigation for overview, upstreams, model routes, logs, access credentials, and settings.
- Provide modal workflows for upstream creation and route creation; route targets may include multiple upstream services with independently selected models.
- Implement the six planned screens using the repository's page concepts and the existing Framed Sheet visual direction.
- Use coherent fixture data and provide useful loading, empty, error, unavailable, and simulated states where relevant.
- Keep UI state and presentation separate from data access so a future local IPC/API adapter can replace fixtures without rewriting screen components.
- Support desktop and narrow viewports, keyboard operation, visible focus, labels, and accessible error associations.

## Non-goals

- No Gateway process lifecycle, API/IPC server, real upstream requests, model discovery, credential persistence, authentication, database, installer, or auto-update.
- No claim that simulated health checks, model sync, request counts, or keys are live or secure production data.
- No merge, release, or deployment.

## Approaches

1. Extend static concept images only. This has little implementation cost but cannot demonstrate navigation, forms, table filters, or UI states, so it does not meet the approved runnable-frontend scope.
2. Build a runnable Desktop frontend with fixture-backed screens and an explicit adapter boundary. This follows the development plan's frontend-first phase and makes each planned workflow reviewable while keeping runtime claims honest. **Selected.**

The selected implementation uses React/Vite/TypeScript with React Router, the existing IBM Plex font packages, and a minimal Electron shell that loads the renderer in a native window. The active work is isolated on `codex/desktop-frontend-phase1`; no files from the other scaffold worktree are overwritten or moved.

## Architecture

The Desktop entry assembles the application shell and route navigation. Screen modules render product-specific workflows from typed fixture records. A small data-access boundary owns fixture reads and simulated actions; UI components do not fabricate live API responses. Shared controls are added only where screens need the same behavior and semantics. Status labels identify simulation or unavailable runtime behavior at the point of use.

The shell follows the repository's Framed Sheet direction: restrained light chrome, white work surface, IBM Plex Sans with IBM Plex Mono for identifiers, compact tables, and a responsive navigation treatment. Existing SVG page concepts guide content and labels but remain design references rather than embedded screenshots.

## Constraints and assumptions

- The product is a single-user Desktop application, not an administrator console or hosted web dashboard.
- Inbound protocol belongs to the client request; outbound protocol belongs to the selected route; response conversion returns to the original inbound protocol. The UI must preserve this distinction.
- Upstream records do not own an outbound protocol; outbound protocol is configured per model route.
- Res/Mes/Chat expansions remain labeled as planned terminology where the product has not confirmed their exact version semantics.
- No new backend behavior or security guarantee may be implied by frontend-only interactions.
- Dependencies should follow the already present React 18, Vite, TypeScript, React Router, and Vitest/Testing Library scaffold direction; do not migrate frameworks.

## Acceptance evidence

- The app starts in development and builds for production.
- Navigation reaches all six planned screens; key interactions such as search/filter, route editing, masked credential display, log filtering, and settings controls behave locally and remain visibly fixture-backed.
- Focus, labels, and responsive behavior are checked at desktop and narrow widths; simulated and unavailable states are explicit.
- Relevant unit/component checks and build pass, with visual browser inspection where tooling permits.
- Independent review checks scope honesty, keyboard access, responsive layout, route protocol direction, and regressions.

## Rollback

Revert the isolated frontend PR to return to the documentation-only baseline. No data migrations, credential writes, or external runtime effects are introduced. The uncommitted `frontend-scaffold` worktree and unrelated root untracked directories remain untouched.
