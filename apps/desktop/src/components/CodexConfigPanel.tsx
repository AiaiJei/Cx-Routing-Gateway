import { Button } from "./Button";
import type { useCodexManagement } from "../data/codex-management";
export function CodexConfigPanel({
  management,
  blocked,
}: {
  management: ReturnType<typeof useCodexManagement>;
  blocked: boolean;
}) {
  const { status, preview, busy, confirmation, available } = management;
  const date = status?.backup ? new Date(status.backup.createdAt) : undefined;
  return (
    <details className="codex-secondary">
      <summary>配置详情与恢复</summary>
      <div className="codex-section">
        {preview ? (
          <>
            <pre tabIndex={0} aria-label="脱敏配置预览">
              <code>{preview.configPreview}</code>
            </pre>
            {preview.catalogPreview && (
              <details>
                <summary>模型目录摘要</summary>
                <pre tabIndex={0} aria-label="模型目录摘要">
                  <code>{preview.catalogPreview}</code>
                </pre>
              </details>
            )}
          </>
        ) : (
          <p className="helper-text">
            点击当前区域的启用按钮会先预览变更，再确认写入。
          </p>
        )}
        <section className="codex-recovery">
          <div>
            <h2>备份与恢复</h2>
            <p>
              {status?.backup ? (
                <>
                  最近备份{" "}
                  <time dateTime={status.backup.createdAt}>
                    {date && Number.isFinite(date.getTime())
                      ? date.toLocaleString("zh-CN", { hour12: false })
                      : "时间未知"}
                  </time>
                </>
              ) : (
                "还没有由本页创建的备份"
              )}
            </p>
            <p className="helper-text">
              恢复原文件，检查外部修改；返回直连请在直连页启用保存的方案。
            </p>
          </div>
          <Button
            disabled={
              !available ||
              !status?.backup ||
              !!busy ||
              blocked ||
              !!confirmation
            }
            onClick={() => management.setConfirmation("restore")}
          >
            恢复备份
          </Button>
        </section>
        <p className="helper-text">
          直连方案库使用系统安全存储加密。启用后凭证会写入 Codex
          配置文件，历史备份也可能含凭证；配置写入不会修改账户登录或系统环境变量。
        </p>
      </div>
    </details>
  );
}
