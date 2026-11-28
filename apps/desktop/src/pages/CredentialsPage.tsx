import { useWorkspaceCollection } from "../data/use-workspace-collection";
import { WorkspaceState } from "../components/WorkspaceState";
import { useState } from "react";
import { EmptyResult, FixtureNotice, PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { TextField } from "../components/TextField";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { useWorkspace } from "../data/use-workspace";
import type { AccessCredential } from "../domain/types";

export function CredentialsPage() {
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [scopeInput, setScopeInput] = useState("");
  const [permanentTarget, setPermanentTarget] = useState<AccessCredential | null>(null);
  const [deletingCredential, setDeletingCredential] = useState(false);
  const { data, error, loading } = useWorkspace();
  const [credentials, setCredentials] = useWorkspaceCollection(data.credentials);

  async function createCredential() {
    if (!data.meta.live || !defaultWorkspaceClient.createClientKey) {
      setMessage("未生成或保存密钥；凭证运行时尚未接入。");
      return;
    }
    const scope = scopeInput.split(",").map((item) => item.trim()).filter(Boolean);
    const result = await defaultWorkspaceClient.createClientKey("Desktop client", scope);
    setMessage(`新 Key（仅显示一次）：${result.key}`);
    const item: AccessCredential = { id: result.id, label: "Desktop client", preview: `${result.key.slice(0, 8)}••••••••`, scope: scope.length ? scope.join(", ") : "全部模型", createdAt: new Date().toISOString().slice(0, 10), lastUsed: "暂无记录", status: "运行时" };
    setCredentials((current) => [...current, item]);
  }

  async function rotateCredential(id: string) {
    if (!defaultWorkspaceClient.rotateClientKey) return;
    const result = await defaultWorkspaceClient.rotateClientKey(id);
    setMessage(`Key 已轮换（仅显示一次）：${result.key}`);
  }

  async function revokeCredential(id: string) {
    if (!defaultWorkspaceClient.revokeClientKey) return;
    await defaultWorkspaceClient.revokeClientKey(id);
    setCredentials((current) => current.map((item) => item.id === id ? { ...item, status: "已撤销", lastUsed: "已撤销" } : item));
    setMessage("Key 已撤销。");
  }

  async function permanentlyDeleteCredential() {
    if (!permanentTarget || !data.meta.live || !defaultWorkspaceClient.permanentlyDeleteClientKey) return;
    setDeletingCredential(true);
    setActionError("");
    setMessage("");
    try {
      await defaultWorkspaceClient.permanentlyDeleteClientKey(permanentTarget.id);
      setCredentials((current) => current.filter((item) => item.id !== permanentTarget.id));
      setMessage(`凭证已永久删除：${permanentTarget.label}。`);
      setPermanentTarget(null);
    } catch (caught) {
      setActionError(`永久删除失败：${caught instanceof Error ? caught.message : "未知错误"}`);
      setPermanentTarget(null);
    } finally {
      setDeletingCredential(false);
    }
  }

  if (loading || error) return <WorkspaceState title="接入凭证" loading={loading} error={error} />;

  return (
    <div className="page-content desktop2-page desktop2-credentials">
      <PageHeader title="接入凭证" description="供下游客户端使用的访问凭证管理界面。" action={<Button variant="primary" onClick={() => void createCredential()}>{data.meta.live ? "创建凭证" : "演示创建凭证"}</Button>} />
      <FixtureNotice live={data.meta.live}>{data.meta.live ? "本机凭证 · 仅显示脱敏预览" : "脱敏示例 · 未生成真实密钥"}</FixtureNotice>
      <p className="action-feedback" role="note">{data.meta.live ? "Key 只在创建或轮换结果中显示一次；页面列表只保留脱敏预览。" : "密钥创建、轮换和撤销尚未接入本机运行时。此页仅展示界面。"}</p>
      {data.meta.live && <div className="credential-scope"><TextField label="模型范围（逗号分隔，留空为全部）" value={scopeInput} onChange={(event) => setScopeInput(event.target.value)} placeholder="gateway-fast, gateway-reasoner" /></div>}
      {message && <p className="action-feedback" role="status">{message}</p>}
      {actionError && <p className="action-feedback route-test-error" role="alert">{actionError}</p>}
      {credentials.length ? <div className="table-scroll" role="region" aria-label="接入凭证列表" tabIndex={0}><table className={`credentials-table${data.meta.live ? " has-actions" : ""}`}>
        <thead><tr><th>名称</th><th>凭证预览</th><th>模型范围</th><th>创建时间</th><th>最近使用</th><th>状态</th>{data.meta.live && <th className="row-actions-heading">操作</th>}</tr></thead>
        <tbody>{credentials.map((credential) => {
          const statusTone = credential.status === "已撤销" ? "status-negative" : credential.status === "运行时" ? "status-positive" : "status-neutral";
          return <tr key={credential.id}>
            <td><strong>{credential.label}</strong></td><td><code>{credential.preview}</code></td><td>{credential.scope}</td><td>{credential.createdAt}</td><td>{credential.lastUsed}</td><td><span className={`status-badge ${statusTone}`}>{credential.status}</span></td>{data.meta.live && <td className="row-actions-cell"><div className="row-actions" role="group" aria-label={`${credential.label} 操作`}><Button variant="secondary" size="small" onClick={() => void rotateCredential(credential.id)}>轮换</Button><Button variant="danger" size="small" onClick={() => void revokeCredential(credential.id)}>撤销</Button>{defaultWorkspaceClient.permanentlyDeleteClientKey && <Button variant="danger" size="small" onClick={() => setPermanentTarget(credential)}>永久删除</Button>}</div></td>}
          </tr>;
        })}</tbody>
      </table></div> : <EmptyResult>还没有接入凭证，创建后可供客户端使用。</EmptyResult>}
      {permanentTarget && <Modal title="永久删除凭证" onClose={() => setPermanentTarget(null)} canClose={!deletingCredential}>
        <p>将永久删除凭证“{permanentTarget.label}”。此操作无法撤销；撤销操作仍保留为独立功能。</p>
        <div className="form-actions">
          <Button disabled={deletingCredential} onClick={() => setPermanentTarget(null)}>取消</Button>
          <Button variant="danger" disabled={deletingCredential} onClick={() => void permanentlyDeleteCredential()}>{deletingCredential ? "删除中…" : "确认永久删除"}</Button>
        </div>
      </Modal>}
      <section className="endpoint-block credential-endpoint"><span className="field-label">本机接入 URL</span><code>{data.gateway.url}</code><span className="helper-text">{data.meta.live ? "Gateway 由 Desktop 本地运行时提供。" : "仅为界面示例；当前无 Gateway 服务监听。"}</span></section>
    </div>
  );
}
