# Upstream Edit and Failover 1.1.5 Release

- Task: `CXRG-UPSTREAM-EDIT-FAILOVER-2026-11-22`
- Project/repository: Cx-Routing Gateway / `AiaiJei/Cx-Routing-Gateway`
- Base: `master`; PR #18 merged at `351693e61ee30ea52f590775a4c3d7fdceb27641`
- Authorized version: latest stable 1.1.4 to 1.1.5
- Status: v1.1.5 published and Desktop Portable copied/smoke-tested; task-worktree removal pending
- Contract: `docs/tasks/2026-11-22-upstream-edit-failover-contract.json`
- Plan: `docs/superpowers/plans/2026-11-22-upstream-edit-release-1.1.5.md`
- Release notes: `docs/tasks/evidence/upstream-service-edit-failover/release-1.1.5/release-notes.md`
- Verification evidence: `docs/tasks/evidence/upstream-service-edit-failover/release-1.1.5/verification.md`

## Release Checks

- Fresh Runtime tests: 146/146 passed.
- Fresh Desktop tests: 158/158 passed across 23 files.
- Fresh Desktop production build: TypeScript and Vite passed.
- Release verifier generated the 1.1.5 manifest with 11 validated artifact hashes.
- Unpacked app version smoke passed; Portable isolated Local Control and Gateway health checks passed.
- Artifacts are unsigned because the build environment has no configured signing certificate.
- GitHub Release: `https://github.com/AiaiJei/Cx-Routing-Gateway/releases/tag/v1.1.5`; tag target `07f213cbe36cbc821ffb7328beaffe3e41057913`. Four uploaded assets were read back; names, sizes, and SHA-256 values match local files. GitHub canonicalized spaces in binary asset names to dots.
- Desktop Portable: `C:\Users\20142\Desktop\Cx-Routing Gateway Portable 1.1.5.exe`; 115021442 bytes; SHA-256 `af57be5ab7c4810844b2ce911bc862fc0b4c1d97acdfd2b415a2b2775f21be00`; isolated health smoke passed. The existing 1.1.4 Desktop file remains untouched.
- Release and Desktop hash evidence: `docs/tasks/evidence/upstream-service-edit-failover/release-1.1.5/verification.md`.

The task worktree is clean, its branch head is reachable from master, and local/remote task branches are retained. Only removal of `.worktree/upstream-service-edit` remains. Final Owner review remains pending after delivery.
