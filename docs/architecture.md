# 仓库架构树

产品是 Desktop 程序，打开时自动启动本机 Gateway；没有管理员角色或独立 Web 管理后台。Desktop 前端与 Electron 窗口 shell、preload IPC、本机 control/Gateway、配置存储、协议转换、文本流式、基础工具调用和 Windows 打包已实现。复杂并行工具流、代码签名、真实 provider 联调和生产部署仍待完成。目录名只说明目标职责，不能作为运行时功能证据。文件/模块可以在实现阶段按技术栈与调用关系微调。

```text
Cx-Routing Gateway/
├── apps/
│   └── desktop/             # Desktop 工作区 UI、Electron shell、IPC 和 runtime supervisor
├── services/
│   ├── gateway/             # 数据面：入站鉴权、路由与基础上游转发（阶段 2 基础已实现）
│   └── local-control/       # 本机管理 API、Key 鉴权与配置（阶段 2 基础已实现）
├── packages/
│   ├── protocols/           # Res/Mes/Chat 完整规范化与转换（TextCore 基础在 Gateway 内，完整包尚未拆出）
│   └── shared/              # 配置存储、加密 SecretVault 与共享基础契约（阶段 2 基础已实现）
├── deploy/                  # 部署环境样例及运维说明（基础已实现）
├── scripts/                 # 本地验证、诊断、回滚、发布和更新脚本
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
    ├── concepts/            # 静态设计概念图
    ├── blueprint.md
    ├── development-plan.md
    ├── development-execution-plan.md
    ├── acceptance-checklist.md
    ├── architecture.md
    └── task-record.md
```

## 依赖方向（目标）

`apps/desktop → 本机控制 API/IPC`；`local-control → domain/config/credentials`；`gateway → routing + protocols + upstreams + usage`。协议包不依赖 UI；数据面不依赖管理页面。Desktop 启动器与 Gateway 运行时通过生命周期/健康检查接口连接；持久化与网络客户端通过职责明确的接口注入，入口仅负责组装。具体语言、框架、数据库和部署形态待阶段 0 决策。
