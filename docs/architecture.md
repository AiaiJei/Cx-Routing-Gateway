# 仓库架构树

产品是 Desktop 程序，打开时自动启动本机 Gateway；没有管理员角色或独立 Web 管理后台。本次只建立空目录骨架与职责说明；目录不代表功能已实现。文件/模块可以在实现阶段按技术栈与调用关系微调。

```text
Cx-Routing Gateway/
├── apps/
│   └── desktop/             # Desktop 工作区与 Gateway 启动编排（尚未实现）
├── services/
│   ├── gateway/             # 数据面：入站请求与上游转发（尚未实现）
│   └── local-control/       # 管理 API、鉴权与配置（尚未实现）
├── packages/
│   ├── protocols/           # Res/Mes/Chat 协议规范化与转换（尚未实现）
│   └── shared/              # 共享类型、错误与基础契约（尚未实现）
├── deploy/                  # 部署、环境样例及运维配置（尚未实现）
├── scripts/                 # 本地开发与维护脚本（尚未实现）
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