# Codex modes and model selection design — revision3
Date: 2026-11-25. Task CXRG-CODEX-ROUTE-MANAGEMENT-20261125.
Owner explicitly confirmed: selected Gateway models appear in Codex model picker, one default; direct mode is official ChatGPT account use.

## Product
Navigation label Codex, group 工作区, immediately after 总览; keep /codex path. Page title Codex. Three accessible internal tabs: 接入设置 / 模型 / 配置与恢复. Match existing Gateway white/gray/blue tokens and components.
接入设置 chooses mutually exclusive Codex 官方直登 or CX-RG 网关. State distinguishes current saved mode, draft choice, actual CLI login status and unavailable CLI. 官方 mode works without Gateway runtime. Native official browser login is an explicitly confirmed product action, performed by installed Codex; do not fake success or embed OAuth/token collection. No multi-account storage.
模型 lists enabled Responses routes with checkbox, alias, upstream, protocol, unavailable state, search/select all and clear. At least one selected and default belongs to selection. No independent reasoning-effort input or status. Existing model_reasoning_effort remains untouched. In official mode explain that available models/default are selected inside Codex based on the signed-in account; no invented official list.
配置与恢复 contains redacted preview and existing safe backup/restore. Main configuration/apply action should be discoverable from settings/models (go to preview tab). Tabs use tablist/tab/tabpanel + ArrowLeft/Right/Home/End and retain drafts when changing tabs.

## Native configuration contract
Keep method names getCodexStatus, previewCodexConfig, applyCodexConfig, restoreCodexConfig. New selection union:
- {mode:'official'}
- {mode:'gateway',routeIds:string[],defaultRouteId:string}
Apply adds expectedRevision:string and optional clientKey:string (gateway only). Omitted/blank Key reuses the existing managed provider Key inside native code only; validate it against every selected model. Never return a stored Key. Explicit new Key creation reuses createClientKey(name, aliases) for all selected model aliases.
Preview: {configPath,revision,mode,model?:string,baseUrl?:string,configPreview,replacesCurrentProvider,catalogPreview?:string,selectedModelAliases:string[]}.
Status: existing configPath/exists/revision/configured/model/baseUrl/credentialConfigured/backup plus mode:'official'|'gateway'|'other', selectedRouteIds:string[], selectedModelAliases:string[], defaultRouteId?:string, catalogStatus:'managed'|'legacy'|'none'|'external'|'missing'|'invalid'. credentialConfigured means reusable managed Gateway Key exists, even if inactive. Existing single-model Gateway config is legacy; UI can infer matching route by alias and requires fresh catalogue apply.
No path/endpoint/executable accepted from renderer. Validate max100 unique bounded route IDs, selected default, duplicate aliases and active Responses targets. Read routes coherently then revalidate at apply. Existing getRoute may be retained privately; add resolve selection in service. Client-key catalogue validation must cover ALL aliases, not just default.

## Model catalogue and atomicity
Use supported user-level model_catalog_json with an absolute fixed managed path, not a checkbox-only permission filter. File format {models:[Codex ModelInfo descriptors], _cxrg:{version:1,routeIds,defaultRouteId,aliases}}. Native Codex ignores root extension; validate with installed Codex model/list.
Create immutable content-addressed JSON under CODEX_HOME/.cx-routing-gateway/catalogs/<sha256>.json. Validate path/file type/hash on reads, no arbitrary existing external catalogue reads. Safe bounded metadata; no secrets, arbitrary tools, instructions, model-specific capability claims or copied vendor instructions. Minimal generic text/function model metadata is based on Codex fallback descriptor, visibility:list and supported_in_api:true. Omit context_window and unknown reasoning/capability claims; supported_reasoning_levels empty/default null. Defaults use shell_type unified_exec, no web/image capabilities, truncation bytes10000. Do not disable security policies or introduce guardian overrides. Include required fields from actual parser, validate with local CLI fixture.
Write immutable catalogue BEFORE config backup/commit. Atomic config replacement is sole activation point; failures leave old config/catalogue usable. Keep referenced historical catalogues for restoration; never rewrite/delete one in use. Backup config bytes already references immutable previous catalogue; original-byte restore remains sufficient. Unsupported/missing/tampered catalogue status must be reported honestly; restore should remain available when original backup is valid. Test new-file failure, config failure, stale preview, restart restore and tampered catalogue.

