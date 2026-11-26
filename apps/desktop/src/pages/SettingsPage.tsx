import { WorkspaceState } from "../components/WorkspaceState";
import { useEffect, useState } from "react";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { useWorkspace } from "../data/use-workspace";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { TextField } from "../components/TextField";
import { cxrgProductVersion } from "../../package.json";

export function SettingsPage() {
  const { data, error, loading } = useWorkspace();
  const [updateMessage, setUpdateMessage] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [needsUpdateToken, setNeedsUpdateToken] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [releaseUrl, setReleaseUrl] = useState("");
  const [updateToken, setUpdateToken] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(true);
  const [tokenMessage, setTokenMessage] = useState("");
  const [publicRead, setPublicRead] = useState(false);
  const [retention, setRetention] = useState("1000");
  const [settingsMessage, setSettingsMessage] = useState("");
  useEffect(() => {
    const value = data.settings.find((setting) => setting.label === "日志保留条数")?.value.match(/\d+/)?.[0];
    if (value) setRetention(value);
  }, [data.settings]);
  useEffect(() => {
    let active = true;
    async function loadTokenStatus() {
      if (!window.desktopControls?.getUpdateTokenStatus) return;
      try {
        const status = await window.desktopControls.getUpdateTokenStatus();
        if (!active) return;
        setTokenConfigured(status.configured);
        setSecureStorageAvailable(status.secureStorageAvailable);
        setPublicRead(status.publicRead === true);
      } catch (caught) {
        if (active) setTokenMessage(caught instanceof Error ? caught.message : "无法读取 GitHub 更新凭据状态");
      }
    }
    void loadTokenStatus();
    return () => { active = false; };
  }, []);
  async function saveUpdateToken() {
    if (!window.desktopControls?.saveUpdateToken) { setTokenMessage("令牌设置仅在 Desktop 运行时可用。"); return; }
    if (!updateToken) { setTokenMessage("请输入 GitHub 更新访问令牌。"); return; }
    try {
      const result = await window.desktopControls.saveUpdateToken(updateToken);
      setTokenConfigured(result.configured);
      setNeedsUpdateToken(false);
      setUpdateToken("");
      setTokenMessage("GitHub 更新令牌已验证并安全保存。");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "GitHub 更新令牌验证失败";
      setTokenMessage(updateToken ? message.replaceAll(updateToken, "[已隐藏]") : message);
    }
  }
  async function removeUpdateToken() {
    if (!window.desktopControls?.removeUpdateToken) { setTokenMessage("令牌设置仅在 Desktop 运行时可用。"); return; }
    try {
      const result = await window.desktopControls.removeUpdateToken();
      setTokenConfigured(result.configured);
      setUpdateToken("");
      setUpdateAvailable(false);
      setReleaseUrl("");
      setTokenMessage("GitHub 更新令牌已移除。");
    } catch (caught) { setTokenMessage(caught instanceof Error ? caught.message : "GitHub 更新令牌移除失败"); }
  }
  async function checkUpdate() {
    if (!window.desktopControls?.checkUpdate) { setUpdateMessage("更新检查仅在 Desktop 运行时可用。"); return; }
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    setNeedsUpdateToken(false);
    setUpdateAvailable(false);
    setReleaseUrl("");
    setUpdateMessage("正在检查 GitHub Release…");
    try {
      const result = await window.desktopControls.checkUpdate();
      setTokenConfigured(result.configured);
      if (result.tokenInvalid) setTokenMessage("GitHub 更新令牌已失效，请重新配置。");
      if (result.publicRead) setPublicRead(true);
      setUpdateAvailable(Boolean(result.available));
      setReleaseUrl(result.releaseUrl || "");
      setNeedsUpdateToken(!result.configured);
      setUpdateMessage(!result.configured ? "未检查：请先配置并验证 GitHub 更新访问令牌。" : result.available ? `发现版本 ${result.version}；更新来自 GitHub Release。` : "当前已是最新版本。");
    } catch (caught) {
      setUpdateMessage(caught instanceof Error ? caught.message : "更新检查失败");
    } finally {
      setCheckingUpdate(false);
    }
  }
  function focusUpdateToken() {
    const input = document.getElementById("github-update-token");
    input?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    input?.focus();
  }
  async function installUpdate() {
    if (!window.desktopControls?.installUpdate) { setUpdateMessage("更新安装仅在 Desktop 运行时可用。"); return; }
    try {
      const result = await window.desktopControls.installUpdate();
      setTokenConfigured(result.configured);
      if (result.tokenInvalid) setTokenMessage("GitHub 更新令牌已失效，请重新配置。");
      setUpdateMessage(!result.configured ? "请先配置并验证 GitHub 更新访问令牌。" : result.installed ? `正在安装版本 ${result.version}，应用将退出。` : "没有可安装的已验证更新。");
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
        <div className="settings-update"><div><p className="app-version">版本 {cxrgProductVersion}</p><p className="helper-text">更新通过公开 GitHub Releases 检查，无需令牌；安装前验证安装包 SHA-256。</p></div><div className="settings-update-actions"><Button variant="secondary" size="small" disabled={checkingUpdate} onClick={() => void checkUpdate()}>{checkingUpdate ? "正在检查…" : "检查更新"}</Button>{needsUpdateToken && <Button variant="tertiary" size="small" onClick={focusUpdateToken}>配置更新令牌</Button>}{updateAvailable && <Button variant="primary" size="small" onClick={() => void installUpdate()}>安装更新</Button>}</div>{updateMessage && <p className="settings-update-message helper-text" role="status" aria-live="polite">{updateMessage}{releaseUrl && <> · <a href={releaseUrl} target="_blank" rel="noreferrer">查看 GitHub 发布说明</a></>}</p>}</div>
        <div className="settings-update">
          {publicRead ? <div><p className="app-version">GitHub 更新权限</p><p className="helper-text">公开仓库可直接阅读与下载 Releases。应用不需要仓库写入、合并或发布权限，也不读取旧的更新令牌。</p></div> : <>
          <div><p className="app-version">GitHub 更新权限</p><p className="helper-text">使用仅有 Contents: Read 权限的细粒度令牌。令牌仅保存在本机安全存储中。</p></div>
          {!secureStorageAvailable ? <p className="settings-update-message helper-text" role="status">当前系统无法安全保存 GitHub 更新令牌</p> : <>
            <TextField id="github-update-token" label="GitHub 更新访问令牌" type="password" autoComplete="new-password" spellCheck={false} value={updateToken} onChange={(event) => setUpdateToken(event.target.value)} />
            <div className="settings-update-actions"><Button variant="secondary" size="small" onClick={() => void saveUpdateToken()}>保存并验证</Button>{tokenConfigured && <Button variant="tertiary" size="small" onClick={() => void removeUpdateToken()}>移除令牌</Button>}</div>
            <p className="settings-update-message helper-text" role="status">{tokenMessage || (tokenConfigured ? "已配置并验证 GitHub 更新访问令牌。" : "尚未配置 GitHub 更新令牌")}</p>
          </>}
          </>}
        </div>
      </section>
      <section className="page-section"><h2 className="section-title">协议术语</h2><p className="body-copy">Res 为 Responses，Mes 为 Messages，Chat 为 Chat Completions。客户端请求决定入站协议，路由配置决定上游出站协议，响应返回原入站协议。</p></section>
    </div>
  );
}
