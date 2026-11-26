# Cx-Routing Gateway 1.1.1

## 更新内容

- 关闭主窗口后，应用继续驻留在 Windows 系统托盘；可单击托盘恢复窗口，或通过托盘菜单完整退出。
- 更新检查提供即时状态反馈；未配置私有仓库访问令牌时会说明原因并引导到令牌输入框。
- 优化设置页与 README 的 1.1.1 版本信息。

## Windows x64 下载

- `Cx-Routing Gateway Setup 1.1.1.exe`：NSIS 安装包。
- `Cx-Routing Gateway Portable 1.1.1.exe`：单文件便携程序，下载后可直接双击运行，无需安装或手动解压。
- 资产 SHA-256 见随发布流程生成的 `manifest.json`。

## 使用说明

- 仓库为私有仓库。应用内更新检查需要用户配置具有该仓库 `Contents: Read` 权限的细粒度 GitHub Token；令牌保存在本机系统安全存储中。
- Windows 发行包未进行代码签名。首次运行时请核对文件来源及 Release 中提供的 SHA-256。
- 本次发布构建包含安装版和便携版；系统托盘交互和两个本机服务的便携版健康检查会在发布前验证。