## Switching mode
Gateway sets model_provider=cx_routing_gateway, model=selected default alias, model_catalog_json=generated absolute path and existing safe loopback Responses provider. Remove conflicting forced_login_method so custom token path can operate independently of ChatGPT sign-in. Preserve auth.json/keychain/login status and unrelated config.
Official sets model_provider=openai and forced_login_method=chatgpt. Remove root model (Gateway alias cannot be left as official default), model_catalog_json, openai_base_url, chatgpt_base_url and built-in model_providers.openai overrides that could keep redirecting official traffic. Preserve inactive cx_routing_gateway block (including Key) for later reuse, other providers and unrelated settings. Preview/confirmation explicitly describes removal of custom built-in endpoint/model catalogue overrides. Retained immutable catalogue/backups are not deleted. Config mode is not proof an existing Codex session switched; show restart/new-session and environment/profile override caveat. No real login or generation during development.
Restoring restores exact prior file, including old mode/catalogue references; stale revision conflict stays enforced.

## Official client and login interface
Add desktopControls:
- getCodexClientStatus(): Promise<{available:boolean,version?:string,auth:'chatgpt'|'api'|'signed_out'|'unknown',login:'idle'|'pending'|'succeeded'|'failed'}>
- startCodexLogin({expectedRevision:string}): Promise<same client status>
- cancelCodexLogin(): Promise<same client status>
Native module createCodexClientManager({codexHome,resolveExecutable?,spawnImpl?,getConfigStatus}) owns discovery/status/login lifecycle; default paths use installed official Windows Codex CLI and bounded PATH executable discovery, no shell/cmd or renderer path. --version and login status have bounded timeout/output, emit only parsed enums/version; never raw stdout/stderr, email, code/token. Login uses codex login browser flow with CODEX_HOME fixed to the same native config home and no interactive terminal. Must first validate official saved mode/revision; gate duplicate requests, timeout/cancel only its own child; app quit cancels own pending child. No logout or credential deletion by RG. Confirmation says official Codex may update its sign-in and browser must be completed by user. If unavailable, explicit CLI-not-found and official manual sign-in instructions; don't claim login.
Auth/module tests use fake child processes and temporary files. Actual CLI validation uses isolated CODEX_HOME and only model/list/config parse, no login flow or external requests.

## Sources checked
Runtime probe refinement: Codex0.167.0 refuses a catalogue missing both base_instructions and model_messages.instructions_template, silently falling back at startup before config/read reports the parse error. Bundle the unmodified Apache2-licensed generic Codex fallback prompt from pinned rust-v0.167.0 (commit cb41599ccbe371272892f156286a236aa097bada) as codex-fallback-prompt.txt, with LICENSE/NOTICE, and include it as base_instructions. This is the sole required generic template, not copied model-specific catalogue instructions or policy/capability overrides. Catalogue cap must accommodate up to100 such entries (bounded8MiB is sufficient). The earlier no-instructions wording is superseded only for this required generic fallback.

https://developers.openai.com/codex/config-reference/ — model_catalog_json startup-only; forced_login_method; providers.
https://developers.openai.com/codex/auth/ — codex login browser flow and login status.
https://github.com/openai/codex/blob/main/codex-rs/protocol/src/openai_models.rs — ModelsResponse/ModelInfo required fields.
https://github.com/openai/codex/blob/main/codex-rs/models-manager/src/model_info.rs — generic fallback metadata.
Installed CLI reports codex-cli0.167.0. Verify concrete catalogue through local app-server model/list; docs/schema alone do not establish runtime behavior.

## Verification and rollout
Focused tests first; full Runtime/Desktop/build, native roundtrip and real browser widths1440/816/390 + tabs/checkbox keyboard. Independent backend/UI/final review. Local CLI model/list must list only selected aliases; default model config must name selected default. No actual account sign-in/provider call claim. Version stays1.1.10; preserve prior internal binary and live data; new distinctly named internal candidate if packaged. No commit/push/merge/release this local retest revision.
