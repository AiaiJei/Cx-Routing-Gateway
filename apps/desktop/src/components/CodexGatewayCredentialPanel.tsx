import { useState } from "react";
import { Button } from "./Button";
import { CustomSelect } from "./CustomSelect";
import { TextField } from "./TextField";
import { credentialLabel } from "../data/codex-gateway-credentials";
import type { useCodexManagement } from "../data/codex-management";
export function CodexGatewayCredentialPanel({
  management,
  ready,
  locked,
  canCreate,
}: {
  management: ReturnType<typeof useCodexManagement>;
  ready: boolean;
  locked: boolean;
  canCreate: boolean;
}) {
  const [originalKey, setOriginalKey] = useState("");
  const { credentials, credentialSource, credentialId, preferences } =
    management;
  const selected = credentials.data?.credentials.find(
    (item) => item.id === credentialId,
  );
  const value =
    credentialSource === "stored" ? "stored:" + credentialId : credentialSource;
  const options = [
    { value: "current", label: "当前 Codex 配置凭证" },
    { value: "manual", label: "手动输入 Key" },
    ...(credentials.data?.credentials || []).map((item) => ({
      value: "stored:" + item.id,
      label: credentialLabel(item),
    })),
  ];
  if (credentialSource === "stored" && !selected)
    options.push({
      value: "stored:" + credentialId,
      label: "已记住的凭证不可用 · " + credentialId,
    });
  async function retain(fromCurrent = false) {
    const id = fromCurrent
      ? credentials.data?.currentCredentialId
      : credentialId;
    if (!id) return;
    if (
      await credentials.retain({
        id,
        ...(fromCurrent ? { fromCurrent: true } : { key: originalKey }),
      })
    ) {
      setOriginalKey("");
      management.changeCredential("stored", id);
    }
  }
  return (
    <section className="codex-credentials">
      <div className="codex-section-heading">
        <h2>Gateway 接入凭证</h2>
        <Button
          size="small"
          disabled={!credentials.available || credentials.busy || locked}
          onClick={() => void credentials.refresh()}
        >
          刷新凭证
        </Button>
      </div>
      {credentials.available ? (
        <div className="geist-field">
          <span className="geist-field-label">选择凭证来源</span>
          <fieldset disabled={locked || credentials.busy}>
            <CustomSelect
              ariaLabel="Gateway 接入凭证"
              value={value}
              onChange={(next) => {
                setOriginalKey("");
                management.changeCredential(
                  next.startsWith("stored:")
                    ? "stored"
                    : (next as "current" | "manual"),
                  next.startsWith("stored:") ? next.slice(7) : undefined,
                );
              }}
              options={options}
            />
          </fieldset>
        </div>
      ) : (
        <p className="codex-model-notice">
          当前 Desktop 尚未提供凭证选择，请使用手动 Key 或更新应用。
        </p>
      )}
      {credentialSource === "current" && (
        <>
          <p className="helper-text">
            {credentials.data?.currentConfigured ||
            management.status?.credentialConfigured
              ? "使用当前 Codex 已保存的 Gateway Key，原文仅在本机验证。"
              : "当前配置没有 Gateway Key，请选择已有凭证或手动输入。"}
          </p>
          {credentials.data?.currentCredentialId && (
            <Button
              size="small"
              disabled={locked || credentials.busy}
              onClick={() => void retain(true)}
            >
              读取当前配置凭证
            </Button>
          )}
          {credentials.data?.currentConfigured &&
            !credentials.data.currentCredentialId && (
              <p className="helper-text">
                当前 Key
                尚未匹配到启用的接入凭证；读取配置不代表它有效，请选择可用凭证或手动输入原
                Key。
              </p>
            )}
        </>
      )}
      {credentialSource === "stored" && selected && (
        <>
          <p className="helper-text">
            模型范围：
            {selected.scope.length
              ? selected.scope.join("、")
              : "全部模型"} · {selected.enabled ? "已启用" : "已撤销"}
          </p>
          {!selected.secretAvailable && selected.enabled && (
            <div className="codex-legacy-key">
              <p className="codex-model-notice">
                旧凭证未保存原文，请补录原 Key。不会自动轮换或改变凭证。
              </p>
              <TextField
                label="补录原 Key"
                type="password"
                autoComplete="off"
                maxLength={8192}
                value={originalKey}
                onChange={(event) => setOriginalKey(event.target.value)}
                disabled={locked || credentials.busy}
              />
              <Button
                disabled={!originalKey.trim() || locked || credentials.busy}
                onClick={() => void retain()}
              >
                保存原 Key
              </Button>
            </div>
          )}
        </>
      )}
      {(credentialSource === "manual" || !preferences.available) && (
        <TextField
          label="Gateway 客户端 Key"
          type="password"
          autoComplete="off"
          maxLength={4096}
          value={management.clientKey}
          onChange={(event) => management.changeClientKey(event.target.value)}
          disabled={!management.available || !ready || locked}
          hint="只记住手动来源，不保存此处原文；离开页面后需重新输入。"
        />
      )}
      {credentials.error && (
        <p role="alert" className="codex-feedback codex-feedback-error">
          {credentials.error}
        </p>
      )}
      {credentials.message && (
        <p role="status" className="codex-feedback">
          {credentials.message}
        </p>
      )}
      <div className="codex-inline-actions">
        <Button
          disabled={!canCreate || locked || credentials.busy}
          onClick={() => management.setConfirmation("create")}
        >
          创建专用 Key
        </Button>
        <span className="helper-text">
          创建后加密保存并选中，范围包含全部已选模型。
        </span>
      </div>
    </section>
  );
}
