import { Button } from "./Button";
import { Modal } from "./Modal";
import type { useCodexManagement } from "../data/codex-management";
export function CodexConfirmDialog({
  management,
  blocked,
  onConfigChanged,
}: {
  management: ReturnType<typeof useCodexManagement>;
  blocked: boolean;
  onConfigChanged?: () => void;
}) {
  const { confirmation, busy, preview, clientKey, selectedAliases } =
    management;
  if (!confirmation) return null;
  const direct = preview?.mode === "direct";
  const title =
    confirmation === "apply"
      ? direct
        ? "确认启用 Codex 直连"
        : "确认保存并启用网关"
      : confirmation === "restore"
        ? "确认恢复 Codex 配置"
        : "创建 Codex 专用 Key";
  return (
    <Modal
      title={title}
      onClose={() => management.setConfirmation(null)}
      canClose={!busy}
    >
      {confirmation === "apply" ? (
        <>
          <dl className="codex-confirm-values">
            <div>
              <dt>提供商</dt>
              <dd>
                {preview?.providerName ||
                  (direct ? "所选直连方案" : "CX-RG 网关")}
              </dd>
            </div>
            {preview?.baseUrl && (
              <div>
                <dt>接入地址</dt>
                <dd>{preview.baseUrl}</dd>
              </div>
            )}
            <div>
              <dt>默认模型</dt>
              <dd>{preview?.model || "由 Codex 选择"}</dd>
            </div>
            <div>
              <dt>模型数量</dt>
              <dd>{preview?.selectedModelAliases.length || 0}</dd>
            </div>
          </dl>
          {!!preview?.changes?.length && (
            <ul>
              {preview?.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          )}
          {!direct && preview?.searchPolicy?.webSearch === "disabled" && <p className="codex-model-notice">
            本次会关闭 web_search：Chat / Mes 上游的官方托管搜索不可用。本地工具、MCP 和自定义工具保留，返回直连时恢复原搜索设置。
          </p>}
          {!direct && <p>
            仅修改当前 CODEX_HOME/config.toml；独立 --profile 配置和启动参数不会自动修改，需自行同步。模型强度列表会在本次保存启用时刷新，路由区间由 Gateway 立即执行。
          </p>}
          {!direct && (
            <p>
              作用范围：当前用户（
              {management.status?.configPath || "CODEX_HOME/config.toml"}
              ），影响使用此目录的 Codex
              CLI/Desktop；不是系统全局，也不是当前项目。
              {management.credentialSource === "stored"
                ? "使用所选已保存凭证，原文仅在本机读取。"
                : clientKey.trim()
                  ? "使用手动 Gateway Key。"
                  : "使用当前 Codex 已保存的 Gateway Key，原文仅在本机读取。"}
              当前直连接入会先加密保存，供日后返回。
            </p>
          )}
          <p>
            仅更新接入字段，其他设置保留。原文件会备份；凭证可能以明文出现在
            Codex 配置与历史备份中。
          </p>
          <p>请重启 Codex 并开启新会话确认；保存不代表已有会话已切换。</p>
          <details>
            <summary>脱敏配置变更</summary>
            <pre tabIndex={0}>{preview?.configPreview}</pre>
          </details>
        </>
      ) : confirmation === "restore" ? (
        <>
          <p>恢复最近一次应用前的完整配置；外部修改或备份校验失败时停止。</p>
          <p>原来没有文件时恢复为不存在的状态。</p>
        </>
      ) : (
        <>
          <p>为全部 {selectedAliases.length} 个模型创建专用 Gateway Key：</p>
          <p className="codex-alias-list">{selectedAliases.join("、")}</p>
          <p>离开前请应用，或到接入凭证页面撤销。</p>
        </>
      )}
      <div className="form-actions">
        <Button
          disabled={!!busy}
          onClick={() => management.setConfirmation(null)}
        >
          取消
        </Button>
        <Button
          variant="primary"
          disabled={!!busy || blocked}
          onClick={async () => {
            const action = confirmation;
            const succeeded = await management.confirmAction();
            if (succeeded && (action === "apply" || action === "restore"))
              onConfigChanged?.();
          }}
        >
          {busy
            ? "处理中…"
            : confirmation === "apply"
              ? "确认启用"
              : confirmation === "restore"
                ? "确认恢复"
                : "确认创建"}
        </Button>
      </div>
    </Modal>
  );
}
