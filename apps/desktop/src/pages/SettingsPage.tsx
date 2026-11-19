import { WorkspaceState } from "../components/WorkspaceState";
import { useEffect, useState } from "react";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { useWorkspace } from "../data/use-workspace";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { TextField } from "../components/TextField";

export function SettingsPage() {
  const { data, error, loading } = useWorkspace();
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [retention, setRetention] = useState("1000");
  const [settingsMessage, setSettingsMessage] = useState("");
  useEffect(() => {
    const value = data.settings.find((setting) => setting.label === "日志保留条数")?.value.match(/\d+/)?.[0];
    if (value) setRetention(value);
  }, [data.settings]);
  async function checkUpdate() {
    if (!window.desktopControls?.checkUpdate) { setUpdateMessage("更新检查仅在 Desktop 运行时可用。"); return; }
    try {
      const result = await window.desktopControls.checkUpdate();
      setUpdateAvailable(Boolean(result.available));
      setUpdateMessage(!result.configured ? "未配置更新源。" : result.available ? `发现版本 ${result.version}；当前只提供检查，不会自动安装。` : "当前已是最新版本。");
    } catch (caught) { setUpdateMessage(caught instanceof Error ? caught.message : "更新检查失败"); }
  }
  async function installUpdate() {
    if (!window.desktopControls?.installUpdate) { setUpdateMessage("更新安装仅在 Desktop 运行时可用。"); return; }
    try {
      const result = await window.desktopControls.installUpdate();
      setUpdateMessage(result.installed ? `正在安装版本 ${result.version}，应用将退出。` : "没有可安装的已验证更新。");
    } catch (caught) { setUpdateMessage(caught instanceof Error ? caught.message : "更新安装失败"); }
  }
  async function saveRetention() {
    const value = Number(retention);
    if (!Number.isInteger(value) || value < 1 || value > 100000 || !defaultWorkspaceClient.updateSettings) { setSettingsMessage("请输入 1 到 100000 之间的整数。"); return; }
    try {
      await defaultWorkspaceClient.updateSettings({ usageRetentionCount: value });
      setSettingsMessage("日志保留策略已保存。");
    } catch (caught) { setSettingsMessage(caught instanceof Error ? caught.message : "日志保留策略保存失败"); }
  }
  if (loading || error) return <WorkspaceState title="设置" loading={loading} error={error} />;

  return (
    <div className="page-content">
      <PageHeader title="设置" description="本机 Gateway 与桌面应用的运行选项。" />
      <FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时配置" : "示例配置 · 只读"}</FixtureNotice>
      <p className="action-feedback" role="note">{data.meta.live ? "运行时已接入；可调整日志保留条数。" : "运行时未接入，以下配置尚不可更改。"}</p>
      <section className="settings-section" aria-labelledby="gateway-settings-title">
      <h2 id="gateway-settings-title" className="section-title">Gateway 设置</h2>
      <div className="settings-list">
        {data.settings.map((setting) => <div className={`setting-row${data.meta.live && setting.label === "日志保留条数" ? " setting-row-editable" : ""}`} key={setting.label}>
          <div><label className="field-label" htmlFor={`setting-${setting.label}`}>{setting.label}</label><p className="helper-text">{data.meta.live && setting.label === "日志保留条数" ? "保留范围：1 到 100000 条。" : data.meta.live ? "当前本机配置，仅供查看" : "示例配置，当前不可更改"}</p></div>
          {data.meta.live && setting.label === "日志保留条数" ? <><TextField id={`setting-${setting.label}`} type="number" min="1" max="100000" value={retention} onChange={(event) => setRetention(event.target.value)} /><Button variant="secondary" size="small" onClick={() => void saveRetention()}>保存日志保留</Button></> : <TextField id={`setting-${setting.label}`} value={setting.value} disabled readOnly />}
        </div>)}
      </div>
      {settingsMessage && <p className="action-feedback" role="status">{settingsMessage}</p>}
      </section>
      <section className="settings-section" aria-labelledby="desktop-settings-title"><h2 id="desktop-settings-title" className="section-title">桌面应用</h2>
        <div className="settings-update"><div><p className="app-version">Cx-Routing Gateway</p><p className="helper-text">更新由你发起，安装前验证版本与文件。</p></div><div className="settings-update-actions"><Button variant="secondary" size="small" onClick={() => void checkUpdate()}>检查更新</Button>{updateAvailable && <Button variant="primary" size="small" onClick={() => void installUpdate()}>安装更新</Button>}</div>{updateMessage && <p className="settings-update-message helper-text" role="status">{updateMessage}</p>}</div>
      </section>
      <section className="page-section"><h2 className="section-title">协议术语</h2><p className="body-copy">Res 为 Responses，Mes 为 Messages，Chat 为 Chat Completions。客户端请求决定入站协议，路由配置决定上游出站协议，响应返回原入站协议。</p></section>
    </div>
  );
}
