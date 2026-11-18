import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { useWorkspace } from "../data/use-workspace";

export function SettingsPage() {
  const { data, error } = useWorkspace();
  return (
    <div className="page-content">
      <PageHeader title="设置" description="本机 Gateway 与桌面应用的运行选项。" />
      <FixtureNotice>示例配置 · 只读</FixtureNotice>
      {error && <p className="action-feedback" role="alert">工作区数据读取失败：{error}</p>}
      <p className="action-feedback" role="note">运行时未接入，以下配置尚不可更改。</p>
      <section className="settings-list" aria-label="Gateway 设置">
        {data.settings.map((setting) => <div className="setting-row" key={setting.label}>
          <div><label className="field-label" htmlFor={`setting-${setting.label}`}>{setting.label}</label><p className="helper-text">本机运行时配置，当前不可用</p></div>
          <input id={`setting-${setting.label}`} value={setting.value} disabled readOnly />
        </div>)}
      </section>
      <section className="page-section"><h2 className="section-title">协议术语</h2><p className="body-copy">Res、Mes、Chat 为规划中的协议简称，具体版本与转换能力仍待确认。客户端请求决定入站协议，路由配置决定上游出站协议，响应返回原入站协议。</p></section>
    </div>
  );
}
