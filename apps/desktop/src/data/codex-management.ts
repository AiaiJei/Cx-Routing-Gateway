import { useCallback, useEffect, useRef, useState } from "react";
import { codexErrorMessage, getCodexControls } from "./codex-client";
import { defaultWorkspaceClient } from "./workspace-client";
import { useCodexGatewayPreferences } from "./codex-gateway-preferences";
import { useCodexGatewayCredentials } from "./codex-gateway-credentials";
import type {
  CodexMode,
  CodexPreview,
  CodexSelection,
  CodexStatus,
} from "../domain/codex-management";
import type { ModelRoute } from "../domain/types";
type Busy = "status" | "preview" | "create" | "apply" | "restore" | null;
type Confirmation = "apply" | "restore" | "create" | null;
export const isCodexRouteAvailable = (route: ModelRoute) =>
  route.enabled && route.inboundProtocol === "Res" && route.targets.length > 0 && route.capabilities?.tools !== false;
export function useCodexManagement(
  routes: ModelRoute[],
  gatewayReady: boolean,
) {
  const controls = getCodexControls();
  const available = !!controls;
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [preview, setPreview] = useState<CodexPreview | null>(null);
  const preferences = useCodexGatewayPreferences(status);
  const credentials = useCodexGatewayCredentials();
  const [fallbackRoutes, setFallbackRoutes] = useState<string[]>([]);
  const [fallbackDefault, setFallbackDefault] = useState("");
  const routeIds = preferences.available
    ? preferences.draft.routeIds
    : fallbackRoutes;
  const defaultRouteId = preferences.available
    ? preferences.draft.defaultRouteId
    : fallbackDefault;
  const credentialSource = preferences.available
    ? preferences.draft.credentialSource
    : "current";
  const credentialId = preferences.available
    ? preferences.draft.credentialId
    : undefined;
  const [clientKey, setClientKey] = useState("");
  const [keyScope, setKeyScope] = useState<string[] | null>(null);
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
  const touched = useRef(false);
  const pendingSelection = useRef<CodexSelection | null>(null);
  const selectedRoutes = routeIds.map((id) =>
    routes.find((route) => route.id === id),
  );
  const selectedAliases = selectedRoutes.flatMap((route) =>
    route ? [route.alias] : [],
  );
  const validModels =
    routeIds.length > 0 &&
    routeIds.length <= 100 &&
    routeIds.includes(defaultRouteId) &&
    selectedRoutes.every((route) => route && isCodexRouteAvailable(route)) &&
    new Set(selectedAliases).size === routeIds.length;
  const keyMatchesSelection =
    !keyScope || selectedAliases.every((alias) => keyScope.includes(alias));
  const invalidate = useCallback(() => {
    sequence.current += 1;
    setPreview(null);
    pendingSelection.current = null;
    if (mutationInFlight.current) return;
    setConfirmation(null);
    setError("");
    setMessage("");
    setBusy((current) => (current === "preview" ? null : current));
  }, []);
  useEffect(() => {
    if (!status || touched.current || preferences.available) return;
    let ids = status.selectedRouteIds || [];
    if (!ids.length && status.mode === "gateway" && status.model) {
      const matches = routes.filter(
        (route) => isCodexRouteAvailable(route) && route.alias === status.model,
      );
      if (matches.length === 1) ids = [matches[0].id];
    }
    setFallbackRoutes(ids);
    setFallbackDefault(
      ids.includes(status.defaultRouteId || "")
        ? status.defaultRouteId!
        : ids[0] || "",
    );
  }, [status, routes, preferences.available]);
  const fingerprint = JSON.stringify(routes);
  const previousRoutes = useRef(fingerprint);
  useEffect(() => {
    if (previousRoutes.current !== fingerprint) invalidate();
    previousRoutes.current = fingerprint;
  }, [fingerprint, invalidate]);
  const refreshStatus = useCallback(async () => {
    const current = getCodexControls();
    if (!current || mutationInFlight.current) return;
    sequence.current += 1;
    const id = ++statusSequence.current;
    setPreview(null);
    pendingSelection.current = null;
    setError("");
    setStatusError("");
    setBusy("status");
    try {
      const next = await current.getCodexStatus();
      if (mounted.current && id === statusSequence.current) setStatus(next);
    } catch (caught) {
      if (mounted.current && id === statusSequence.current) {
        setStatus(null);
        setStatusError(
          "配置读取失败：" +
            codexErrorMessage(caught, "无法读取本机配置，请重试。"),
        );
      }
    } finally {
      if (mounted.current && id === statusSequence.current) setBusy(null);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (available) void refreshStatus();
    return () => {
      mounted.current = false;
      sequence.current += 1;
      statusSequence.current += 1;
    };
  }, [available, refreshStatus]);
  function gatewaySelection(): CodexSelection {
    return { mode: "gateway", routeIds: [...routeIds], defaultRouteId };
  }
  function validation(mode: CodexMode) {
    if (!controls || !status) return "请先读取本机配置状态。";
    if (mode === "gateway") {
      if (!gatewayReady) return "Gateway 工作区尚未就绪，请刷新后重试。";
      if (!routeIds.length) return "请至少选择一个模型。";
      if (!validModels)
        return "请检查已选模型和默认模型，移除不可用或重复模型。";
      if (preferences.available && !preferences.ready)
        return "网关草稿未能安全读取，请先重试读取。";
      if (credentialSource === "stored")
        return credentials.validate(credentialId, selectedAliases);
      if (credentialSource === "manual" && !clientKey.trim())
        return "请填写 Gateway 客户端 Key；手动原文不会被记住。";
      if (!keyMatchesSelection)
        return "所选 Key 不包含全部模型权限，请更换 Key。";
      if (
        credentialSource === "current" &&
        !clientKey.trim() &&
        !status.credentialConfigured
      )
        return "请填写 Gateway 客户端 Key，或创建专用 Key。";
    }
    return "";
  }
  async function beginEnable(selection: CodexSelection) {
    if (busy || mutationInFlight.current) return;
    const issue = validation(selection.mode);
    if (issue) {
      setError(issue);
      return;
    }
    const id = ++sequence.current;
    pendingSelection.current = selection;
    setError("");
    setMessage("");
    setPreview(null);
    setBusy("preview");
    try {
      await preferences.flush();
      if (!mounted.current || id !== sequence.current) return;
      if (selection.mode === "gateway" && !preferences.canUseDraft()) {
        pendingSelection.current = null;
        setError("网关草稿尚未安全记住，请重试读取草稿后再启用。");
        return;
      }
      const value = await controls!.previewCodexConfig(selection);
      if (mounted.current && id === sequence.current) {
        setPreview(value);
        setConfirmation("apply");
      }
    } catch (caught) {
      if (mounted.current && id === sequence.current) {
        pendingSelection.current = null;
        setError(
          "预览失败：" + codexErrorMessage(caught, "请刷新配置和方案后重试。"),
        );
      }
    } finally {
      if (mounted.current && id === sequence.current) setBusy(null);
    }
  }
  async function confirmAction() {
    if (!controls || busy || !confirmation || mutationInFlight.current)
      return false;
    const action = confirmation;
    const selected = pendingSelection.current;
    if (
      action === "apply" &&
      (!preview || !selected || validation(selected.mode))
    ) {
      setError(selected ? validation(selected.mode) : "请重新预览配置。");
      return false;
    }
    if (
      action === "create" &&
      (!gatewayReady || !validModels || !defaultWorkspaceClient.createClientKey)
    )
      return false;
    if (action === "restore" && !status?.backup) return false;
    const aliases = [...selectedAliases];
    const applyInput =
      action === "apply"
        ? {
            ...selected!,
            expectedRevision: preview!.revision,
            ...(selected!.mode === "gateway" && credentialSource === "stored"
              ? { credentialId }
              : selected!.mode === "gateway" &&
                  clientKey.trim() &&
                  (credentialSource === "manual" || !preferences.available)
                ? { clientKey: clientKey.trim() }
                : {}),
          }
        : undefined;
    const restoreInput =
      action === "restore"
        ? { backupId: status!.backup!.id, expectedRevision: status!.revision }
        : undefined;
    sequence.current += 1;
    const id = ++mutationSequence.current;
    mutationInFlight.current = true;
    setError("");
    setMessage("");
    setBusy(action);
    try {
      if (action === "create") {
        const result = await defaultWorkspaceClient.createClientKey!(
          "Codex · " + aliases.length + " 个模型",
          aliases,
        );
        if (!result.key || typeof result.key !== "string")
          throw new Error("Invalid key");
        if (mounted.current && id === mutationSequence.current) {
          if (credentials.available) {
            const list = await credentials.refresh();
            const created = list?.credentials.find(
              (item) =>
                item.id === result.id && item.enabled && item.secretAvailable,
            );
            preferences.change({
              routeIds: [...routeIds],
              defaultRouteId,
              credentialSource: "stored",
              credentialId: result.id,
            });
            setClientKey("");
            setKeyScope(null);
            if (!created) {
              setPreview(null);
              setMessage(
                "专用 Key 已创建，但凭证列表尚未确认。请刷新凭证后再启用，或到接入凭证页面管理。",
              );
              return true;
            }
          } else {
            setClientKey(result.key);
            setKeyScope(aliases);
          }
          setPreview(null);
          setMessage(
            "专用 Key 已创建并选中，仅允许访问 " +
              aliases.join("、") +
              "。离开前请应用或到接入凭证页面撤销。",
          );
        }
      } else {
        const next =
          action === "apply"
            ? await controls.applyCodexConfig(applyInput!)
            : await controls.restoreCodexConfig(restoreInput!);
        if (mounted.current && id === mutationSequence.current) {
          if (action === "restore" && !preferences.available)
            touched.current = false;
          if (action === "apply" && selected?.mode === "gateway")
            preferences.markApplied();
          setStatus(next);
          setPreview(null);
          pendingSelection.current = null;
          setClientKey("");
          setKeyScope(null);
          setMessage(
            action === "restore"
              ? "已恢复备份。请重启 Codex 并开启新会话确认。"
              : selected!.mode === "direct"
                ? "直连配置已启用。请重启 Codex 并开启新会话确认。"
                : "网关配置已保存并启用。请重启 Codex 并开启新会话确认。",
          );
        }
      }
      return true;
    } catch (caught) {
      if (mounted.current && id === mutationSequence.current) {
        setPreview(null);
        pendingSelection.current = null;
        setError(
          (action === "apply"
            ? "启用失败："
            : action === "restore"
              ? "恢复失败："
              : "创建 Key 失败：") +
            codexErrorMessage(caught, "操作未完成，请刷新后重试。"),
        );
      }
      return false;
    } finally {
      if (id === mutationSequence.current) {
        mutationInFlight.current = false;
        if (mounted.current) {
          setBusy(null);
          setConfirmation(null);
        }
      }
    }
  }
  return {
    available,
    status,
    preview,
    routeIds,
    defaultRouteId,
    clientKey,
    keyScope,
    selectedAliases,
    validModels,
    gatewayValidationError: validation("gateway"),
    keyMatchesSelection,
    preferences,
    credentials,
    credentialSource,
    credentialId,
    busy,
    confirmation,
    error: error || statusError,
    message,
    invalidate,
    refreshStatus,
    beginEnable,
    gatewaySelection,
    confirmAction,
    setConfirmation,
    reportError(value: string) {
      setError(value);
    },
    changeModels(ids: string[]) {
      touched.current = true;
      invalidate();
      const unique = [...new Set(ids)].slice(0, 100);
      const nextDefault = unique.includes(defaultRouteId)
        ? defaultRouteId
        : unique[0] || "";
      if (preferences.available)
        preferences.change({
          ...preferences.draft,
          routeIds: unique,
          defaultRouteId: nextDefault,
        });
      else {
        setFallbackRoutes(unique);
        setFallbackDefault(nextDefault);
      }
    },
    changeDefault(id: string) {
      if (routeIds.includes(id)) {
        touched.current = true;
        invalidate();
        if (preferences.available)
          preferences.change({ ...preferences.draft, defaultRouteId: id });
        else setFallbackDefault(id);
      }
    },
    changeClientKey(value: string) {
      invalidate();
      setClientKey(value);
      setKeyScope(null);
    },
    changeCredential(source: "current" | "stored" | "manual", id?: string) {
      invalidate();
      setClientKey("");
      setKeyScope(null);
      preferences.change({
        routeIds: [...routeIds],
        defaultRouteId,
        credentialSource: source,
        ...(source === "stored" ? { credentialId: id } : {}),
      });
    },
  };
}
