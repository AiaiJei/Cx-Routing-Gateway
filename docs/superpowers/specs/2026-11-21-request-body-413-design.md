# Large request forwarding and 413 diagnosis

## Intent

Codex requests sent through Cx-Routing Gateway can exceed 1 MiB. The Gateway currently rejects those requests before routing, while the same provider succeeds when called directly. This change lets normal large model requests reach the selected upstream and keeps an explicit, bounded protection against oversized bodies.

## Goals

- Forward a same-protocol `/v1/responses` payload larger than 1 MiB without changing its content.
- Raise the default inbound body ceiling from 1 MiB to 64 MiB.
- Allow operators to set `CXRG_MAX_REQUEST_BODY_BYTES` to a positive integer.
- Return HTTP 413 with `request_body_too_large` and the configured byte limit when the bound is exceeded.
- Preserve byte-accurate UTF-8 decoding when a request is split across transport chunks.

## Non-goals

- Raising provider-side limits or changing CC Switch.
- Removing the Gateway's request-size protection.
- Redesigning protocol conversion, routing, storage, or authentication.
- Persisting request bodies or changing usage log schema.

## Approaches

1. Remove the limit. This accepts unbounded bodies and creates avoidable memory pressure, so it does not fit.
2. Raise the existing limit and make it configurable. This addresses the reproduced failure while retaining a clear resource boundary and minimal implementation surface. Chosen.
3. Stream directly to the upstream while parsing only the model. This avoids full buffering but conflicts with route selection, failover, protocol conversion, and sanitization; it is a larger redesign than this bug requires.

## Behavior

`createGatewayServer` accepts `maxRequestBodyBytes`; its default is 64 MiB, or a valid positive integer from `CXRG_MAX_REQUEST_BODY_BYTES`. A declared `Content-Length` above the limit is rejected before buffering. Chunked bodies are drained without retaining bytes after the limit, then rejected. The response body identifies `request_body_too_large`, includes the limit, and carries the Gateway request ID.

## Verification

- A 1.1 MiB Responses request reaches a mock upstream intact and returns 200.
- Injected limits reject larger requests with 413 and do not contact the upstream.
- The existing Runtime suite, chunked/UTF-8 boundaries, and whitespace checks remain green.

## Rollback

Revert the task commit. No user configuration or persisted data migration is required.
