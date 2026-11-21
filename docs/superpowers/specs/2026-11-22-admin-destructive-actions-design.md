# Admin Actions and Focus States Design

## Intent

Make three live administration actions reliable and understandable: clear the persisted request-log history, permanently remove an access credential, and delete an upstream only when no route refers to it. Also simplify the focused appearance of the search and credential-scope fields shown in the supplied screenshots. This work is for Desktop operators managing the local Gateway.

## Goals

- Clear all currently stored usage records, regardless of the visible log filters, and report the removed count. Requests completed after the clear continue to be logged.
- Add permanent client-key deletion while preserving the existing `DELETE /client-keys/:id` revoke behavior. Confirm that deleting an active key immediately prevents future authentication with it.
- Protect every route reference to an upstream, including disabled routes, legacy `upstreamId` fields, and entries in `targets`. Return dependency details and leave route cleanup to the operator.
- Show success and actionable failures in the affected pages; never remove a row optimistically when the server rejects the operation.
- Remove the duplicate outer focus rings from the request-log search and credential-scope fields while retaining one clear accent-border focus indicator.
- Deliver these changes in package/product/build version 1.1.4, built as a Windows x64 Portable executable and copied to the Desktop as a new versioned file after isolated smoke verification.

## Non-goals and Anti-goals

- Do not cascade-delete routes or silently rewrite them when an upstream is deleted.
- Do not change credential revoke or rotation semantics, retention settings, log filters, request logging, or fixture/demo behavior.
- Do not clear logs based on the current filter; the action always means all retained logs.
- Do not remove focus visibility globally or change unrelated controls.
- Do not change the schema or publish/rewrite a GitHub Release or tag as part of this task.

## Constraints and Current Behavior

- Runtime data is persisted through `ConfigStore.update`, which serializes mutations under a file lock.
- The logs page currently offers refresh and reads runtime usage; no clear operation exists.
- Client-key `DELETE` currently disables a key record. Reusing it for permanent deletion would break existing callers.
- Upstream deletion currently checks only enabled routes before deleting. The control API returns a generic `upstream_in_use` error; Electron reduces it to a status-code message and the page does not catch it, so a rejected deletion appears to do nothing.
- The request-log search field styles both its container and inner input as focused; the credential-scope field combines an accent border with an outer focus outline.
- Route creation and patch validation must share the same serialized store mutation as upstream deletion to prevent concurrent changes from creating a dangling reference.
- Existing user data, other task worktrees, and the active timeout/release contract remain outside this task.

## Approaches

1. **UI-only handling.** Add buttons and error text around current calls. This cannot clear persisted logs or permanently delete keys, and it cannot enforce route integrity.
2. **Explicit control operations with existing IPC. (Recommended)** Add a clear-logs operation and a separate permanent-key-delete endpoint; make upstream reference checks and deletion atomic with route writes; return dependent routes and surface them in the UI. This preserves current API behavior while fixing the underlying state and feedback paths.
3. **Repurpose existing deletes or cascade.** Change key `DELETE` to hard-delete and/or remove routes together with an upstream. This breaks compatibility or violates the selected reference-protection policy.

Proceed with approach 2. The user selected reference protection: block upstream deletion and list dependent routes so they can be removed or rebound first.

## Behavior

- **Logs:** Add a live-runtime-only “清空日志” action beside refresh. Require confirmation that all retained request logs will be permanently removed. A dedicated authenticated control endpoint atomically replaces `usage` with an empty array and returns the removed count. Refresh the page on success and display the count. New records written after the operation remain visible.
- **Credentials:** Add a live-runtime-only “删除” action per key, separate from “撤销”. Confirm permanent deletion and warn that an active key stops authenticating immediately. Use a distinct endpoint, `DELETE /v1/control/client-keys/:id/permanent`; remove the key record atomically. Keep the existing revoke endpoint unchanged. Refresh or update the list only after success.
- **Upstreams:** Confirm deletion. In one `ConfigStore.update`, find every route that references the upstream through `upstreamId` or `targets`; if any exist, reject with HTTP 409 and stable route IDs, aliases, and inbound protocols. Check references on all route records, whether enabled or disabled. Ensure route create and update operations validate their upstream references inside their own store mutation. Electron and the page show a readable list of dependent route aliases; keep the upstream row when blocked and refresh the list after success.
- **Errors:** Preserve structured server error codes and dependency details across the control API/IPC boundary. Show failures in the page’s existing status/feedback area.
- **Demo mode:** Keep destructive runtime controls hidden or inert in fixture mode; never imply that sample records were changed.
- **Input focus:** On the request-log search field and credential-scope field, remove the redundant outer outline and retain a single accent border for focus. Keep other focus styles unchanged. Verify keyboard focus remains visible and the two nested blue rectangles in the supplied screenshots are gone.
- **Delivery:** Increment `apps/desktop/package.json` `version` and `cxrgProductVersion`, plus `apps/desktop/electron-builder.yml` `buildVersion`, from 1.1.3 to 1.1.4. Build the Windows x64 Portable artifact in a new task-specific release directory, run isolated portable health/version smoke checks, then copy it to `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.4.exe` only if that destination does not already exist. Preserve the 1.1.3 file. Do not publish a GitHub Release.

## Roles, Evidence, Acceptance, and Rollback

- **Roles:** Primary agent owns implementation and integration. The design was checked before execution; the user's latest instruction authorizes implementation, PR merge, Desktop delivery, and removal of this task worktree. A separate reviewer checks the completed diff after tests.
- **Dependencies:** Existing `ConfigStore`, local-control API, Electron IPC/preload bridge, workspace client, and page patterns; no new package dependency.
- **Acceptance evidence:** Control-server tests prove persisted log clearing, permanent deletion versus revoke compatibility, all-route reference protection, useful 409 details, and route/upstream integrity under serialized updates. Desktop tests prove confirmations, success refresh, fixture-mode behavior, and visible errors. Run the focused suites, the full runtime suite, Desktop tests, and Desktop build; record any unavailable check explicitly. Inspect the affected screens at desktop, tablet, and mobile widths, and use keyboard navigation to confirm one visible focus indicator remains. Manually smoke-test the three live controls against a temporary local runtime without contacting external providers. Verify 1.1.4 metadata, build the x64 Portable executable, run isolated startup/health and version checks, and compare the Desktop copy SHA-256 with the verified source.
- **Rollback:** Revert the task branch/PR before merge; no data migration is introduced. The UI confirmations warn that a user-triggered log clear or permanent key deletion cannot be undone. A blocked upstream deletion changes no configuration or vault state.
