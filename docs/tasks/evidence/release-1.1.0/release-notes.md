# Cx-Routing Gateway 1.1.0

本版本改进了模型路由工作流，并完善了桌面应用的正式发布与更新检查体验。

## 更新内容

- 模型路由与上游模型列表支持按 GPT、Claude、Gemini、GLM、DeepSeek、Kimi 和其他类别筛选。
- 设置页的“检查更新”连接到本项目 GitHub Releases；首次使用需配置仅有 `Contents: Read` 权限的细粒度令牌，令牌加密保存在本机。安装前校验 GitHub 发布资产提供的 SHA-256。
- 更换为适配 Cx-Routing Gateway 的桌面应用图标。

## Windows 下载

- **安装版：** `Cx-Routing Gateway Setup 1.1.0.exe`，Windows x64 NSIS 安装包。
- **免安装版：** `Cx-Routing Gateway Portable 1.1.0.exe`，下载后双击运行，无需安装或手动解压。

SHA-256:

- 安装版：`e5c7e9bc5ace0193ea01675bbbd28d5d8f91d38297517f9f00d06faf24732728`
- 免安装版：`8244ba83fc911c7a72969cd8ffb9590413b28e7f77cf35aba3b80736ea2d7a02`

## 校验与兼容

- 免安装版是单个 Windows x64 便携可执行文件；下载后双击启动，已验证本地控制服务和 Gateway 健康状态。
- 应用数据保留在现有用户数据目录中，不会随安装包或免安装目录迁移。
- 当前 Windows 产物未进行代码签名；下载前请核对 GitHub Release 提供的 SHA-256。
