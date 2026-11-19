import { useState } from "react";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { useWorkspace } from "../data/use-workspace";

export function CredentialsPage() {
  const [message, setMessage] = useState("");
  const { data, error } = useWorkspace();
  return (
    <div className="page-content">
      <PageHeader title="接入凭证" description="供下游客户端使用的访问凭证管理界面。" action={<button className="button-primary" type="button" onClick={() => setMessage("未生成或保存密钥；凭证运行时尚未接入。")}>演示创建凭证</button>} />
      <FixtureNotice>脱敏示例 · 未生成真实密钥</FixtureNotice>
      {error && <p className="action-feedback" role="alert">工作区数据读取失败：{error}</p>}
      <p className="action-feedback" role="note">密钥创建、轮换和撤销尚未接入本机运行时。此页仅展示界面。</p>
      {message && <p className="action-feedback" role="status">{message}</p>}
      <div className="table-scroll"><table>
        <thead><tr><th>名称</th><th>凭证预览</th><th>模型范围</th><th>创建时间</th><th>最近使用</th><th>状态</th></tr></thead>
        <tbody>{data.credentials.map((credential) => <tr key={credential.id}>
          <td><strong>{credential.label}</strong></td><td><code>{credential.preview}</code></td><td>{credential.scope}</td><td>{credential.createdAt}</td><td>{credential.lastUsed}</td><td><span className="status-badge status-neutral">{credential.status}</span></td>
        </tr>)}</tbody>
      </table></div>
      <section className="endpoint-block credential-endpoint"><span className="field-label">预设本机接入 URL</span><code>http://127.0.0.1:8317</code><span className="helper-text">仅为界面示例；当前无 Gateway 服务监听。</span></section>
    </div>
  );
}
