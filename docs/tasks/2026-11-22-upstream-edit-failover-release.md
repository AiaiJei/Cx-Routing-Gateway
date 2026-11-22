# Upstream Edit and Failover 1.1.5 Release

- Task: `CXRG-UPSTREAM-EDIT-FAILOVER-2026-11-22`
- Project/repository: Cx-Routing Gateway / `AiaiJei/Cx-Routing-Gateway`
- Base: `master`; PR #18 merged at `351693e61ee30ea52f590775a4c3d7fdceb27641`
- Authorized version: latest stable 1.1.4 to 1.1.5
- Status: release artifacts verified; publication and Desktop delivery pending
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

The release publication, asset read-back, Desktop Portable delivery, final cleanup, and Owner acceptance will be recorded here after those authorized actions complete.
