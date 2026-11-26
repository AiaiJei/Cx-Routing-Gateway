import { useRef, useState, type FormEvent } from "react";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { CustomSelect } from "./CustomSelect";
import { Modal } from "./Modal";
import type {
  CodexDirectProfile,
  CodexDirectProfileInput,
} from "../domain/codex-management";
export function CodexDirectProfileForm({
  profile,
  busy,
  operationError,
  onSave,
  onClose,
}: {
  profile?: CodexDirectProfile;
  busy: boolean;
  operationError?: string;
  onSave: (
    input: Omit<CodexDirectProfileInput, "expectedRevision">,
  ) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile?.name || "");
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl || "");
  const [apiKey, setApiKey] = useState("");
  const [modelText, setModelText] = useState(profile?.models.join("\n") || "");
  const [defaultModel, setDefault] = useState(profile?.defaultModel || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlight = useRef(false);
  const locked = busy || submitting;
  const models = modelText
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
  function changeModels(value: string) {
    setModelText(value);
    const values = value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    setDefault((current) =>
      values.includes(current) ? current : values[0] || "",
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || submissionInFlight.current) return;
    setError("");
    if (!name.trim() || name.trim().length > 80)
      return setError("请填写 1 至 80 字的方案名称。");
    let url: URL;
    try {
      url = new URL(baseUrl.trim());
    } catch {
      return setError("请填写有效的 Responses API 地址。");
    }
    if (
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return setError(
        "地址需使用 HTTPS 或本机 HTTP，且不能包含凭证、查询参数或片段。",
      );
    if (
      !models.length ||
      models.length > 100 ||
      new Set(models).size !== models.length ||
      models.some((model) => model.length > 256) ||
      !models.includes(defaultModel)
    )
      return setError("请填写 1 至 100 个不重复模型，并从中选择默认模型。");
    if (!profile?.credentialConfigured && !apiKey.trim())
      return setError("请填写供应商 API Key。");
    submissionInFlight.current = true;
    setSubmitting(true);
    try {
      const success = await onSave({
        ...(profile ? { id: profile.id } : {}),
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        models,
        defaultModel,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      if (success) {
        setApiKey("");
        onClose();
      }
    } catch {
      setError("方案保存未完成，请重试。输入内容已保留。");
    } finally {
      submissionInFlight.current = false;
      setSubmitting(false);
    }
  }
  function close() {
    if (!busy && !submissionInFlight.current) onClose();
  }
  return (
    <Modal
      title={profile ? "编辑直连供应商" : "新增直连供应商"}
      onClose={close}
      canClose={!locked}
    >
      <form
        className="codex-profile-form"
        onSubmit={(event) => void save(event)}
      >
        <TextField
          label="方案名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          disabled={locked}
        />
        <TextField
          label="Responses API 地址"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.example.com/v1"
          disabled={locked}
        />
        <TextField
          label="供应商 API Key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          maxLength={8192}
          disabled={locked}
          hint={
            profile?.credentialConfigured
              ? "留空保留已有 Key；原文不会返回页面。"
              : "方案库使用系统安全存储加密保存凭证。"
          }
        />
        <label className="geist-field">
          <span className="geist-field-label">模型列表（每行一个）</span>
          <textarea
            className="geist-input"
            aria-label="模型列表（每行一个）"
            value={modelText}
            onChange={(event) => changeModels(event.target.value)}
            rows={4}
            disabled={locked}
          />
        </label>
        <div className="geist-field">
          <span className="geist-field-label">默认模型</span>
          <fieldset disabled={locked}>
            <CustomSelect
              ariaLabel="默认模型"
              value={defaultModel}
              onChange={setDefault}
              options={[...new Set(models)]}
              placeholder="先填写模型"
            />
          </fieldset>
        </div>
        <p className="helper-text">
          保存方案只更新本地方案库，不会立即修改 Codex 接入。仅支持
          Responses；其他协议请通过网关转换。
        </p>
        {error && (
          <p role="alert" className="codex-feedback codex-feedback-error">
            {error}
          </p>
        )}
        {operationError && (
          <p role="alert" className="codex-feedback codex-feedback-error">
            {operationError}
          </p>
        )}
        <div className="form-actions">
          <Button disabled={locked} onClick={close}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={locked}>
            {locked ? "保存中…" : "保存方案"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
