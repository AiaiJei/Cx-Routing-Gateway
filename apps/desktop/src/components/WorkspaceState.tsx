import { PageHeader } from "./PageHeader";

/** Keep the page identity without showing fixture rows before a runtime read completes. */
export function WorkspaceState({ title, loading, error }: { title: string; loading: boolean; error: string }) {
  return <div className="page-content">
    <PageHeader title={title} description="本机工作区" />
    {loading ? <div className="workspace-loading" role="status">
      <p>正在读取工作区…</p>
      <div className="loading-rows" aria-hidden="true"><span /><span /><span /></div>
    </div> : <div className="workspace-error" role="alert">
      <p>工作区数据读取失败：{error}</p>
      <p className="helper-text">请重新打开此页面后重试。</p>
    </div>}
  </div>;
}
