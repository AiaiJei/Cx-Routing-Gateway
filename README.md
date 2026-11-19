# Cx-Routing Gateway

Workspace repository for the Cx-Routing Gateway project.

The initial repository setup includes the AWG 0.4.1 Codex project adapter. Its project configuration, local plugin bundle, skills, agents, and hash-tracked installation batch are introduced by the dedicated AWG deployment pull request.

Codex Desktop runtime activation remains a separate verification step after the repository is trusted and reopened in a new session.


## 规划资料

The Electron Desktop workspace is implemented in `apps/desktop` and uses local fixtures when opened in a browser. A local-control/Gateway runtime foundation is implemented, including text streaming and tool conversion; complex tool-result orchestration, signing, automatic updates, and production deployment remain. See [Desktop workspace](apps/desktop/README.md) for frontend startup and verification.

The runtime foundation is now available locally: `npm test` runs the Node runtime checks, `npm run start:control` starts the loopback control API, and `npm run start:gateway` starts the authenticated Gateway. The Desktop can discover signed updates, download a verified installer, and launch it after an explicit user action. Complex parallel tool-stream orchestration, code signing, and production deployment remain in later stages.

Useful local checks:

```powershell
npm run doctor
npm run verify:all
npm run verify:release
npm run restore:config -- <data-dir>
npm run check:update
```

`doctor` is read-only, `verify:release` validates packaged artifacts and writes a manifest, `restore:config` restores the last configuration backup after preserving the current file, and `check:update` validates a signed update manifest and installer artifact metadata.

- [产品蓝图](docs/blueprint.md)
- [开发计划](docs/development-plan.md)
- [开发执行计划](docs/development-execution-plan.md)
- [验收清单](docs/acceptance-checklist.md)
- [仓库架构树](docs/architecture.md)
- [静态前端概念图](docs/concepts/gateway-overview.svg)

规划文档和静态概念图描述目标，不代表 Gateway 服务可用。
