import { Button } from "./Button";
import { Modal } from "./Modal";
import type { useCodexLogin } from "../data/codex-login";
import type { CodexStatus } from "../domain/codex-management";
export function CodexAccessPanel({
  config,
  login,
  nativeAvailable,
  locked,
}: {
  config: CodexStatus | null;
  login: ReturnType<typeof useCodexLogin>;
  nativeAvailable: boolean;
  locked: boolean;
}) {
  const authLabels = {
    chatgpt: "已通过 ChatGPT 登录",
    api: "当前为 API Key 登录",
    signed_out: "尚未登录",
    unknown: "登录状态未知",
  };
  const official =
    config?.mode === "direct" && config.direct?.kind === "official";
  return (
    <details className="codex-login">
      <summary>官方账户登录（可选）</summary>
      <div className="codex-section">
        <div className="codex-section-heading">
          <h2>官方客户端</h2>
          <Button
            size="small"
            disabled={!login.available || login.busy || locked}
            onClick={() => void login.refresh()}
          >
            刷新登录状态
          </Button>
        </div>
        {!nativeAvailable ? (
          <p>浏览器不读取账户状态。</p>
        ) : !login.available ? (
          <p>当前 Desktop 未提供官方登录入口，请在官方 Codex 中登录。</p>
        ) : !login.status ? (
          <p role="status">
            {login.busy ? "正在读取客户端状态…" : "客户端状态未知"}
          </p>
        ) : !login.status.available ? (
          <p>未找到官方 Codex CLI。请安装后刷新，或在官方客户端手动登录。</p>
        ) : (
          <>
            <p>
              Codex CLI {login.status.version || "版本未知"} ·{" "}
              {authLabels[login.status.auth]}
            </p>
            {login.status.login === "pending" && (
              <p role="status">
                等待浏览器完成登录；如未打开浏览器，请取消后在官方 Codex
                中手动登录。
              </p>
            )}
            {login.status.login === "succeeded" && (
              <p role="status">
                官方登录流程已完成，账户状态以上方查询结果为准。
              </p>
            )}
            {login.status.login === "failed" && (
              <p role="status">登录未完成，请重试或在官方客户端登录。</p>
            )}
          </>
        )}
        {login.error && (
          <p role="alert" className="codex-feedback codex-feedback-error">
            {login.error}
          </p>
        )}
        {!official && (
          <p className="helper-text">请先启用官方默认方案，再进行官方登录。</p>
        )}
        <div className="codex-inline-actions">
          {login.status?.login === "pending" ? (
            <Button disabled={login.busy} onClick={() => void login.cancel()}>
              取消本次登录
            </Button>
          ) : (
            <Button
              disabled={
                !nativeAvailable ||
                !login.status?.available ||
                !official ||
                login.busy ||
                locked
              }
              onClick={() => login.setConfirming(true)}
            >
              登录 ChatGPT
            </Button>
          )}
          <span className="helper-text">
            登录不是切换供应商；不会影响其他直连方案的保存。
          </span>
        </div>
      </div>
      {login.confirming && (
        <Modal
          title="使用官方 Codex 登录"
          onClose={() => login.setConfirming(false)}
          canClose={!login.busy}
        >
          <p>
            将启动官方 Codex
            的登录流程，可能更新当前官方登录状态。请在浏览器自行完成；本应用不收集账户、验证码或令牌。
          </p>
          <div className="form-actions">
            <Button
              disabled={login.busy}
              onClick={() => login.setConfirming(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              disabled={login.busy}
              onClick={() => void login.login(config)}
            >
              确认打开登录
            </Button>
          </div>
        </Modal>
      )}
    </details>
  );
}
