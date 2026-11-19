import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CredentialsPage } from "./CredentialsPage";
import "../styles/app.css";

describe("CredentialsPage", () => {
  it("keeps its header action label on one line", () => {
    render(<CredentialsPage />);
    expect(getComputedStyle(screen.getByRole("button", { name: "演示创建凭证" })).whiteSpace).toBe("nowrap");
  });

  it("only displays masked examples and labels local actions as demonstrations", async () => {
    const user = userEvent.setup();
    render(<CredentialsPage />);
    expect(await screen.findByText("cxg_demo_••••••••••••7a2f")).toBeVisible();
    expect(screen.getByText("密钥创建、轮换和撤销尚未接入本机运行时。此页仅展示界面。" )).toBeVisible();
    await user.click(screen.getByRole("button", { name: "演示创建凭证" }));
    expect(screen.getByRole("status")).toHaveTextContent("未生成或保存密钥");
  });
});
