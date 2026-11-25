import { useCallback, useEffect, useRef, useState } from "react";
import { codexErrorMessage, getCodexControls } from "./codex-client";
import { defaultWorkspaceClient } from "./workspace-client";
import type { CodexPreview, CodexReasoningEffort, CodexSelection, CodexStatus } from "../domain/codex-management";
import type { ModelRoute } from "../domain/types";

type Busy = "status" | "preview" | "create" | "apply" | "restore" | null;
type Confirmation = "apply" | "restore" | "create" | null;

export function useCodexManagement(live: boolean, route: ModelRoute | undefined, workspaceRefreshing = false) {
  const controls = getCodexControls();
  const available = live && !!controls;
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [preview, setPreview] = useState<CodexPreview | null>(null);
  const [reasoning, setReasoning] = useState<"" | CodexReasoningEffort>("");
  const [clientKey, setClientKey] = useState("");
  const [keyScope, setKeyScope] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [message, setMessage] = useState("");
  const sequence = useRef(0);
  const statusSequence = useRef(0);
  const mutationSequence = useRef(0);
  const mutationInFlight = useRef(false);
  const mounted = useRef(true);

  const invalidate = useCallback(() => {
    sequence.current += 1;
    setPreview(null);
    if (mutationInFlight.current) return;
    setConfirmation(null);
    setError("");
    setMessage("");
    setBusy(current => current === "preview" ? null : current);
  }, []);

  const refreshStatus = useCallback(async () => {
    const currentControls = getCodexControls();
    if (!available || !currentControls || mutationInFlight.current) return;
    sequence.current += 1;
    const request = ++statusSequence.current;
    setPreview(null);
    setError("");
    setStatusError("");
    setMessage("");
    setBusy("status");
    try {
      const value = await currentControls.getCodexStatus();
      if (mounted.current && statusSequence.current === request) setStatus(value);
    } catch (caught) {
      if (mounted.current && statusSequence.current === request) {
        setStatus(null);
        setStatusError("配置读取失败：" + codexErrorMessage(caught, "无法读取本机 Codex 配置，请重试。"));
      }
    } finally {
      if (mounted.current && statusSequence.current === request) setBusy(null);
    }
  }, [available]);

  useEffect(() => {
    mounted.current = true;
    if (available) void refreshStatus();
    else { sequence.current += 1; setStatus(null); setPreview(null); setBusy(null); }
    return () => { mounted.current = false; sequence.current += 1; statusSequence.current += 1; };
  }, [available, refreshStatus]);

  function selection(): CodexSelection {
    return { routeId: route!.id, ...(reasoning ? { reasoningEffort: reasoning } : {}) };
  }

  async function requestPreview() {
    if (!available || !controls || !route || !status || busy || workspaceRefreshing || mutationInFlight.current) return;
    const request = ++sequence.current;
    setError(""); setMessage(""); setPreview(null); setBusy("preview");
    try {
      const value = await controls.previewCodexConfig(selection());
      if (mounted.current && sequence.current === request) setPreview(value);
    } catch (caught) {
      if (mounted.current && sequence.current === request) setError("预览失败：" + codexErrorMessage(caught, "请刷新状态后重试。"));
    } finally {
      if (mounted.current && sequence.current === request) setBusy(null);
    }
  }

  async function confirmAction() {
    if (!available || !controls || busy || !confirmation || workspaceRefreshing || mutationInFlight.current) return;
    const action = confirmation;
    if ((action === "apply" && (!preview || !route || !clientKey.trim() || (keyScope && keyScope !== route.alias))) ||
        (action === "create" && (!route || !defaultWorkspaceClient.createClientKey)) ||
        (action === "restore" && !status?.backup)) return;
    const selected = route ? selection() : undefined;
    const selectedAlias = route?.alias;
    const applyInput = action === "apply" ? { ...selected!, clientKey: clientKey.trim(), expectedRevision: preview!.revision } : undefined;
    const restoreInput = action === "restore" ? { backupId: status!.backup!.id, expectedRevision: status!.revision } : undefined;
    sequence.current += 1;
    const request = ++mutationSequence.current;
    mutationInFlight.current = true;
    setError(""); setMessage(""); setBusy(action);
    try {
      if (action === "create") {
        const result = await defaultWorkspaceClient.createClientKey!("Codex · " + selectedAlias!, [selectedAlias!]);
        if (typeof result.key !== "string" || !result.key) throw new Error("Invalid client key result");
        if (mounted.current && mutationSequence.current === request) {
          setClientKey(result.key);
          setKeyScope(selectedAlias!);
          setPreview(null);
          setMessage("专用 Key 已创建并填入，仅允许访问 " + selectedAlias + "。离开页面前请应用，或到接入凭证页面撤销。");
        }
      } else {
        const next = action === "apply"
          ? await controls.applyCodexConfig(applyInput!)
          : await controls.restoreCodexConfig(restoreInput!);
        if (mounted.current && mutationSequence.current === request) {
          setStatus(next);
          setPreview(null);
          setClientKey("");
          setKeyScope(null);
          setMessage(action === "apply" ? "配置已保存。请重启 Codex 并开启新会话确认接入。" : "已恢复备份。请重启 Codex 并开启新会话确认。");
        }
      }
    } catch (caught) {
      if (mounted.current && mutationSequence.current === request) {
        setPreview(null);
        const label = action === "apply" ? "应用失败：" : action === "restore" ? "恢复失败：" : "创建 Key 失败：";
        setError(label + codexErrorMessage(caught, "操作未完成，请刷新状态后重试。"));
      }
    } finally {
      if (mutationSequence.current === request) {
        mutationInFlight.current = false;
        if (mounted.current) { setBusy(null); setConfirmation(null); }
      }
    }
  }

  return {
    available, status, preview, reasoning, clientKey, keyScope, busy, confirmation, error: error || statusError, message,
    invalidate, refreshStatus, requestPreview, confirmAction, setConfirmation,
    changeReasoning(value: string) { invalidate(); setReasoning(value as typeof reasoning); },
    changeClientKey(value: string) { invalidate(); setClientKey(value); setKeyScope(null); },
  };
}
