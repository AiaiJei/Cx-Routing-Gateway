import { useCallback, useEffect, useRef, useState } from "react";
import { codexErrorMessage, getCodexPreferencesControls } from "./codex-client";
import type {
  CodexGatewayDraft,
  CodexStatus,
} from "../domain/codex-management";
const emptyDraft = (): CodexGatewayDraft => ({
  routeIds: [],
  defaultRouteId: "",
  credentialSource: "current",
});
const queues = new WeakMap<object, Promise<unknown>>();
function ordered<T>(owner: object, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(owner) || Promise.resolve())
    .catch(() => {})
    .then(operation);
  queues.set(
    owner,
    next.catch(() => {}),
  );
  return next;
}
export function useCodexGatewayPreferences(status: CodexStatus | null) {
  const controls = getCodexPreferencesControls();
  const owner = window.desktopControls;
  const available = !!controls;
  const [draft, setDraft] = useState<CodexGatewayDraft>(emptyDraft);
  const [ready, setReady] = useState(!available);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    available ? "正在读取已记住的网关草稿…" : "当前环境不能记住网关草稿。",
  );
  const mounted = useRef(true);
  const sequence = useRef(0);
  const revision = useRef<string | null>(null);
  const pending = useRef<CodexGatewayDraft | null>(null);
  const current = useRef<CodexGatewayDraft>(emptyDraft());
  const touched = useRef(false);
  const seeded = useRef(false);
  const writing = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const statusRef = useRef(status);
  statusRef.current = status;

  const flush = useCallback(async () => {
    if (writing.current) return writing.current;
    if (!controls || !owner || revision.current === null || !pending.current)
      return;
    clearTimeout(timer.current);
    const run = async () => {
      if (mounted.current) {
        setSaving(true);
        setError("");
        setMessage("正在记住网关草稿…");
      }
      while (pending.current && revision.current !== null) {
        const value = pending.current;
        pending.current = null;
        try {
          const next = await controls.saveCodexGatewayPreferences({
            expectedRevision: revision.current!,
            ...value,
          });
          revision.current = next.revision;
        } catch (caught) {
          if (!pending.current) pending.current = value;
          revision.current = null;
          if (mounted.current) {
            setReady(false);
            setError(
              "网关草稿保存失败：" +
                codexErrorMessage(caught, "请重新读取后重试。"),
            );
            setMessage("草稿尚未记住，当前配置未改变。");
          }
          break;
        }
      }
      if (mounted.current) {
        setSaving(false);
        if (revision.current !== null)
          setMessage("网关草稿已记住，尚未应用到 Codex。");
      }
    };
    // One queue reservation owns the whole drain, including edits that arrive
    // while a write is pending. A new mount must read after the final write.
    writing.current = ordered(owner, run).finally(() => {
      writing.current = null;
    });
    return writing.current;
  }, [controls?.saveCodexGatewayPreferences, owner]);

  const load = useCallback(async () => {
    if (!controls || !owner) return;
    const id = ++sequence.current;
    setReady(false);
    setError("");
    try {
      const value = await ordered(owner, async () => {
        let loaded = await controls.getCodexGatewayPreferences();
        const active = statusRef.current;
        if (!loaded.exists && !touched.current && active?.mode === "gateway") {
          loaded = await controls.saveCodexGatewayPreferences({
            expectedRevision: loaded.revision,
            routeIds: active.selectedRouteIds || [],
            defaultRouteId: active.defaultRouteId || "",
            credentialSource: "current",
          });
        }
        // A page can be left before its initial revision read resolves. Keep its
        // final edit inside this queued operation so the next mount reads it.
        if ((!mounted.current || id !== sequence.current) && pending.current) {
          const latest = pending.current;
          pending.current = null;
          loaded = await controls.saveCodexGatewayPreferences({
            expectedRevision: loaded.revision,
            ...latest,
          });
        }
        return loaded;
      });
      if (!mounted.current || id !== sequence.current) return;
      revision.current = value.revision;
      if (!touched.current) {
        const active = statusRef.current;
        const initial =
          !value.exists && active?.mode === "gateway"
            ? {
                routeIds: active.selectedRouteIds || [],
                defaultRouteId: active.defaultRouteId || "",
                credentialSource: "current" as const,
              }
            : {
                routeIds: value.routeIds,
                defaultRouteId: value.defaultRouteId,
                credentialSource: value.credentialSource,
                ...(value.credentialSource === "stored"
                  ? { credentialId: value.credentialId }
                  : {}),
              };
        current.current = initial;
        setDraft(initial);
        seeded.current = value.exists || active?.mode === "gateway";
      }
      setReady(true);
      setMessage(
        value.exists
          ? "已读取本机网关草稿，尚未自动应用。"
          : "选择会在本机记住，启用前仍需确认。",
      );
      if (pending.current) void flush();
    } catch (caught) {
      if (mounted.current && id === sequence.current) {
        revision.current = null;
        setReady(false);
        setError(
          "网关草稿读取失败：" +
            codexErrorMessage(caught, "请检查本机草稿后重试。"),
        );
        setMessage("未覆盖记忆文件，当前配置未改变。");
      }
    }
  }, [controls?.getCodexGatewayPreferences, owner, flush]);

  useEffect(() => {
    mounted.current = true;
    if (available) void load();
    return () => {
      clearTimeout(timer.current);
      void flush();
      mounted.current = false;
      sequence.current += 1;
    };
  }, [available, load, flush]);
  useEffect(() => {
    if (
      ready &&
      !touched.current &&
      !seeded.current &&
      status?.mode === "gateway"
    ) {
      const initial: CodexGatewayDraft = {
        routeIds: status.selectedRouteIds || [],
        defaultRouteId: status.defaultRouteId || "",
        credentialSource: "current",
      };
      current.current = initial;
      setDraft(initial);
      seeded.current = true;
      pending.current = initial;
      void flush();
    }
  }, [ready, status, flush]);
  function change(value: CodexGatewayDraft) {
    touched.current = true;
    const next: CodexGatewayDraft = {
      routeIds: [...value.routeIds],
      defaultRouteId: value.defaultRouteId,
      credentialSource: value.credentialSource,
      ...(value.credentialSource === "stored"
        ? { credentialId: value.credentialId }
        : {}),
    };
    current.current = next;
    pending.current = next;
    setDraft(next);
    setMessage("草稿有更改，等待记住；当前配置未改变。");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 400);
  }
  return {
    available,
    draft,
    ready,
    saving,
    error,
    message,
    change,
    flush,
    canUseDraft() {
      return !available || revision.current !== null;
    },
    async retry() {
      await load();
    },
  };
}
