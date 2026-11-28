import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { CodexDirectProfileForm } from "./CodexDirectProfileForm";
import { CodexAccessPanel } from "./CodexAccessPanel";
import type { useCodexDirectProfiles } from "../data/codex-direct-profiles";
import type { useCodexLogin } from "../data/codex-login";
import type {
  CodexDirectProfile,
  CodexStatus,
} from "../domain/codex-management";
type Profiles = ReturnType<typeof useCodexDirectProfiles>;
export function CodexDirectPanel({
  profiles,
  status,
  login,
  locked,
  nativeAvailable,
  progress,
  onLibraryChanged,
}: {
  profiles: Profiles;
  status: CodexStatus | null;
  login: ReturnType<typeof useCodexLogin>;
  locked: boolean;
  nativeAvailable: boolean;
  progress: boolean;
  onLibraryChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<CodexDirectProfile | null | undefined>(
    undefined,
  );
  const [deleting, setDeleting] = useState<CodexDirectProfile | null>(null);
  const secure = !!profiles.library?.secureStorageAvailable;
  const canEdit =
    nativeAvailable &&
    profiles.available &&
    secure &&
    !locked &&
    !profiles.busy &&
    !progress;
  const selected = profiles.library?.profiles.find(
    (profile) => profile.id === profiles.selectedId,
  );
  const activeId =
    status?.mode === "direct"
      ? status.direct?.kind === "official"
        ? "official"
        : status.direct?.profileId
      : undefined;
  async function mutate(...args: Parameters<Profiles["mutate"]>) {
    const succeeded = await profiles.mutate(...args);
    if (succeeded) await onLibraryChanged();
    return succeeded;
  }
  return (
    <div className="codex-section">
      <div className="codex-section-heading">
        <div>
          <h2>直连方案</h2>
          <p className="helper-text">
            官方默认或第三方 Responses 供应商。选择方案不会立即切换。
          </p>
        </div>
        <div className="codex-inline-actions">
          <Button
            disabled={!canEdit || !status?.direct?.importable}
            onClick={() => void mutate("import")}
          >
            读取当前配置并保存
          </Button>
          <Button disabled={!canEdit} onClick={() => setEditing(null)}>
            新增供应商
          </Button>
        </div>
      </div>
      <p className="helper-text">
        {selected ? (
          <>
            所选方案：<strong>{selected.name}</strong>
            。使用页面右上角按钮应用；启用前会展示变更并确认。
          </>
        ) : (
          "选择直连方案后，使用页面右上角按钮应用；保存方案本身不会启用。"
        )}
      </p>
      {!profiles.available ? (
        <p className="codex-model-notice">
          当前环境不支持本机直连方案库；请使用新版 Desktop。
        </p>
      ) : profiles.busy && !profiles.library ? (
        <p role="status">正在读取直连方案…</p>
      ) : null}
      {profiles.library && !secure && (
        <p className="codex-model-notice">
          安全存储不可用，不能创建或修改含凭证方案；可选择官方默认。
        </p>
      )}
      {profiles.error && editing === undefined && !deleting && (
        <p role="alert" className="codex-feedback codex-feedback-error">
          {profiles.error}
          <Button
            size="small"
            disabled={profiles.busy || locked}
            onClick={() => void profiles.refresh()}
          >
            刷新方案
          </Button>
        </p>
      )}
      {profiles.message && (
        <p role="status" className="codex-feedback">
          {profiles.message}
        </p>
      )}
      <fieldset
        className="codex-direct-options"
        disabled={locked || profiles.busy}
      >
        <legend className="sr-only">直连方案列表</legend>
        {status?.mode === "direct" &&
          !status.direct?.profileId &&
          status.direct?.kind !== "official" &&
          !activeId && (
            <label className="codex-direct-current">
              <input
                type="radio"
                name="codex-direct-profile"
                checked={!profiles.selectedId}
                onChange={() => profiles.select("")}
              />
              <span>
                <strong>当前 Codex 配置</strong>
                <small>
                  {status.direct?.name || "当前直连"} · 请先读取并保存后切换回来
                </small>
              </span>
              <span className="status-badge status-neutral">当前使用</span>
            </label>
          )}
        {profiles.library?.profiles.map((profile) => (
          <div className="codex-direct-row" key={profile.id}>
            <label>
              <input
                type="radio"
                name="codex-direct-profile"
                aria-label={profile.name}
                checked={profiles.selectedId === profile.id}
                onChange={() => profiles.select(profile.id)}
              />
              <span>
                <strong>{profile.name}</strong>
                <small>
                  {profile.kind === "official"
                    ? "Codex 内置官方服务"
                    : profile.baseUrl || "保留原接入设置"}
                  {profile.defaultModel
                    ? " · 默认 " + profile.defaultModel
                    : ""}
                </small>
                <small>
                  {profile.kind === "official"
                    ? "使用官方客户端已有账户"
                    : profile.credentialConfigured
                      ? "凭证已配置（不显示原文）"
                      : "凭证未配置"}
                  {profile.models.length
                    ? " · " + profile.models.length + " 个模型"
                    : ""}
                </small>
              </span>
            </label>
            <div className="codex-direct-actions">
              {profile.id === activeId && (
                <span className="status-badge status-positive">生效中</span>
              )}
              {profile.id !== "official" && (
                <>
                  <Button
                    size="small"
                    aria-label={"编辑 " + profile.name}
                    disabled={!canEdit || !profile.editable}
                    onClick={() => setEditing(profile)}
                  >
                    编辑
                  </Button>
                  <Button
                    size="small"
                    aria-label={"复制 " + profile.name}
                    disabled={!canEdit}
                    onClick={() => void mutate("duplicate", profile.id)}
                  >
                    复制
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    aria-label={"删除 " + profile.name}
                    disabled={!canEdit || profile.id === activeId}
                    onClick={() => setDeleting(profile)}
                  >
                    删除
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </fieldset>
      {selected?.kind === "snapshot" && (
        <p className="helper-text">
          此方案保留原有高级接入设置，连接字段只读；可复制保存，启用时仅恢复接入相关字段。
        </p>
      )}
      {selected?.kind === "official" && (
        <CodexAccessPanel
          config={status}
          login={login}
          nativeAvailable={nativeAvailable}
          locked={locked}
        />
      )}
      {editing !== undefined && (
        <CodexDirectProfileForm
          profile={editing || undefined}
          busy={profiles.busy}
          operationError={profiles.error}
          onClose={() => setEditing(undefined)}
          onSave={(input) => mutate("save", input)}
        />
      )}
      {deleting && (
        <Modal
          title="删除直连方案"
          onClose={() => setDeleting(null)}
          canClose={!profiles.busy}
        >
          <p>
            删除“{deleting.name}”的本地方案和加密保存的凭证，不会修改正在使用的
            Codex 配置。
          </p>
          {profiles.error && (
            <p role="alert" className="codex-feedback codex-feedback-error">
              {profiles.error}
            </p>
          )}
          <div className="form-actions">
            <Button disabled={profiles.busy} onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              disabled={profiles.busy}
              onClick={async () => {
                if (await mutate("delete", deleting.id)) setDeleting(null);
              }}
            >
              确认删除
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
