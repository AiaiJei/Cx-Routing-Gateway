# Request Log Source and Product Version Design

## Intent

Create a dedicated PR for product version `1.1.1.1`. Make request logs identify the upstream service by its configured service name, and show the masked entry credential only in the request detail view.

## Goals

- Replace the request table's `入口凭证` column with a `来源` column whose value is the selected upstream service name.
- Keep the entry credential in the detail view, using only the existing masked label.
- Preserve historical source identity when an upstream is renamed or deleted by recording its service name with each new usage entry while retaining `upstreamId` for compatibility.
- Define `1.1.1.1` as the product/build/release version. Keep npm package metadata at valid SemVer `1.1.1` and use electron-builder's four-part `buildVersion` field for Windows file metadata.
- Display and compare the four-part product version in Settings and in update checks. Treat existing three-part stable releases as the equivalent four-part version with a trailing zero, so `1.1.1.1` is newer than `1.1.1`.
- Name future release assets and tags from the product version; do not modify or republish the existing `v1.1.1` release.
- Open one dedicated PR against `master`; do not merge it or publish a release in this task.

## Non-goals and constraints

- Do not record credentials, request bodies, response bodies, or additional secret material in usage logs.
- Do not change routing, authentication, failover, retention, or the existing released `v1.1.1` artifacts/tag.
- Keep legacy usage rows readable: resolve source from the stored upstream name when present, otherwise map `upstreamId` to the current configured upstream name, and show `—` if neither is available.
- Preserve the user's untracked `.tmp-version-probe/` in the already-approved task worktree.
- Keep npm's package and lockfile version at `1.1.1`; the product's four-part identifier is a separate build/release version.

## Approaches

1. **Selected: upstream name snapshot plus product build version.** The Gateway records the selected upstream's configured name alongside its ID. The renderer maps that field into the existing log `upstream` display and labels it `来源`. A single product-version metadata value drives electron-builder `buildVersion`, Settings display, updater comparison, release asset naming and verifier expectations. The updater normalizes three-part legacy tags to four numeric components. This preserves historical names and keeps npm metadata valid while making the requested version observable and updateable.
2. Resolve names only in the renderer from `upstreamId`. This avoids changing runtime usage records but old records change when an upstream is renamed and show no source after deletion.
3. Put `1.1.1.1` directly in npm's `version`. npm/electron-builder require SemVer and reject a fourth numeric component, so this breaks dependency installation and packaging.

## Design

Keep the Gateway as the owner of the selected upstream ID and add a sanitized `upstreamName` snapshot to each usage record at the point where the selected upstream is known. Preserve existing `upstreamId`. In `mapRuntimeState`, use the snapshot first and fall back to `upstreams` by ID for old records; fixture logs already have service names. In `LogsPage`, move the existing credential cell out of the table, add `来源` in its place using `log.upstream`, and retain the credential only in the detail grid. Add focused adapter, runtime and UI regressions for snapshot/fallback, column order/value, and detail-only credential visibility.

Define the product version once in desktop package metadata as `cxrgProductVersion: "1.1.1.1"`, separate from SemVer `version: "1.1.1"`. Configure electron-builder's `buildVersion` from that value and make release artifact patterns and `scripts/verify-release.mjs` use it. Import the same metadata for the Settings display and expose it to update IPC instead of `app.getVersion()`. Extend update parsing and numeric comparison to accept three or four numeric components, normalize missing trailing components to zero, and validate release tags and installer filenames against the four-component release version. Existing three-part releases remain valid for installed builds.

## Evidence and acceptance

- A new usage record contains both `upstreamId` and the selected `upstreamName`; legacy records resolve through the configured upstream map; unknown IDs render `—`.
- The request table has a `来源` heading and shows configured service names; it has no entry-credential column. Opening details still shows the masked entry-credential label and never shows a raw secret.
- Product-version metadata, electron-builder build metadata, Settings display, update comparison, tag/asset expectations and release-manifest tests agree on `1.1.1.1`; npm package and lockfile remain `1.1.1`.
- Update tests prove `1.1.1.1` is newer than `1.1.1`, equal to itself, and older than `1.1.2`; three-part release tags and asset names continue to work for legacy releases.
- Run focused Desktop/Runtime tests, full Desktop and Runtime suites, production build, release verifier tests, and `git diff --check`; capture CI status and independent review before opening the dedicated PR.
- PR remains open and unmerged. Existing published release and untracked probe files remain intact.

## Rollback

Revert only this task's commits from `codex/request-log-upstream-1.1.1.1`. No data migration is required because `upstreamName` is optional and legacy records have a fallback. Preserve the branch, worktree, release tag and pre-existing untracked probe directory.
