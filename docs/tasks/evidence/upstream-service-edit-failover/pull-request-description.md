# feat: edit upstream services and stabilize failover

## Summary

Add a prefilled Desktop dialog for editing existing upstream services through the authenticated Local Control PATCH path. Blank API Key preserves the current credential; key rotation and config-write failures keep the old credential usable, and omitted private-network trust retains the current setting.

Fix Gateway recovery when a same-target success arrives after concurrent failures open its circuit. The success closes the circuit and invalidates older in-flight failures, while routing-relevant upstream edits refresh target health state. Existing thresholds, status classes, cooldown, and no-retry behavior remain unchanged.

## Validation

- Runtime: 143/143 tests passed.
- Desktop: 158/158 tests passed.
- Desktop TypeScript/Vite production build passed.
- Concurrent late-success regression passed five consecutive focused runs.
- Electron syntax checks, contract JSON parse, and `git diff --check` passed.
- No real provider calls were made.

Visual browser inspection is recorded as `NOT_RUN` because Computer Use URL verification prevented page inspection.
