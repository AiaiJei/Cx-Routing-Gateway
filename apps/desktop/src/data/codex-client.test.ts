import { afterEach, describe, expect, it } from "vitest";
import { codexErrorMessage, getCodexControls } from "./codex-client";

const original = window.desktopControls;
afterEach(() => { window.desktopControls = original; });

describe("Codex native boundary", () => {
  it("requires all four native methods before making the feature available", () => {
    window.desktopControls = { getCodexStatus: async () => undefined } as unknown as NonNullable<typeof window.desktopControls>;
    expect(getCodexControls()).toBeUndefined();
  });

  it("maps a stable Electron error code but never echoes raw messages", () => {
    expect(codexErrorMessage(new Error("Error invoking runtime: CODEX_CONFIG_CHANGED: secret-body"), "fallback")).toMatch(/配置已被其他程序修改/);
    expect(codexErrorMessage({ code: "CODEX_KEY_REJECTED", message: "secret-key" }, "fallback")).toMatch(/客户端 Key 无效/);
    expect(codexErrorMessage(new Error("parser secret-key"), "fallback")).toBe("fallback");
    expect(codexErrorMessage(new Error("CODEX_UNKNOWN: secret-key"), "fallback")).toBe("fallback");
  });
});
