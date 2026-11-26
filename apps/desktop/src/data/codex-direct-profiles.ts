import { useCallback, useEffect, useRef, useState } from "react";
import { codexErrorMessage, getCodexProfilesControls } from "./codex-client";
import type {
  CodexDirectProfileInput,
  CodexDirectProfiles,
  CodexStatus,
} from "../domain/codex-management";
export function useCodexDirectProfiles(status: CodexStatus | null) {
  const available = !!getCodexProfilesControls();
  const [library, setLibrary] = useState<CodexDirectProfiles | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  const request = useRef(0);
  const mutating = useRef(false);
  const touched = useRef(false);
  const refresh = useCallback(async () => {
    const controls = getCodexProfilesControls();
    if (!controls || mutating.current) return;
    const id = ++request.current;
    setBusy(true);
    setError("");
    try {
      const value = await controls.getCodexDirectProfiles();
      if (mounted.current && id === request.current) setLibrary(value);
    } catch (caught) {
      if (mounted.current && id === request.current) {
        setLibrary(null);
        setError(
          "直连方案读取失败：" +
            codexErrorMessage(caught, "请刷新方案后重试。"),
        );
      }
    } finally {
      if (mounted.current && id === request.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (available) void refresh();
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [available, refresh]);
  useEffect(() => {
    if (!status || !library || touched.current) return;
    if (status.mode === "direct")
      setSelectedId(
        status.direct?.profileId ||
          (status.direct?.kind === "official" ? "official" : ""),
      );
    else if (status.mode === "gateway")
      setSelectedId(library.lastDirectProfileId || "");
  }, [status, library]);
  async function mutate(
    action: "save" | "import" | "duplicate" | "delete",
    input?: Omit<CodexDirectProfileInput, "expectedRevision"> | string,
  ) {
    const controls = getCodexProfilesControls();
    if (!controls || !library || busy || mutating.current) return false;
    const id = ++request.current;
    mutating.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let next: CodexDirectProfiles;
      if (action === "save")
        next = await controls.saveCodexDirectProfile({
          ...(input as Omit<CodexDirectProfileInput, "expectedRevision">),
          expectedRevision: library.revision,
        });
      else if (action === "import") {
        if (!status) throw new Error("No config");
        next = await controls.importCodexDirectProfile({
          expectedRevision: library.revision,
          expectedConfigRevision: status.revision,
        });
      } else if (action === "duplicate")
        next = await controls.duplicateCodexDirectProfile({
          expectedRevision: library.revision,
          id: input as string,
        });
      else
        next = await controls.deleteCodexDirectProfile({
          expectedRevision: library.revision,
          id: input as string,
        });
      if (mounted.current && request.current === id) {
        setLibrary(next);
        touched.current = true;
        const newProfile = next.profiles.find(
          (profile) => !library.profiles.some((old) => old.id === profile.id),
        );
        if (action === "import")
          setSelectedId(
            newProfile?.id ||
              next.profiles.find((profile) => profile.active)?.id ||
              next.lastDirectProfileId ||
              "",
          );
        else if (action === "save")
          setSelectedId(
            (input as CodexDirectProfileInput).id ||
              newProfile?.id ||
              selectedId,
          );
        else if (action === "duplicate" && newProfile)
          setSelectedId(newProfile.id);
        else if (action === "delete" && selectedId === input) setSelectedId("");
        setMessage(
          action === "import"
            ? "当前配置已保存为直连方案，未切换当前接入。"
            : action === "save"
              ? "方案已保存，未启用。请点击启用所选直连方案。"
              : action === "duplicate"
                ? "方案已复制，未启用。"
                : "方案已删除，当前配置未改变。",
        );
      }
      return true;
    } catch (caught) {
      if (mounted.current && request.current === id)
        setError(
          "方案操作失败：" +
            codexErrorMessage(caught, "操作未完成，请刷新方案后重试。"),
        );
      return false;
    } finally {
      if (request.current === id) {
        mutating.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }
  return {
    available,
    library,
    selectedId,
    busy,
    error,
    message,
    refresh,
    mutate,
    select(id: string) {
      touched.current = true;
      setSelectedId(id);
      setMessage("");
      setError("");
    },
  };
}
