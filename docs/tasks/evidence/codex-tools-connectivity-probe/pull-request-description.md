## What changed

- Convert Responses namespace function and custom tools for Chat and Messages, preserving tool identity across choices, call results, history, and streaming.
- Reject undeclared Responses function choices and malformed custom grammar formats with field-specific errors.
- Replace authenticated HTTP failback probes with DNS-validated TCP or verified TLS connectivity checks that do not read upstream credentials or send HTTP requests.

Custom freeform grammar is preserved as descriptive text; Chat and Messages cannot enforce arbitrary grammar constraints.

## Verification

- Runtime: 178/178.
- Desktop: 158/158 across 23 files; production build passed.
- Adapter: 20/20; failback connectivity: 4/4.
- Independent review follow-up found no Critical or Important issues.
- No real provider requests were made.

This PR targets `master` and is intentionally left open for review. It contains no version bump or release changes.
