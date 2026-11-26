# Revision4 progress
Owner confirmed CC Switch-style direct includes official and thirdparty providers, importing current config and saving/editing/switching schemes. Task source d1fe810+uncommitted rev2/3. Before snapshot .tmp/codex-direct-management-20261126/before.json. Native/UI/client ownership disjoint with API spec. No old edits reverted.
Task1 pending; Task2 pending; Task3 pending; Task4 pending.
Final: Tasks 1–4 complete. All findings fixed and independently re-reviewed; Runtime 342/Desktop 245/build/CLI proof/native UI/Portable persistence pass. Owner real login/provider acceptance NOT_RUN. Local source uncommitted/unpushed; PR25 unchanged.
Finalchecks: Runtime342/342, Desktop245/245, TypeScript/VitebuildPASS, audit0. Native/UI/clientreviewfindings fixed withregressions. FinalactualElectron existingthirdparty→Gatewaycapture→returndirect→official succeeded; noforcedlogin/noauthfiletouch, originalMCP/reasoning preserved and0modelcalls. CLI0.167proof passedfinalsource.
Task1 firstfreeze61nativePASS; reviewfixround1 unsafeauthsnapshotImportant+snapshotcatalogstatusMinor pending.
Task2 firstfreeze31targeted/237Desktop/buildPASS; reviewfixround1 previewmodaloverlap+restorestalecurrentImportant pending.
NativeElectron snapshot verified currentthirdpartyrecognized/importeditable, edit2models/defaultsecond-direct withblankKey, save-notenabledfeedback, explicitpreviewconfirmation and activestate. RealElectronsecureStorage write used isolated appdata/home only. Userliveauth/config untouched.
Task3 implemented21native/5hooktestsPASS and independentreviewPASS; sync cachedloginstate accessor addendum pending.
Task4 initial generated-direct-proofPASS actualCLI0.167: directmodelsalpha/beta only, defaultbeta, providercx_codex_direct; direct→Gateway→lastDirect→official roundtrip preservesnewerMCP/oldreasoning and encryptedlibrary. No login/generation.
Ruling: Preserve auth.json unchanged; CC Switch's optional auth removal is not needed for the requested direct/gateway model routing.
Ruling: Encrypted direct profile library stores provider secrets, separate from Gateway upstream vault because direct does not traverse Gateway; no secret duplicate is created automatically except explicit current-route capture needed for return.
