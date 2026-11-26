# Codex remembered Gateway choices, reasoning and credential selection — revision5
2026-11-26. Owner asked screenshot model-selection memory, missing effort selector/request, configscope label, existing-key dropdown. Prior semantics/directproviders/modes retained.

## Requirements
- Remember selected Gateway routeIds/defaultRouteId/credential source+ID across navigation, restart and direct↔Gateway switch, including unfinished choices. Persist draft only, never autoapply Codex configuration. Label local draft saved vs actual appliedconfig.
- Stale/deleted/disabled route selections remain visible with repair guidance; don't silently reinterpret into different route. A delayed initialization must not overwrite user's current edits; writes serialized/debounced, errors visible. No secret in browserstorage or memoryfile.
- Restore prior savedGateway config/cached selection firsttime: if no draft, use active managedcatalog metadata; otherwise remember userdraft. Draft remains when direct active. Corruption should be explicit, not overwrite unsafe file.
- Gateway scope prominent: “作用范围：当前用户（CODEX_HOME/config.toml），影响使用此目录的 Codex CLI/Desktop；不是系统全局，也不是当前项目配置。已有会话需重启/新会话，profile/启动参数可能覆盖。” Show native resolvedpath. Duplicate brief inconfirm. No inference of allclients actuallyusing samehome.
- Fix Codex reasoning picker via modelcatalog; keep reasoning settings IN CODEX, no separate RG per-model effort UI demanded. Gateway catalog standard request options none/minimal/low/medium/high/xhigh, defaultmedium when noexplicitCodexeffort; preserve existingmodel_reasoning_effort. SupportsEffortUpdates false (requestparameter, notconfiguration_update). Unknown actualprovider effort support not claimed; concise help says forwarded value accepted by upstream or explicitprovidererror.
- Existing directcatalog semantics must remain compatible; don't change genericdirect modelmetadata unnecessarily. Version old managedcatalogs read/restore remain valid.
- Protocol conversion normalizes Chat.reasoning_effort as well as Res.reasoning.effort/Mes.output_config.effort; serializes effort to each destination includingChat, preserves none/low/etc; invalid/absent stays absent (bounded string existingpolicy). Sameprotocol passthrough unchanged. Requestlogs already captureinbound effort; local actualPOST tests verifyforwardedfield Res→Chat/Mes/Res. At least one actual installedCodex run emits reasoning into localGateway/mock end-to-end; no realmodel/provider.
- Credentials dropdown includes enabled existingclientKey metadata (name/scope/retrievability/current) and disabled/revoked truthful states; currentlyconfigured Gateway token auto matched by SHA256 natively, without returning raw token to renderer. Select ID native resolve+validate atapply; clear invalid/revoked selectionguidance, don't silently substitute.
- New/rotated clientKeys stored encrypted via existing SecretVault, retaining SHA256 keyHash auth. No plaintextkey inordinaryconfig, logs/list/status. SecretVault ref notpublic. Legacy hash-only key cannotbe recovered; label “旧凭证未保存原文，请补录原 Key” and provide explicitpasswordinput save-original action afterhashmatch; never auto-rotate. CurrentCodexmanagedtoken mayretainnatively aftermatchingrecord, via explicit读取当前配置凭证 button; no decode/resolutionofauth.json/foreignprovider.
- Prior manuallytypedgatewaykey remains fallback. UI sourcechoices existing ID/currentconfigured/manual; draft stores only enum+ID. Native apply exactlyone secretinput choice and rejectambiguity. “读取当前配置凭证” performs nativevalidation+vaultretain and refresheslist/selection, never sendsrawKeytoUI.

