import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CodexDirectProfileForm } from "./CodexDirectProfileForm";
const profile = {
  id: "one",
  kind: "custom" as const,
  name: "测试方案",
  baseUrl: "https://example.test/v1",
  models: ["one", "two"],
  defaultModel: "one",
  credentialConfigured: true,
  editable: true,
  active: false,
};
describe("Codex direct profile form submission", () => {
  it("submits once for synchronous repeated submit events and stays locked through the whole async save callback", async () => {
    let finish!: (value: boolean) => void;
    const save = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          finish = done;
        }),
    );
    const close = vi.fn();
    render(
      <CodexDirectProfileForm
        profile={profile}
        busy={false}
        onSave={save}
        onClose={close}
      />,
    );
    const form = screen.getByRole("dialog").querySelector("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "关闭弹窗" })).toBeDisabled();
    for (const label of [
      "方案名称",
      "Responses API 地址",
      "供应商 API Key",
      "模型列表（每行一个）",
    ])
      expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "默认模型" })).toBeDisabled();
    await userEvent.setup().keyboard("{Escape}");
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish(true));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("releases the full submission lock after false or rejected saves and keeps the draft for retry", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("raw-api-key"))
      .mockResolvedValueOnce(true);
    const close = vi.fn();
    const user = userEvent.setup();
    render(
      <CodexDirectProfileForm
        profile={profile}
        busy={false}
        onSave={save}
        onClose={close}
      />,
    );
    await user.type(
      screen.getByLabelText("供应商 API Key"),
      "private-draft-key",
    );
    await user.click(screen.getByRole("button", { name: "保存方案" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存方案" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("供应商 API Key")).toHaveValue(
      "private-draft-key",
    );
    await user.click(screen.getByRole("button", { name: "保存方案" }));
    expect(
      await within(screen.getByRole("dialog")).findByRole("alert"),
    ).toHaveTextContent(/保存未完成/);
    expect(screen.queryByText(/raw-api-key/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("方案名称")).toHaveValue(profile.name);
    expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "保存方案" }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledTimes(3);
  });
});
