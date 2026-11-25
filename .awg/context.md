# Project Context

## Runtime entry and request flow

The repository contains a Windows x64 Electron desktop client, a loopback configuration API, and a loopback model Gateway. `apps/desktop/electron/main.cjs` composes the desktop IPC surface; `runtime-supervisor.cjs` starts Local Control on `127.0.0.1:4319` and Gateway on `127.0.0.1:4318`. Local Control manages upstreams, routes, client keys, settings, and sanitized request logs. Model clients call the Gateway endpoints `/v1/chat/completions`, `/v1/responses`, or `/v1/messages`; `services/gateway/src/server.mjs` authenticates the client key, resolves the model route and upstream, and uses `protocol-adapters.mjs` where a cross-protocol conversion is supported.

## State and authorization

Runtime configuration is held by the shared `ConfigStore`; upstream API keys are stored by `SecretVault` and referenced from ordinary configuration. The Electron supervisor injects a runtime control token into the Local Control process, whose management routes require a Bearer token. Gateway model requests use a client key from `Authorization: Bearer` or `x-api-key`, checked against stored key hashes and route scope. Both services bind to loopback. Do not read or copy local data-directory files, credential values, tokens, or user-level Codex authentication files for repository tasks.

## Regression paths

For Gateway or protocol changes, start with the focused files under `tests/runtime/`, then run `npm test`. For Local Control or Electron IPC/security changes, run the corresponding runtime tests and `npm --prefix apps/desktop test`; use `npm --prefix apps/desktop run build` when renderer or desktop packaging code changes. Keep provider verification on local fixtures unless a task contract separately authorizes a real call. The root README's displayed product version is not deployment evidence; verify package/source state and release evidence separately.

## Boundaries

The protocol surface is not fully equivalent across Chat, Responses, and Messages; check the task's supported-feature contract before changing conversion behavior. Private-network upstreams require explicit trust. AWG project initialization does not prove Desktop plugin loading or Hook trust; those require separate host evidence.
