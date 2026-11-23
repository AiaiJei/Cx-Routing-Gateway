import { Link } from "react-router";
import { PageHeader } from "../components/PageHeader";

export function CodexPage() {
  return (
    <div className="page-content">
      <PageHeader title="Codex 路由与管理" description="通过现有 Gateway 路由将 Codex CLI 与 Desktop 请求转发到已配置的上游服务。" />
      <section className="codex-placeholder" aria-labelledby="codex-status-title">
        <div className="codex-placeholder-heading">
          <h2 id="codex-status-title" className="section-title">Codex 接入</h2>
          <span className="status-badge status-neutral">规划中</span>
        </div>
        <p>此页面目前仅提供接入说明。Codex CLI 与 Desktop 配置同步尚未实现；本页不会读取或修改 Codex 配置，也不会保存凭证。</p>
        <p>Codex 请求使用现有模型路由、上游服务和接入凭证。请在对应页面管理 Gateway 设置。</p>
        <nav className="codex-management-links" aria-label="现有 Gateway 管理页面">
          <Link to="/routes">模型路由</Link>
          <Link to="/upstreams">上游服务</Link>
          <Link to="/credentials">接入凭证</Link>
        </nav>
      </section>
    </div>
  );
}
