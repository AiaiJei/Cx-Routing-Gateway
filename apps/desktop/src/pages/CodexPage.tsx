import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { FixtureNotice, PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { CodexStatusPanel } from "../components/CodexStatusPanel";
import { CodexTabs } from "../components/CodexTabs";
import { CodexDirectPanel } from "../components/CodexDirectPanel";
import { CodexGatewayPanel } from "../components/CodexGatewayPanel";
import { CodexConfigPanel } from "../components/CodexConfigPanel";
import { CodexConfirmDialog } from "../components/CodexConfirmDialog";
import { useWorkspace } from "../data/use-workspace";
import { isCodexRouteAvailable, useCodexManagement } from "../data/codex-management";
import { useCodexDirectProfiles } from "../data/codex-direct-profiles";
import { useCodexLogin } from "../data/codex-login";
import { defaultWorkspaceClient } from "../data/workspace-client";
import type { CodexMode } from "../domain/codex-management";
import type { ModelRoute, Upstream } from "../domain/types";
import "../styles/codex.css";
const noRoutes: ModelRoute[] = [];
const noUpstreams: Upstream[] = [];
function sameIds(left: string[], right: string[]) {
  const leftIds = [...left].sort();
  const rightIds = [...right].sort();
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  );
}
export function CodexPage() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const { data, loading, error, refreshing, refreshError } = workspace;
  const gatewayReady =
    !loading &&
    !error &&
    !refreshing &&
    !refreshError &&
    data.meta.live &&
    data.gateway.state === "运行中";
  const routes = !loading && !error && data.meta.live ? data.routes : noRoutes;
  const management = useCodexManagement(routes, gatewayReady);
  const profiles = useCodexDirectProfiles(management.status);
  const login = useCodexLogin();
  const [view, setView] = useState<CodexMode | null>(null);
  const viewed = useRef(false);
  useEffect(() => {
    if (!viewed.current && management.status) {
      setView(
        management.status.mode === "gateway"
          ? "gateway"
          : management.status.mode === "direct"
            ? "direct"
            : null,
      );
    }
  }, [management.status]);
  const previousProfile = useRef("");
  const profileSignature =
    profiles.selectedId + "|" + profiles.library?.revision;
  useEffect(() => {
    if (
      previousProfile.current !== profileSignature &&
      (management.preview ||
        management.busy === "preview" ||
        management.confirmation === "apply")
    )
      management.invalidate();
    previousProfile.current = profileSignature;
  }, [
    profileSignature,
    management.preview,
    management.busy,
    management.confirmation,
    management.invalidate,
  ]);
  const mutationBusy =
    management.busy === "apply" ||
    management.busy === "restore" ||
    management.busy === "create";
  const locked = mutationBusy || !!management.confirmation || profiles.busy;
  const activationBlocked = login.status?.login === "pending";
  const activeGatewayModelRoutes =
    management.status?.mode === "gateway" && management.status.model
      ? routes.filter(
          (route) =>
            route.alias === management.status?.model &&
            isCodexRouteAvailable(route),
        )
      : [];
  const activeGatewayRouteIds = management.status?.selectedRouteIds.length
    ? management.status.selectedRouteIds
    : activeGatewayModelRoutes.length === 1
      ? [activeGatewayModelRoutes[0].id]
      : [];
  const activeGatewayDefaultRouteId =
    management.status?.defaultRouteId &&
    activeGatewayRouteIds.includes(management.status.defaultRouteId)
      ? management.status.defaultRouteId
      : activeGatewayRouteIds[0] || "";
  const gatewayDraftChanged =
    management.status?.mode === "gateway" &&
    (!sameIds(management.routeIds, activeGatewayRouteIds) ||
      management.defaultRouteId !== activeGatewayDefaultRouteId ||
      management.preferences.dirty ||
      !!management.clientKey.trim());
  const selectedDirectProfile = profiles.library?.profiles.find(
    (profile) => profile.id === profiles.selectedId,
  );
  const selectedDirectProfileIsActive =
    management.status?.mode === "direct" &&
    !!selectedDirectProfile &&
    (selectedDirectProfile.kind === "official"
      ? management.status.direct?.kind === "official"
      : management.status.direct?.profileId === selectedDirectProfile.id);
  function changeView(mode: CodexMode) {
    viewed.current = true;
    management.invalidate();
    setView(mode);
  }
  function enableGateway() {
    if (activationBlocked) {
      management.reportError(
        "官方登录正在进行，请先完成或取消登录，再启用接入配置。",
      );
      return;
    }
    void management.beginEnable(management.gatewaySelection());
  }
  function enableDirect() {
    if (activationBlocked) {
      management.reportError(
        "官方登录正在进行，请先完成或取消登录，再启用接入配置。",
      );
      return;
    }
    if (!profiles.library) {
      management.reportError("请先读取直连方案库。");
      return;
    }
    if (!profiles.selectedId) {
      management.reportError(
        "请选择直连方案；使用当前配置请先读取当前配置并保存。",
      );
      return;
    }
    void management.beginEnable({
      mode: "direct",
      profileId: profiles.selectedId,
      profilesRevision: profiles.library.revision,
    });
  }
  let modeActionLabel = "请选择接入模式";
  let modeActionDisabled = true;
  let modeActionPrimary = false;
  let modeActionOnClick: (() => void) | undefined;
  if (!management.available) {
    modeActionLabel = "仅桌面端可操作";
  } else if (management.busy === "preview") {
    modeActionLabel = "正在准备预览…";
  } else if (management.busy === "apply") {
    modeActionLabel = "正在应用配置…";
  } else if (management.busy === "restore") {
    modeActionLabel = "正在恢复配置…";
  } else if (management.busy === "status") {
    modeActionLabel = "正在读取配置…";
  } else if (refreshing) {
    modeActionLabel = "正在刷新 Gateway…";
  } else if (profiles.busy) {
    modeActionLabel = "正在读取直连方案…";
  } else if (management.preferences.saving) {
    modeActionLabel = "正在保存网关草稿…";
  } else if (management.confirmation) {
    modeActionLabel = "等待确认…";
  } else if (activationBlocked) {
    modeActionLabel = "请先完成官方登录";
  } else if (!management.status) {
    modeActionLabel = management.error
      ? "重试读取本机配置"
      : "正在读取配置…";
    modeActionDisabled = !management.error;
    modeActionOnClick = () => void management.refreshStatus();
  } else if (!view) {
    modeActionLabel = "请选择接入模式";
  } else if (view === "gateway") {
    if (!gatewayReady) {
      modeActionLabel = error || refreshError
        ? "重试 Gateway 工作区"
        : "检查 Gateway 状态";
      modeActionOnClick = () => void workspace.refresh();
      modeActionDisabled = loading || refreshing;
    } else if (management.preferences.error) {
      modeActionLabel = "重试读取网关草稿";
      modeActionOnClick = () => void management.preferences.retry();
      modeActionDisabled = management.preferences.saving;
    } else if (
      management.preferences.available &&
      !management.preferences.ready
    ) {
      modeActionLabel = "正在读取网关草稿…";
    } else if (!management.validModels) {
      modeActionLabel = "去配置模型路由";
      modeActionDisabled = false;
      modeActionOnClick = () => navigate("/routes");
    } else if (management.gatewayValidationError) {
      if (/key|凭证|凭据/i.test(management.gatewayValidationError)) {
        modeActionLabel = "去配置接入凭证";
        modeActionDisabled = false;
        modeActionOnClick = () => navigate("/credentials");
      } else {
        modeActionLabel = "完善 Gateway 配置";
      }
    } else if (management.status.mode === "gateway") {
      if (gatewayDraftChanged) {
        modeActionLabel = "保存并重新应用";
        modeActionDisabled = false;
        modeActionPrimary = true;
        modeActionOnClick = enableGateway;
      } else {
        modeActionLabel = "Gateway 已启用";
      }
    } else {
      modeActionLabel = "保存并启用网关";
      modeActionDisabled = false;
      modeActionPrimary = true;
      modeActionOnClick = enableGateway;
    }
  } else if (!profiles.available) {
    modeActionLabel = "直连方案不可用";
  } else if (!profiles.library) {
    modeActionLabel = profiles.error ? "重试读取直连方案" : "正在读取直连方案…";
    modeActionDisabled = !profiles.error;
    modeActionOnClick = () => void profiles.refresh();
  } else if (!selectedDirectProfile) {
    modeActionLabel = "先选择直连方案";
  } else if (selectedDirectProfileIsActive) {
    modeActionLabel = "Codex 直连已启用";
  } else {
    modeActionLabel =
      management.status.mode === "gateway"
        ? "切换到 Codex 直连"
        : "启用所选直连方案";
    modeActionDisabled = false;
    modeActionPrimary = true;
    modeActionOnClick = enableDirect;
  }
  return (
    <div className="page-content codex-page">
      <PageHeader
        title="Codex"
        description="管理官方或第三方直连供应商，或通过 CX-RG 网关使用模型。"
        action={
          <div className="codex-header-actions">
            <Button
              variant={modeActionPrimary ? "primary" : "secondary"}
              disabled={modeActionDisabled}
              onClick={modeActionOnClick}
            >
              {modeActionLabel}
            </Button>
            <Button
              disabled={
                !management.available ||
                !!management.busy ||
                profiles.busy ||
                !!management.confirmation ||
                refreshing
              }
              onClick={() => {
                workspace.refresh();
                void management.refreshStatus();
                void profiles.refresh();
                void management.credentials.refresh();
              }}
            >
              刷新状态
            </Button>
          </div>
        }
      />
      <FixtureNotice live={management.available}>
        {management.available
          ? "本机配置 · 标签选择接入模式，页面按钮应用；启用前确认"
          : "浏览器预览 · 不读取本机配置或账户，不能保存或启用。"}
      </FixtureNotice>
      <CodexTabs
        value={view}
        activeMode={management.status?.mode}
        onChange={changeView}
        disabled={locked || !!management.busy || refreshing}
      />
      {(management.busy === "preview" || mutationBusy) && (
        <p role="status" className="codex-feedback">
          {management.busy === "preview"
            ? "正在准备接入配置，请稍候…"
            : "正在更新接入配置，请稍候…"}
        </p>
      )}
      <CodexStatusPanel
        status={management.status}
        available={management.available}
        loading={management.busy === "status"}
      />
      {management.error && (
        <p role="alert" className="codex-feedback codex-feedback-error">
          {management.error}
        </p>
      )}
      {management.message && (
        <p role="status" className="codex-feedback">
          {management.message}
        </p>
      )}
      {activationBlocked && (
        <p className="codex-model-notice">
          官方登录正在进行。方案仍可保存；启用或恢复接入前请先完成或取消本次登录。
        </p>
      )}
      {!view && (
        <p className="codex-model-notice">
          {management.busy === "status"
            ? "正在识别当前接入…"
            : "当前接入无法识别，请选择直连或网关并检查设置。"}
          切换到目标模式后可确认启用。
        </p>
      )}
      <div
        role="tabpanel"
        id="codex-panel-direct"
        aria-labelledby="codex-tab-direct"
        hidden={view !== "direct"}
      >
        <CodexDirectPanel
          profiles={profiles}
          status={management.status}
          login={login}
          locked={mutationBusy || !!management.confirmation}
          nativeAvailable={management.available}
          progress={management.busy === "preview"}
          onLibraryChanged={management.refreshStatus}
        />
      </div>
      <div
        role="tabpanel"
        id="codex-panel-gateway"
        aria-labelledby="codex-tab-gateway"
        hidden={view !== "gateway"}
      >
        {(error || refreshError) && (
          <p className="codex-model-notice">
            Gateway 工作区读取失败，直连方案和配置恢复仍可使用。
            <Button
              size="small"
              disabled={refreshing || locked}
              onClick={workspace.refresh}
            >
              重试 Gateway 工作区
            </Button>
          </p>
        )}
        <CodexGatewayPanel
          management={management}
          routes={routes}
          upstreams={
            data.meta.live && !loading && !error ? data.upstreams : noUpstreams
          }
          ready={gatewayReady}
          loading={loading}
          locked={locked}
          canCreate={
            management.available &&
            !!management.status &&
            gatewayReady &&
            management.validModels &&
            !!defaultWorkspaceClient.createClientKey &&
            !management.busy
          }
        />
      </div>
      <CodexConfigPanel
        management={management}
        blocked={profiles.busy || activationBlocked}
      />
      <CodexConfirmDialog
        management={management}
        blocked={profiles.busy || activationBlocked}
        onConfigChanged={() => {
          void profiles.refresh();
          void management.credentials.refresh();
        }}
      />
      <footer className="codex-footer">
        <p>
          启用只更新配置。请重启 Codex
          并开启新会话确认；环境变量、项目配置和启动参数可能覆盖此处设置。
        </p>
        <nav className="codex-management-links" aria-label="Gateway 管理页面">
          <Link to="/routes">模型路由</Link>
          <Link to="/upstreams">上游服务</Link>
          <Link to="/credentials">接入凭证</Link>
        </nav>
      </footer>
    </div>
  );
}
