import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyResult, FixtureNotice, PageHeader, SearchField } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { TextField } from "../components/TextField";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { useWorkspace } from "../data/use-workspace";
import type { Upstream } from "../domain/types";

export function UpstreamsPage() {
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const { data, error } = useWorkspace();
  const [upstreams, setUpstreams] = useState(data.upstreams);
  useEffect(() => setUpstreams(data.upstreams), [data.upstreams]);
  const visibleUpstreams = useMemo(() => upstreams.filter((upstream) =>
    `${upstream.name} ${upstream.baseUrl} ${upstream.models.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [query, upstreams]);

  async function addUpstream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (data.meta.live && defaultWorkspaceClient.createUpstream) {
      await defaultWorkspaceClient.createUpstream({ name: String(form.get("name")).trim(), baseUrl: String(form.get("baseUrl")).trim(), apiKey: String(form.get("key") || "") || undefined });
      const refreshed = await defaultWorkspaceClient.getWorkspace();
      setUpstreams(refreshed.upstreams);
      setFormOpen(false);
      setFeedback("上游已保存到本机运行时。");
      return;
    }
    const upstream: Upstream = {
      id: `up-local-${Date.now()}`,
      name: String(form.get("name")).trim(),
      baseUrl: String(form.get("baseUrl")).trim(),
      credentialLabel: form.get("key") ? "已配置（当前会话）" : "未配置",
      status: "未连接",
      models: [],
    };
    setUpstreams((current) => [...current, upstream]);
    setQuery("");
    setFormOpen(false);
    setFeedback("上游已添加到当前页面会话；刷新后不会保留，也未发起网络连接。");
  }

  async function testConnection(id: string) {
    setTestingId(id);
    setFeedback(data.meta.live ? "正在测试连接…" : "正在准备演示测试…");
    try {
      const result = await defaultWorkspaceClient.simulateUpstreamTest(id);
      if (data.meta.live) setUpstreams((await defaultWorkspaceClient.getWorkspace()).upstreams);
      setFeedback(result.message);
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "连通测试失败");
    } finally {
      setTestingId(null);
    }
  }

  function simulateNewUpstreamTest() {
    setFeedback("连通测试未执行，当前仅为界面演示；不会发起网络请求。");
  }

  async function deleteUpstream(id: string) {
    if (!data.meta.live || !defaultWorkspaceClient.deleteUpstream) return;
    await defaultWorkspaceClient.deleteUpstream(id);
    setUpstreams((current) => current.filter((item) => item.id !== id));
    setFeedback("上游已删除。");
  }

  return (
    <div className="page-content">
      <PageHeader title="上游服务" description="管理目标服务与配置的上游出站协议。" action={<Button variant="primary" onClick={() => setFormOpen((open) => !open)}>添加上游</Button>} />
      <FixtureNotice live={data.meta.live}>{data.meta.live ? "本机运行时数据" : "示例数据 · 非实时"}</FixtureNotice>
      {error && <p className="action-feedback" role="alert">工作区数据读取失败：{error}</p>}
      <div className="toolbar"><SearchField label="搜索上游服务" value={query} onChange={setQuery} /><span className="result-count">{visibleUpstreams.length} 项</span></div>
      {feedback && <p className="action-feedback" role="status">{feedback}</p>}
      {formOpen && <Modal title={data.meta.live ? "新增上游" : "新增上游示例"} onClose={() => setFormOpen(false)}><form className="modal-form" onSubmit={addUpstream}>
        <span className="helper-text">{data.meta.live ? "保存到本机运行时；出站协议在模型路由中配置。" : "仅当前页面会话；出站协议在模型路由中配置。"}</span>
        <TextField label="服务名称" name="name" required maxLength={80} autoComplete="off" />
        <TextField label="Base URL" name="baseUrl" type="url" required placeholder="https://api.example/v1" autoComplete="url" />
        <TextField label="上游 Key" name="key" type="password" required autoComplete="new-password" />
        <div className="form-actions"><Button variant={data.meta.live ? "accent" : "secondary"} onClick={data.meta.live ? () => setFeedback("请先保存上游，再从列表测试连接") : simulateNewUpstreamTest}>{data.meta.live ? "测试连接" : "模拟连通测试"}</Button><Button variant="primary" type="submit">{data.meta.live ? "保存上游" : "保存示例上游"}</Button></div>
      </form></Modal>}
      {visibleUpstreams.length ? <div className="table-scroll"><table>
        <thead><tr><th>服务</th><th>Base URL</th><th>模型</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead>
        <tbody>{visibleUpstreams.map((upstream) => {
          const statusTone = upstream.status === "已连接" ? "status-positive" : /失败|错误/.test(upstream.status) ? "status-negative" : upstream.status === "待测试" ? "status-warning" : "status-neutral";
          return <tr key={upstream.id}>
            <td><strong>{upstream.name}</strong><span className="cell-subtext">凭证引用：{upstream.credentialLabel}</span></td>
            <td><code className="url-cell">{upstream.baseUrl}</code></td>
            <td>{upstream.models.length} 个{data.meta.live ? "已发现" : "预览"}模型</td>
            <td><span className={`status-badge ${statusTone}`}>{upstream.status}</span></td>
            <td><div className="table-actions"><Button variant={data.meta.live ? "accent" : "secondary"} size="small" aria-label={`测试 ${upstream.name}`} disabled={testingId === upstream.id} onClick={() => void testConnection(upstream.id)}>{testingId === upstream.id ? "测试中…" : data.meta.live ? "测试" : "模拟测试"}</Button>{data.meta.live && <Button variant="danger" size="small" onClick={() => void deleteUpstream(upstream.id)}>删除</Button>}</div></td>
          </tr>;
        })}</tbody>
      </table></div> : <EmptyResult>没有匹配的上游服务</EmptyResult>}
      <p className="helper-text page-footnote">{data.meta.live ? "连通测试通过本机控制 API 执行；模型发现结果会写回运行时。" : "连通测试、模型同步及凭证保存尚未连接本机 Gateway。"}</p>
    </div>
  );
}
