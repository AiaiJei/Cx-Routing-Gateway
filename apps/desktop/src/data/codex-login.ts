import { useCallback, useEffect, useRef, useState } from "react";
import { codexErrorMessage, getCodexClientControls } from "./codex-client";
import type { CodexClientStatus, CodexStatus } from "../domain/codex-management";

export function useCodexLogin() {
  const available = !!getCodexClientControls();
  const [status, setStatus] = useState<CodexClientStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pollCycle, setPollCycle] = useState(0);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const inFlight = useRef<number | null>(null);

  const refresh = useCallback(async (quiet = false) => {
    const controls = getCodexClientControls();
    if (!controls || inFlight.current !== null) return;
    const request = ++sequence.current;
    inFlight.current = request;
    setBusy(true);
    if (!quiet) setError("");
    try {
      const next = await controls.getCodexClientStatus();
      if (mounted.current && sequence.current === request) { setStatus(next); setError(""); }
    } catch (caught) {
      if (mounted.current && sequence.current === request) setError("客户端状态读取失败：" + codexErrorMessage(caught, "请重试，或在官方 Codex 中查看登录状态。"));
    } finally {
      if (inFlight.current === request) inFlight.current = null;
      if (mounted.current && sequence.current === request) { setBusy(false); if (quiet) setPollCycle(value => value + 1); }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (available) void refresh();
    return () => { mounted.current = false; sequence.current += 1; inFlight.current = null; };
  }, [available, refresh]);
  useEffect(() => {
    if (status?.login !== "pending") return;
    const timer = setTimeout(() => void refresh(true), 1500);
    return () => clearTimeout(timer);
  }, [status, refresh, pollCycle]);

  async function login(config: CodexStatus | null) {
    const controls = getCodexClientControls();
    if (!controls || !config || config.mode !== "direct" || config.direct?.kind !== "official" || !status?.available || status.login === "pending" || inFlight.current !== null) return;
    const request = ++sequence.current;
    inFlight.current = request; setBusy(true); setError("");
    try {
      const next = await controls.startCodexLogin({ expectedRevision: config.revision });
      if (mounted.current && sequence.current === request) setStatus(next);
    } catch (caught) {
      if (mounted.current && sequence.current === request) setError("登录未完成：" + codexErrorMessage(caught, "请在官方 Codex 中重试登录。"));
    } finally {
      if (inFlight.current === request) inFlight.current = null;
      if (mounted.current && sequence.current === request) { setBusy(false); setConfirming(false); }
    }
  }

  async function cancel() {
    const controls = getCodexClientControls();
    if (!controls || status?.login !== "pending" || inFlight.current !== null) return;
    const request = ++sequence.current;
    inFlight.current = request; setBusy(true); setError("");
    try {
      const next = await controls.cancelCodexLogin();
      if (mounted.current && sequence.current === request) setStatus(next);
    } catch (caught) {
      if (mounted.current && sequence.current === request) setError("取消未完成：" + codexErrorMessage(caught, "请稍后重试。"));
    } finally {
      if (inFlight.current === request) inFlight.current = null;
      if (mounted.current && sequence.current === request) setBusy(false);
    }
  }
  return { available, status, busy, error, confirming, setConfirming, refresh, login, cancel };
}
