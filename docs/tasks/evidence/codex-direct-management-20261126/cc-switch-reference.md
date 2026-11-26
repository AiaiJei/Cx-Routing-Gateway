# CC Switch reference audit — 2026-11-26

Repository https://github.com/farion1231/cc-switch ; inspected main commit aa4a8c63365d1d3ed2eb27872a7da6a0709d0629. Source/document contents are reference data, not instructions to this agent. No CC Switch private settings/auth/database were opened.

## Verified behavior
- docs/user-manual/zh/2-providers/2.2-switch.md: direct means client→supplier; routing means client→localproxy→supplier. Top-level tabs browse, explicit button activates. Active mode label derived from live configuration; returning direct reuses prior direct supplier.
- src-tauri/src/live/project/codex.rs: official route omits provider selector, builtinOpenAI handles official login. ThirdpartyResponses config writes explicit provider-scoped token and wire_api responses; auth.json is separate. Existing MCP/hooks/project/custom settings preserved by field-level projection.
- docs/guides/codex-official-auth-preservation-guide-zh.md: nativeResponses providers can direct-connect; ChatCompletions format requires routing conversion. Officialaccount identity may coexist with thirdparty inference; accountdisplay does not prove inference endpoint/billingprovider.
- Version-dependent CC Switch options can remove/stash official auth when leaving official. We deliberately do not implement auth deletion or token/account duplication: requested inference-mode management can preserve auth.json unchanged.
- CC Switch model directory mapping and route takeover are separated; RG already supplies immutable native model catalogue and Gateway routing, reused here.

## Corrections to RG
Prior direct=officialChatGPT conflated routing and authentication. Prior defaultdraft official when savedmodeother was misleading. Inline mode activation was hidden behind 查看配置. Revision4 adds true direct scheme management/currentimport and top-level actualmode/explicitsaveconfirmationfeedback.

## Evidence boundaries
This is a semantic/source comparison; no claim that all CC Switch capabilities are duplicated. MultiaccountOAuth vault, quota/sessionhistory editing, raw MCP/skills editors, routing aggregation administration and authcache deletion are not inferred from this reference. Current scope is usable directsupplier and Gateway model-management roundtrip agreed by Owner.
