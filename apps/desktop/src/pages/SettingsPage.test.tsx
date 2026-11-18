import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("identifies runtime-dependent settings as unavailable and read-only", async () => {
    render(<SettingsPage />);
    expect(await screen.findByText("运行时未接入，以下配置尚不可更改。" )).toBeVisible();
    expect(screen.getByLabelText("Gateway 监听地址")).toHaveValue("127.0.0.1");
    expect(screen.getByLabelText("Gateway 监听地址")).toBeDisabled();
  });
});
