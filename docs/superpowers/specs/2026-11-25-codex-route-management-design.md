# Codex route management design
Date: 2026-11-25
Task: CXRG-CODEX-ROUTE-MANAGEMENT-20261125

## Goal and boundary
Complete the existing Codex placeholder as an operational Desktop setup manager, delivered in one open PR against master. Owner requested development and the dedicated PR. Reuse Gateway routes, client keys, shared components and trusted Electron calls. Development never reads or modifies the Owner's real Codex home and never calls real providers.

## Product flow
1. Load current local configuration status and available enabled Res routes. Show model alias, upstream names, output protocol and Gateway address. Link existing route/upstream/credential management; use their existing behavior rather than duplicate CRUD.
2. Select a route and optional reasoning effort (keep current by default; none/minimal/low/medium/high/xhigh). Enter an existing Gateway client Key or explicitly create a dedicated scoped Key through the existing createClientKey API. Keys remain only in renderer memory until confirmation.
3. Preview a small redacted managed configuration fragment and target path. A successful preview records the current file revision and the user's selection. Changing selection invalidates that preview.
4. Confirm apply in a dialog which explains provider/model replacement, plaintext client-Key storage in Codex TOML/backups, and restarting Codex for new sessions. The backend revalidates route eligibility and the Key via local GET /v1/models; no model generation. Success updates status, clears the Key and invalidates preview.
5. Show latest backup timestamp and offer restore with a confirmation dialog. Restore only when the current file matches the version created by that backup and the backup itself matches its recorded hash. External edits require a new preview and are never force-overwritten.

## Architecture and contract
Electron main only composes a separate codex-config service and codex-ipc module. Config editing/backup logic is separate from loopback network validation. Native target is path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml'); renderer supplies no path.
- getCodexStatus(): Promise<CodexStatus>
- previewCodexConfig({routeId, reasoningEffort?}): Promise<CodexPreview>
- applyCodexConfig({routeId, reasoningEffort?, clientKey, expectedRevision}): Promise<CodexStatus>
- restoreCodexConfig({backupId, expectedRevision}): Promise<CodexStatus>
All IPC channels use runtime:codex-status / runtime:codex-preview / runtime:codex-apply / runtime:codex-restore and trustedSender checks.
CodexStatus has configPath:string, exists:boolean, revision:string, configured:boolean, model?:string, baseUrl?:string, reasoningEffort?:string, credentialConfigured:boolean, backup?:{id:string,createdAt:string}.
CodexPreview has configPath:string, revision:string, model:string, baseUrl:string, configPreview:string, replacesCurrentProvider:boolean.
Errors expose stable safe user messages, never parser source, raw IO details containing contents or tokens. ExpectedRevision is mandatory for writes, including missing-file revisions. Return no raw config or token from status/preview/apply/restore.

## Generated configuration
model = selected route alias; model_provider = 'cx_routing_gateway'. Provider name = 'Cx-Routing Gateway', base_url = actual runtime loopback address + '/v1', wire_api = 'responses', requires_openai_auth = false, supports_websockets = false, experimental_bearer_token = the validated Gateway client Key. Remove conflicting env_key/http_headers.Authorization/auth settings only within this managed provider so the selected credential is actually used. Preserve other providers, hooks, MCP, skills, permissions and project settings. Preserve current reasoning effort unless explicitly selected. Use maintained TOML AST source ranges; no regex-only editing or whole-file serialization. Keep unrelated literal values, comments, arrays and tables intact; affected inline-table spacing can normalize. Unsupported managed structures are rejected before writes. Preserve exact original bytes in the backup for restoration.

Official references checked 2026-11-25:
- https://developers.openai.com/codex/config-reference/ (wire_api responses, env_key, experimental_bearer_token, requires_openai_auth)
- https://developers.openai.com/codex/config-advanced/ (CODEX_HOME and project overrides)
Direct bearer token is documented but discouraged compared with env_key. This feature explicitly confirms its storage for one-step Desktop setup; it never changes auth.json, login state or environment variables. Project settings and startup overrides may still override the user configuration; successful save is not proof an existing Codex session switched.

## File safety and state
Bound file size, validate input lengths/enum and route uniqueness. Serialize writes. Reject symbolic links/nonregular files at managed config/backup locations. Use exclusive temporary creation, restrictive file mode, file flush and atomic replace. Keep a durable immutable backup (original bytes, missing-original marker, before/after hashes) before replacing config. Recheck revision immediately before replacement to catch modifications during preparation. Backup directory stays under fixed Codex home; backup IDs are validated, not renderer paths. Keep recovery metadata consistent across failed write/restore and restart. Unexpected IO failures are sanitized. Document residual race limits with noncooperating external file writers; do not claim OS-wide locking.

## Visual and engineering direction
Match current white/gray Gateway shell, blue actions, Geist text and existing tokens. The main question is: which Gateway route will the next Codex session use? Show a concise current-state row, setup form and redacted preview, with backup recovery below. No new shell/theme or invented metrics. Reuse Button, CustomSelect, Modal, PageHeader, WorkspaceState and workspace data. Browser fixture mode visibly offers preview context only and cannot apply, restore or generate keys. Check wide (1440), desktop minimum (816), narrow (390), keyboard, focus and long paths.

## Review revision 1
Independent review identified loss of unrelated TOML numeric types/date precision in whole-file serialization. Use toml-eslint-parser source ranges for structural edits and smol-toml BigInt-aware validation instead. Rewrite only managed values and incompatible managed auth selectors; retain unrelated scalar source, comments, arrays and tables. Inline managed tables can have whitespace normalized. Unsupported/ambiguous managed table shapes are rejected during preview before writes. No blanket serialization/comment removal. Add CODEX_CONFIG_UNSUPPORTED to the stable error contract.

Renderer review requires independent request lifecycles for status, preview and committed mutations. Gate actions until both workspace and native refresh finish; a late invalidation must never suppress an apply/restore result or leave busy state stuck. Newly created Key results retain their original model scope and cannot silently apply to a changed route.

## Evidence and rollback
Focused failing tests first; service tests use isolated Codex homes, real IO, local Control/Gateway fixtures and no external providers. Cover invalid config, stale preview, apply failure, restore conflict/tamper, symlinks, concurrent writes, missing-original restore and secret redaction. UI covers eligible routes, key creation, confirmations, stale preview, failures and no native runtime. Then full Runtime/Desktop suites, production build, browser screenshots and independent review. No merge/release or real installed-client acceptance is claimed. Keep backups and task artifacts.
