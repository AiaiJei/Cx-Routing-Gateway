# Verification Evidence

Date: 2026-11-22

## Results

- Runtime: `npm test` -> 138/138 passed.
- Desktop: `npm test` in `apps/desktop` -> 145/145 passed.
- Desktop focused adapter/log UI tests -> 26/26 passed.
- Desktop production build: `npm run build` -> TypeScript and Vite build passed.
- `git diff --check` and the base-to-branch diff check -> passed after final documentation edits.

The Runtime suite passed again after the Desktop build completed. An earlier parallel Runtime/build run briefly failed because the Runtime asset test read `apps/desktop/dist/index.html` while Vite was replacing `dist`; the serialized Runtime rerun passed in full.

## Focused Scenarios

- Chat requires both a nonempty `finish_reason` and `[DONE]`; a split sentinel is preserved only for a valid completion. Invalid `[DONE]` is withheld, including a frame with an additional SSE `event:` field.
- Messages `message_stop` and completed Responses events are accepted. Responses failure/incomplete events and terminal events without `response.status: completed` are rejected.
- Converted Responses terminal events do not emit downstream success when status is incomplete or absent. Before downstream bytes are sent the Gateway returns 502; after partial output it closes the stream without a success terminator.
- A valid empty stream with absent usage or explicit zero output tokens is logged as `upstream_empty_response`. Content with absent usage stays successful and does not invent token values.
- An upstream reset after first content preserves TTFT, is not retried, and releases concurrency. Client cancellation is logged as `client_disconnected`, cancels the upstream, preserves TTFT, releases concurrency, and does not open the primary upstream's failover circuit.
- Desktop adapter and detail views show completion, output, usage, reset, and cancellation evidence. Legacy log rows without optional metadata retain the existing success/failure labels.

All upstream behavior was exercised with local HTTP fixtures. No real provider endpoint was contacted.
