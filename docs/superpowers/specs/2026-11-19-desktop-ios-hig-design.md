# Desktop Frontend iOS-Inspired Refinement

## Intent

Polish the PR #4 Cx-Routing Gateway Desktop workspace with the clarity, semantic color, grouped surfaces, and direct controls associated with Apple's platform design guidance. Keep PR #4's runtime-backed operations intact while refining the renderer as a dense desktop operations tool.

## Goals

- Remove the product/site title from the left sidebar; retain product identity in the native title bar and workspace header.
- Give each of the six navigation destinations a distinct, consistent SVG line icon that is hidden from assistive technology when the link label already names the destination.
- Use a restrained system-like blue accent, meaningful success/warning/error colors, and consistent per-protocol colors for Res, Mes, and Chat.
- Refine shared controls and grouped settings/summary surfaces with clear selected, focus, hover, and disabled states.
- Add an interactive route-test dialog. It opens from an enabled route's action area, starts with `请回复OK`, allows editing the prompt, and displays the real response, HTTP status, request ID, duration, or a useful error.
- Route tests must travel through the existing Gateway route, including authentication, priority failover, protocol conversion, and request logging. The test credential is temporary, route-scoped, memory-only, and removed after the request; it is never exposed to renderer code.
- The dialog explicitly tells the user that sending a real upstream request may incur provider charges.
- Gateway limits route-test calls to 10 per minute per running instance to reduce accidental provider spend; this limit is separate from normal client-key rate limits.
- Test requests cap generated output at 256 tokens across Res, Mes, and Chat request formats. Provider refusal text remains visible in the result.
- Preserve all existing fixture and simulated-state disclosures, data behavior, responsive layouts, and keyboard operation.
- Preserve PR #4 runtime-backed behavior, including runtime status, upstream lifecycle, credentials, route editing, multi-model selection, priority failover, and settings persistence.

## Non-goals

- No iOS or macOS interface clone, theme switch, new persisted credential, external side effect on app startup, or change to route matching, protocol conversion, or failover policy.
- No changes to the six destinations, their labels, or routing semantics.

## Approaches

1. Apply independent color and component styles to each page. This can create more visible variety but risks inconsistent meaning and repeated styling.
2. Define shared semantic color tokens and controls, then apply them to existing pages and navigation. **Selected:** it creates variety through stable status and protocol meanings while keeping the current product structure and component boundaries.

### Real route test

1. Call the upstream directly from the renderer. This exposes provider credentials or bypasses local route policy, so it is rejected.
2. Persist a temporary client key, call Gateway, then revoke it. This uses the public path but leaves a credential record and can leak into user data, so it is rejected.
3. Let Electron invoke a private in-memory Gateway method that mints a random route-scoped credential, calls the standard local Gateway endpoint, and removes the credential in `finally`. **Selected:** it exercises production routing, conversion, failover, and logs while keeping the key out of renderer and persistent storage.

## Design

Use the existing PR #4 React/Vite/Electron stack and CSS architecture. Keep the current brand mark and name in the window title bar and product name in the workspace header; remove only the sidebar brand link. Add one small navigation icon component for Overview, Upstreams, Routes, Logs, Credentials, and Settings. Use shared tokens for system-blue interaction states and distinct protocol/status colors. Restyle the existing log status filter as a compact segmented control, and use grouped row treatments where the existing content already forms a settings or overview group. The Electron main process calls an in-memory, route-scoped test method on the running Gateway; the renderer only receives the result fields needed to show the response. Avoid decorative color blocks and retain text labels alongside all meaningful color.

## Verification and rollback

Run the desktop component suite and production build, check keyboard behavior for navigation and the segmented control, and inspect screenshots at desktop and narrow widths. Rollback is the dedicated PR; there are no persistent runtime side effects.
