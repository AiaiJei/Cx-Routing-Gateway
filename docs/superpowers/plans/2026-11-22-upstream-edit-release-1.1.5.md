# Upstream Edit Integration and Release 1.1.5

## Goal

Merge PR #18, release the upstream edit/failover fixes as version 1.1.5, deliver the verified Windows x64 Portable to the Desktop, and remove only the clean task worktree.

## Scope and Preconditions

- Latest stable GitHub Release is v1.1.4; target version is v1.1.5.
- PR #18 targets `master`; Runtime and Desktop checks must pass on its final head before merge.
- The repository has `delete_branch_on_merge` disabled. Retain the task branch and remote branch.
- Preserve the existing v1.1.4 GitHub release and Desktop Portable. Use `apps/desktop/release/1.1.5-final-reviewed/` and a new Desktop filename.
- Make no provider calls, code signing, release/tag rewrites, unrelated worktree changes, or branch deletion.

## Execution

1. [x] Recheck PR #18, its required checks, mergeability, and current `master`. Merge only after checks pass; fast-forward the primary master worktree and run Runtime/Desktop tests and the Desktop production build on the merged result.
2. [x] Change package, product, lockfile root, builder, SettingsPage assertions, and release verifier metadata from 1.1.4 to 1.1.5. Add/update release-manifest tests and prepare release notes plus task evidence.
3. [x] Run the complete Runtime and Desktop suites and production build. Build Windows x64 NSIS Setup and Portable artifacts into the isolated 1.1.5 output directory, generate the manifest, verify all required artifact hashes, and run unpacked-app and Portable health smoke checks. Runtime 146/146, Desktop 158/158, production build, release verifier, unpacked version smoke, and Portable Local Control/Gateway health smoke passed; artifacts are unsigned.
4. [x] Confirm v1.1.5 tag/release and the Desktop target file do not already exist. Publish GitHub Release v1.1.5 with Setup, blockmap, Portable, manifest, and release notes. Re-read the published release and verify asset names, digests, and tag target. GitHub published four assets and canonicalized spaces to dots in the three binary asset names; all sizes and SHA-256 values match the local files and the tag points to `07f213c`.
5. [x] Copy the verified Portable to `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.5.exe` only if absent. Compare source/copy size and SHA-256 and run isolated health smoke against the Desktop copy. The copy is 115021442 bytes, matches SHA-256 `af57be5ab7c4810844b2ce911bc862fc0b4c1d97acdfd2b415a2b2775f21be00`, and both local services passed health checks.
6. [ ] Record merge, release, artifact hashes, Desktop delivery, CI, remaining limitations, and rollback evidence. Confirm the task worktree is clean and all commits are reachable from master, then remove only `.worktree/upstream-service-edit`; retain the task branch.

## Acceptance

- PR #18 is merged to master and the primary worktree is fast-forwarded to the merge.
- Runtime, Desktop, production build, release verifier, unpacked smoke, and Portable smoke pass.
- GitHub Release v1.1.5 contains verified Setup, blockmap, Portable, and manifest assets.
- The new Desktop Portable matches the verified source hash and passes isolated health smoke; 1.1.4 remains unchanged.
- Task evidence is committed on master before the task worktree is removed.

## Rollback

Before publication, stop on any failed verification and preserve v1.1.4, its Desktop Portable, and the task worktree. After publication, do not rewrite or delete v1.1.5; use a corrective patch release. If the new Desktop copy fails hash or smoke, remove only the newly created 1.1.5 copy and preserve 1.1.4. Keep the task branch.
