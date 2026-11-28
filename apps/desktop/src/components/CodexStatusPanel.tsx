import { codexModeLabel, type CodexStatus } from "../domain/codex-management";

function CatalogStatus({ sync }: { sync: CodexStatus["catalogSync"] }) {
  const source = sync?.source === "gateway" ? "网关" : sync?.source === "direct" ? "直连" : "";
  const message = !sync ? "尚未提供模型目录检查结果，不能确认图片能力是否已写入。请刷新状态；若仍无结果，请更新 Gateway。"
    : sync.state === "current" ? `已应用的${source}模型目录与当前设置一致。`
    : sync.state === "stale" ? sync.source === "direct"
      ? "直连模型目录待重新应用。请重新保存并启用当前直连方案，再完整退出并重启 Codex。"
      : "网关模型目录待重新应用。请点击上方 CX-RG 网关标签并确认启用，再完整退出并重启 Codex。"
    : sync.state === "unavailable" ? `无法核对模型目录。请检查本机服务和模型目录，目录可能缺失或损坏。本机服务正常时，请${sync.source === "direct" ? "重新保存并启用当前直连方案" : "点击上方 CX-RG 网关标签并确认启用"}以修复目录，再完整退出并重启 Codex；当前不能确认目录与设置是否一致。`
    : "当前接入未使用本产品的模型能力目录，或被启动配置、模型选择覆盖。模型路由中的能力不能据此认定已应用。";
  return <section aria-label="模型能力目录">
    <h3 className="section-title">模型能力目录</h3>
    <p className={sync?.state === "current" ? "helper-text" : "codex-catalog-notice"} role="status">{message}</p>
    {sync?.state === "not-applied" && <p className="helper-text">如果要使用网关路由，请点击上方 CX-RG 网关标签并确认启用，再完整退出并重启 Codex；启动配置或模型选择覆盖时，请先检查所用的接入方案。</p>}
    {!!sync?.models.length && <>
      <p className="helper-text">当前已写入目录的输入能力：</p>
      <ul className="helper-text">{sync.models.map(item => <li key={item.model}>{item.model}：{item.inputModalities.includes("image") ? "文本和图片" : item.inputModalities.includes("text") ? "仅文本" : "未提供输入能力"}</li>)}</ul>
    </>}
    {sync?.catalogPath && <p className="codex-path"><span>模型目录</span><code>{sync.catalogPath}</code></p>}
    {sync?.state === "current" && <p className="helper-text">仅检查磁盘配置，不能确认正在运行的 Codex 已重载。应用目录后请完整退出并重启 Codex；实际供应商图片支持仍需请求验证。</p>}
  </section>;
}
export function CodexStatusPanel({
  status,
  available,
  loading,
}: {
  status: CodexStatus | null;
  available: boolean;
  loading: boolean;
}) {
  return (
    <section className="codex-current" aria-label="当前生效配置">
      <dl className="codex-current-values">
        <div>
          <dt>当前接入</dt>
          <dd>
            {!available
              ? "本机状态未读取"
              : loading
                ? "读取中…"
                : status
                  ? codexModeLabel(status.mode)
                  : "无法识别"}
          </dd>
        </div>
        {status && (
          <>
            <div>
              <dt>当前提供商</dt>
              <dd>
                {status.mode === "direct"
                  ? status.direct?.name || "无法识别"
                  : status.mode === "gateway"
                    ? "CX-RG 网关"
                    : "无法识别"}
              </dd>
            </div>
            <div>
              <dt>当前模型</dt>
              <dd>{status.model || status.direct?.model || "由 Codex 选择"}</dd>
            </div>
          </>
        )}
      </dl>
      {status && (
        <>
          <p className="codex-path">
            <span>配置文件</span>
            <code>{status.configPath}</code>
          </p>
          {(status.direct?.baseUrl || status.baseUrl) && (
            <p className="codex-path">
              <span>接入地址</span>
              <code>{status.direct?.baseUrl || status.baseUrl}</code>
            </p>
          )}
          {status.direct?.warning && (
            <p className="codex-catalog-notice">{status.direct.warning}</p>
          )}
          {available && !loading && <CatalogStatus sync={status.catalogSync} />}
        </>
      )}
    </section>
  );
}
