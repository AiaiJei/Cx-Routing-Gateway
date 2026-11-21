# Stream Completion and Empty-Response Diagnostics

## Intent

Create a dedicated Gateway PR that distinguishes a protocol-complete stream from a useful generated response, and records sanitized causes when a response stream is incomplete or interrupted. The primary evidence is the request log: a 61-second `Res → Res → Res` row marked successful with no first-content time or token usage, and a second row that received content before `ECONNRESET`.

## Observed behavior

- `pipeStream` copies upstream bytes and calls `metrics.finish()` when the HTTP body reaches EOF. It does not require a protocol terminal event, so an early EOF can be logged as `completed`.
- `pipeConvertedStream` recognizes some terminal events to serialize the downstream protocol, but also calls `metrics.finish()` and ends successfully without checking that the upstream stream completed normally.
- `request-metrics.mjs` extracts first-content timing and token counts, but it does not report protocol completion or whether any content was observable.
- A Responses completion containing only reasoning items can carry nonzero output-token usage while producing no user-facing answer. Reasoning deltas were also counted as observable output, hiding this case.
- The catch path stores `error.code` directly. A body reset can therefore surface as the English transport code `ECONNRESET`, without saying whether the downstream client or upstream connection ended.
- New API and Sub2API issue reports show two relevant compatibility cases: New API can emit `[DONE]` without a Chat `finish_reason` after a timed-out generation, and Sub2API can return an empty Responses completion without usage. These are version-specific reports, not proof about the user's deployment.

## Required behavior

### Terminal validation

- Chat requires both a non-null `choices[].finish_reason` and the final `[DONE]` sentinel. `[DONE]` by itself is insufficient; a proxy-generated terminator after a hidden generation timeout must not look complete to either Gateway or its client. The passthrough path holds only a bounded tail so it can remove a final invalid `[DONE]` before closing the connection.
- Messages accepts `message_stop`; an explicit error event is a stream failure.
- Responses accepts `response.completed` or the existing compatibility event `response.done` only when the embedded response status is `completed`. `response.failed`, `response.incomplete`, or an error event is a failure.
- EOF before the protocol-specific success event is `upstream_stream_incomplete`. A valid protocol failure event is `upstream_stream_failed`.
- `outputObserved` means user-facing text, refusal, tool, or media output; hidden reasoning/thinking is tracked separately as optional `reasoningObserved` metadata. A valid terminal event with no observable output is a semantic empty-response failure, `upstream_empty_response`, when output usage is absent/zero or the only observed generation is reasoning. The log separately records that the protocol did terminate and retains numeric usage, preserving the distinction between protocol completion and application usefulness.
- Known non-text output events/items (including audio and media content) count as output so they are not mislabeled as empty. Unknown non-reasoning Responses output items are treated conservatively as output.
- Successful terminal frames are held until EOF and validated. An empty completed stream does not emit a downstream success terminator; it returns a bounded Gateway error if no bytes were sent, or closes the already-started stream without a success terminator.
- A valid response with observable content but no usage remains protocol-complete and records that usage was absent; token values stay missing rather than being fabricated as zero.

### Disconnect classification

- An upstream socket reset after headers is `upstream_connection_reset`, including known nested socket error codes. Do not persist raw exception messages or arbitrary transport codes.
- A downstream client cancellation is `client_disconnected` and must not count as an upstream health failure.
- Gateway deadline expiry remains `upstream_timeout`.
- Never retry after response streaming has begun. This avoids duplicate generation or billing when the first output may already have reached the client.

### Data and UI

- Persist only bounded status metadata: stream completion state, observable-output boolean, normalized error code, existing status/HTTP fields, and existing numeric usage. Never store prompts, response bodies, raw provider error objects, credentials, or stream frames.
- Desktop shows empty/suspected-empty streams as a distinct negative request-log status, maps transport codes to Chinese descriptions, and shows completion/output/usage evidence in status details.
- Historical records without the optional metadata retain their existing status and display behavior.

## Scope and dependencies

- Runtime: extend the existing SSE observer in `services/gateway/src/request-metrics.mjs`; enforce its result in the native and converted streaming paths in `services/gateway/src/server.mjs`.
- Desktop: consume the optional fields in `apps/desktop/src/data/workspace-client.ts` and `apps/desktop/src/domain/types.ts`; render the derived status and details in `apps/desktop/src/pages/LogsPage.tsx`.
- Tests: extend existing Runtime and Desktop suites. No dependency, schema migration, routing, provider configuration, request conversion, or retry behavior is added.

## Verification and limits

Use local HTTP fixtures for Chat, Messages, and Responses. Cover valid completion, complete-but-empty (including reasoning-only output with nonzero usage), non-text media output, invalid early Chat `[DONE]` before a later valid completion in the same chunk, missing terminal, explicit failure, heartbeat-only EOF, reset after first content, downstream cancellation, and old log compatibility. Run all Runtime tests, all Desktop tests, Desktop production build, and `git diff --check`. No real New API/Sub2API requests are authorized or required. A provider that fabricates a syntactically valid completion with no content cannot be diagnosed beyond the evidence it exposes; the log must say "疑似空响应" rather than claim an internal cause.

## Rollback

Revert only this task's branch commits. Preserve the existing primary worktree, all sibling worktrees, untracked governance folders, and this task worktree/evidence. Keep the dedicated PR open and unmerged.
