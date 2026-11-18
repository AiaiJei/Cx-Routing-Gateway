import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyResult, FixtureNotice, PageHeader, SearchField } from "../components/PageHeader";
import { Modal } from "../components/Modal";
import { fixtureWorkspaceClient } from "../data/workspace-client";
import { useWorkspace } from "../data/use-workspace";
import type { Upstream } from "../domain/types";

export function UpstreamsPage() {
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const { data, error } = useWorkspace();
  const [upstreams, setUpstreams] = useState(data.upstreams);
  useEffect(() => setUpstreams(data.upstreams), [data.upstreams]);
  const visibleUpstreams = useMemo(() => upstreams.filter((upstream) =>
    `${upstream.name} ${upstream.baseUrl} ${upstream.models.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [query, upstreams]);

  function addUpstream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const upstream: Upstream = {
      id: `up-local-${Date.now()}`,
      name: String(form.get("name")).trim(),
      baseUrl: String(form.get("baseUrl")).trim(),
      credentialLabel: "未配置",
      status: "未连接",
      models: [],
    };
    setUpstreams((current) => [...current, upstream]);
    setQuery("");
    setFormOpen(false);
    setFeedback("上游已添加到当前页面会话；刷新后不会保留，也未发起网络连接。");
  }

  async function testConnection(id: string) {
    const result = await fixtureWorkspaceClient.simulateUpstreamTest(id);
    setFeedback(result.message);
  }

  return (
    <div className="page-content">
      <PageHeader title="上游服务" description="管理目标服务与配置的上游出站协议。" action={<button className="button-primary" type="button" onClick={() => setFormOpen((open) => !open)}>添加上游</button>} />
      <FixtureNotice />
      {error && <p className="action-feedback" role="alert">工作区数据读取失败：{error}</p>}
      <div className="toolbar"><SearchField label="搜索上游服务" value={query} onChange={setQuery} /><span className="result-count">{visibleUpstreams.length} 项</span></div>
      {feedback && <p className="action-feedback" role="status">{feedback}</p>}
      {formOpen && <Modal title="新增上游示例" onClose={() => setFormOpen(false)}><form className="modal-form" onSubmit={addUpstream}>
        <span className="helper-text">仅当前页面会话；出站协议在模型路由中配置。</span>
        <label>服务名称<input name="name" required maxLength={80} autoComplete="off" /></label>
        <label>Base URL<input name="baseUrl" type="url" required placeholder="https://api.example/v1" autoComplete="url" /></label>
        <div className="form-actions"><button className="button-secondary" type="button" onClick={() => setFormOpen(false)}>取消</button><button className="button-primary" type="submit">保存示例上游</button></div>
      </form></Modal>}
      {visibleUpstreams.length ? <div className="table-scroll"><table>
        <thead><tr><th>服务</th><th>Base URL</th><th>模型</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead>
        <tbody>{visibleUpstreams.map((upstream) => <tr key={upstream.id}>
          <td><strong>{upstream.name}</strong><span className="cell-subtext">凭证引用：{upstream.credentialLabel}</span></td>
          <td><code className="url-cell">{upstream.baseUrl}</code></td>
          <td>{upstream.models.length} 个示例模型</td>
          <td><span className="status-text">{upstream.status}</span></td>
          <td><button className="button-secondary" type="button" aria-label={`测试 ${upstream.name}`} onClick={() => void testConnection(upstream.id)}>模拟测试</button></td>
        </tr>)}</tbody>
      </table></div> : <EmptyResult>没有匹配的上游服务</EmptyResult>}
      <p className="helper-text page-footnote">连通测试、模型同步及凭证保存尚未连接本机 Gateway。</p>
    </div>
  );
}
