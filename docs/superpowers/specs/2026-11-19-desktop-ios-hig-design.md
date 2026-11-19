# Desktop Frontend iOS-Inspired Refinement

## Intent

Polish the existing Cx-Routing Gateway Desktop workspace with the clarity, semantic color, grouped surfaces, and direct controls associated with Apple's platform design guidance. Keep it recognizable as a dense desktop operations tool.

## Goals

- Remove the product/site title from the left sidebar; retain product identity in the native title bar and workspace header.
- Give each of the six navigation destinations a distinct, consistent SVG line icon that is hidden from assistive technology when the link label already names the destination.
- Use a restrained system-like blue accent, meaningful success/warning/error colors, and consistent per-protocol colors for Res, Mes, and Chat.
- Refine shared controls and grouped settings/summary surfaces with clear selected, focus, hover, and disabled states.
- Preserve all existing fixture and simulated-state disclosures, data behavior, responsive layouts, and keyboard operation.

## Non-goals

- No iOS or macOS interface clone, theme switch, new runtime behavior, API, network request, credential persistence, dependency migration, or backend change.
- No changes to the six destinations, their labels, or routing semantics.

## Approaches

1. Apply independent color and component styles to each page. This can create more visible variety but risks inconsistent meaning and repeated styling.
2. Define shared semantic color tokens and controls, then apply them to existing pages and navigation. **Selected:** it creates variety through stable status and protocol meanings while keeping the current product structure and component boundaries.

## Design

Use the existing React/Vite/Electron stack and CSS architecture. Keep the current brand mark and name in the window title bar and product name in the workspace header; remove only the sidebar brand link. Add one small navigation icon component for Overview, Upstreams, Routes, Logs, Credentials, and Settings. Use shared tokens for system-blue interaction states and distinct protocol/status colors. Restyle the existing log status filter as a compact segmented control, and use grouped row treatments where the existing content already forms a settings or overview group. Avoid decorative color blocks and retain text labels alongside all meaningful color.

## Verification and rollback

Run the desktop component suite and production build, check keyboard behavior for navigation and the segmented control, and inspect screenshots at desktop and narrow widths. Rollback is the dedicated PR; there are no persistent runtime side effects.