## Control API (credential worker)
Create separate client-key module ifkeepsentrysmall, reuseexistingstore/vault.
GET /v1/control/client-keys -> {credentials:[{id,name,scope:string[],enabled:boolean,secretAvailable:boolean}]} (metadata).
POST /v1/control/client-keys/match body{keyHash:<64lowerhex>} -> {credential?:metadata}; authenticated read-only enabled-record lookup. Native computes SHA256 of the currently configured managed token locally, so matching requires neither exposing hashes in metadata nor requesting every stored secret. No raw token/hash in URLs; no logging of input.
GET /v1/control/client-keys/:id/secret -> {id,key} onlycontroltoken-authenticated, enabledhashvalid; revoked404/409safe, legacy409key_secret_unavailable, verifysha matches keyHash aftervaultread.
POST /v1/control/client-keys/:id/secret body{key} -> metadata; explicitretain existingoriginal only, comparehashwithin serializedstoretransaction; noauth/keyscope mutation; rejectwrong/stale/rotatedkey. No genericshowkeys inworkspacestate.
Existing create/rotate usesclientKey.secretRef encryptedvault storage, newsecretbeforestorecommit rollbackorphanonfailure; handleconcurrent rotate/revoke/delete noresurrection; remove oldsecret on successfulrotation/permanentdelete, revoke disablesreading(retainciphertore-enableexistingrotationflow). Ensureerrorstatussanitized and list stripskeyHash/secretRef.
No bypassGatewayauthentication/controlbearer.

## Native APIs (native worker)
New:
getCodexGatewayPreferences() -> {revision:string,exists:boolean,routeIds:string[],defaultRouteId:string,credentialSource:'current'|'stored'|'manual',credentialId?:string}
saveCodexGatewayPreferences({expectedRevision,routeIds,defaultRouteId,credentialSource,credentialId?}) -> same. max100 uniqueIDs/defaultinselection or empty; fixed appUserData/codex-gateway-preferences.json; bounded strictschema/links/revision/atomic, perCODEX_HOME binding (hash root) so homesnever sharechoices; noKey,searchoptionalnotrequired.
getCodexGatewayCredentials() -> {credentials:[{id,name,scope,enabled,secretAvailable,current:boolean}],currentCredentialId?:string,currentConfigured:boolean}
retainCodexGatewayCredential({id,key?,fromCurrent?:boolean}) -> credentials same. exactlyone key/fromCurrent; current usesonlymanaged cx_routing_gateway.experimental_bearer_token. Use controlAPIhashverification; never rawUIreturn.
Apply Gateway accepts optional credentialId instead of clientKey; reject both; blank/omitted both retains existingcurrenttoken for backwardscompatible use. Always validateallselectedmodels andrevocation/scope onapply. SecretbyID fetchedonlymain; neverexpose tofrontend.
New options getGatewayCredentials/resolveGatewayCredential/retainGatewayCredential provided by runtimeclient, main supplies preferencesPath (fixednative).
CodexStatus adds configScope:'user' and alreadyconfigPath. CredentialsAPIs errors map stable sanitized CODEX_CREDENTIAL_UNAVAILABLE /CODEX_CREDENTIAL_MISMATCH etc.
Preferences boundary separate fromconfig/directprofile modules; modelcatalog update ownednativeworker.
Existing createClientKey returnedKey mayused once but storeencrypted automatically; aftercreate refreshdropdown selectnewID, clearrawinput, draftsaveID.

## Ownership and checks
Task1 Control credentials: services/local-control clientkeys +tests only, noelectron.
Task2 Native memory/catalogue/credential bridge: electron codex*.cjs/main/preload +tests/runtime codex* (EXCEPT protocol-proof file byTask3). Source controls methods andshapes asabove; frontendTS workerowns.
Task3 protocoleffort: gatewayadapter +protocol/requestlogs/gatewaytests and newtests/runtime/codex-reasoning-proof.test.mjs; actualCLIproofscript/evidence. No catalog sourceedit Task2.
Task4 UI: Codexsrc, domain/window, tests, noelectron/control.
Coordinator docs/fullverification/package/reviews. Sameworktree uncommittedpriorversions preserved. Version1.1.10, separateDesktop 'Cx-Routing Gateway Portable 1.1.10 - Codex Memory Test.exe', olddata/binaries untouched. No actualuserconfig/auth/liveprovider/login calls; fixture-only.

## Acceptance/rollback
RED→GREEN persistence, remount/restart/directswitch, races/error, legacyKeyrecovery/wrongkey/revoked/hashmismatch/vaultfailure, nativeplaintextredaction, historicalcatalogrestoration, effortpostpayload eachprotocol andactualCLIcatalog+request. Full Runtime/Desktop/build/audit/independentreviews, actualElectronselection/persistence/dropdown/scope. Rollback keepolderDesktop/data; no commit/push/merge/release. No claiming liveprovider support orowneracceptance.
