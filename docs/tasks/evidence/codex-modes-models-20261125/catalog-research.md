# Codex native model catalogue evidence

Date2026-11-25. Installed official CLI path: LocalAppData/Programs/OpenAI/Codex/bin/codex.exe, version0.167.0. No actual account login or generation used.

- Official config reference/schema identifies user-level model_catalog_json as startup-only absolute JSON path; ordinary /v1/models is a different shape.
- Source ModelsResponse wraps ModelInfo entries; visibility=list exposes them to picker, supported_in_api=true admits custom-token provider context. Unknown capability metadata is omitted/defaulted rather than copied from named OpenAI models.
- Initial isolated probe omitted required base instructions. app-server initialized with bundled fallback, while config/read revealed explicit parse failure (missing both base_instructions/model_messages.instructions_template). Therefore startup success alone was not accepted as evidence.
- Corrected probe uses the unmodified generic Codex fallback prompt from pinned rust-v0.167.0 commit cb41599ccbe371272892f156286a236aa097bada, distributed with Apache2 LICENSE/NOTICE. SHA256 AC8AE107A0D72FE3476B430AFB161EA4E67DA2E446D778AEFC44828160559807. No model-specific policy/guardian/entitlement instructions copied.
- Actual app-server initialize → initialized → config/read → model/list returned exactly cxrg-picker-alpha and cxrg-picker-beta, and config/read confirmed cx_routing_gateway, local catalog path and selected model. Provider base URL was inert127.0.0.1:9, synthetic token only.
- model/list default comes from catalog priority, independently of config.model. Implementation must set selected default priority0 and all other priorities greater than0; final generated-catalog probe will assert both.
- CLI reported project-local config disabled because fixture project is untrusted. This expected isolation diagnostic was retained; no project trust was changed.
- Probe files/results reside in ignored .tmp/codex-modes-models-20261125; final generated-catalog/official-mode probe remains pending backend completion.

References: https://developers.openai.com/codex/config-reference/ ; https://developers.openai.com/codex/auth/ ; https://github.com/openai/codex/blob/rust-v0.167.0/codex-rs/models-manager/prompt.md ; protocol/src/openai_models.rs in the official repository.
