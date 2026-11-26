import { useCallback, useEffect, useRef, useState } from "react";
import { codexErrorMessage, getCodexGatewayControls } from "./codex-client";
import type {
  CodexGatewayCredential,
  CodexGatewayCredentials,
} from "../domain/codex-management";
export function useCodexGatewayCredentials() {
  const controls = getCodexGatewayControls();
  const available = !!controls;
  const [data, setData] = useState<CodexGatewayCredentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mounted = useRef(true),
    sequence = useRef(0),
    mutating = useRef(false);
  const refresh = useCallback(async () => {
    const current = getCodexGatewayControls();
    if (!current || mutating.current) return;
    const id = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const value = await current.getCodexGatewayCredentials();
      if (mounted.current && id === sequence.current) setData(value);
      return value;
    } catch (caught) {
      if (mounted.current && id === sequence.current) {
        setData(null);
        setError(
          "凭证读取失败：" + codexErrorMessage(caught, "请刷新凭证后重试。"),
        );
      }
    } finally {
      if (mounted.current && id === sequence.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (available) void refresh();
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, [available, refresh]);
  async function retain(input: {
    id: string;
    key?: string;
    fromCurrent?: boolean;
  }) {
    const current = getCodexGatewayControls();
    if (!current || mutating.current) return false;
    mutating.current = true;
    const id = ++sequence.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const value = await current.retainCodexGatewayCredential(input);
      if (mounted.current && id === sequence.current) {
        setData(value);
        setMessage("凭证原文已在本机验证并加密保存，页面不会读取原文。");
      }
      return true;
    } catch (caught) {
      if (mounted.current && id === sequence.current)
        setError(
          "凭证保存失败：" + codexErrorMessage(caught, "请核对原 Key 后重试。"),
        );
      return false;
    } finally {
      mutating.current = false;
      if (mounted.current && id === sequence.current) setBusy(false);
    }
  }
  function validate(id: string | undefined, aliases: string[]) {
    if (!id) return "请选择一条已保存的凭证。";
    const item = data?.credentials.find((value) => value.id === id);
    if (!item || !item.enabled) return "所选凭证不可用或已撤销，请重新选择。";
    if (!item.secretAvailable)
      return "旧凭证未保存原文，请补录原 Key 后再启用。";
    if (
      item.scope.length &&
      aliases.some((alias) => !item.scope.includes(alias))
    )
      return "所选凭证未授权全部模型，请调整选择或更换凭证。";
    return "";
  }
  return { available, data, busy, error, message, refresh, retain, validate };
}
export function credentialLabel(item: CodexGatewayCredential) {
  return (
    item.name +
    (item.current ? " · 当前使用" : "") +
    (item.enabled
      ? item.secretAvailable
        ? ""
        : " · 旧凭证未保存原文"
      : " · 已撤销") +
    (item.scope.length ? " · " + item.scope.join("、") : " · 全部模型")
  );
}
