# Revision6 acceptance

Owner's requested end state is preserved: working Codex Res→Chat and Res→Mes paths; model route minimum/maximum reasoning intervals; horizontal upstream selection; one unified model selector across upstreams; grouped inbound/outbound controls. Initial fixed-level interpretation was rejected by Owner and is not implemented.

| Requirement | Evidence | State |
|---|---|---|
| Reproduce supplied tools.type failure | InstalledCodex0.167 type-only baseline both directions, zero upstream calls | PASS |
| Codex Res→Chat and Res→Mes successful streamed tool roundtrip | Installed client13localtools, fixture_echo call/result, final completed; developer preserved | PASS local fixtures |
| Preserve function/namespace/custom/tool_search tools and safe failures | 40compat cases, prior protocol/Gateway tests, independent review | PASS |
| Distinguish incomplete from successful stream/tool execution | Empty tokenlimit, partial function/custom/search regressions, review | PASS |
| Min/max interval, in-range preserve, clamp boundaries, missing boundedmedium | HTTP all9protocolpairs, logs, failover, Control→native→Gateway integration | PASS |
| Seven actual levels none through max, Ultra alias explained | Official0.167 normalization + actual Ultra emitsmax probe; shared/native/UI parity | PASS |
| Horizontal upstream selector and one unified duplicate-free model list | Component tests, realElectron apikey/api666 sharedmodel screen | PASS |
| Per-model independent ranges and correct target priority/remove | UI/HTTP tests; explicit replaceTargets:true; alias-conflict review | PASS |
| Correct existing policy across inlet switches/disabled history | UI reviewer repros and focused reruns | PASS |
| Inbound/outbound grouped; responsive and keyboard access | Real390/816/1440screen checks, no horizontal overflow, native screenshot | PASS |
| Save and persist route range in actualElectron | Native low→high save feedback; diskone route/twotargets/zero requests | PASS |
| Catalogv3 range choices, v1/v2/direct compatibility | Native tests and actualmodel/list; explicit refresh/staleclient immediate enforcement | PASS |
| Crossprotocol hostedsearch disable and field-level restore/backup recovery | Native104focused, exactindependentfailureprobesPASS; actualElectronapply confirmsdisabled | PASS |
| Final full suites/build/independentreview after all code frozen | Runtime468/Desktop292/build/audit0/diff; allpackage/finalreviewsPASS | PASS |
| Separate Desktop portable with original data/programs preserved | DesktopRoutingTest SHA256matched49packagedfiles;2launchrange/draft/secrets/logsPASS;6originalfiles+4oldexesunchanged | PASS |
| Real provider calls and Owner acceptance | Outside isolated development checks | NOT_RUN |

Implementation and local delivery complete; provider/Owner acceptance remains PARTIAL/NOT_RUN. Integration remains local/uncommitted/unpushed in codex/codex-route-management-20261125; PR25 OPEN at d1fe810529ed59455bb1854da05fa21a39d2c671, no main merge/release. All requested developer deliverables have direct source/test/review/runtime/artifact evidence; external provider capability is not claimed from fixtures.
