import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { CodexPage } from "./CodexPage";

describe("CodexPage", () => {
  it("explains the planned integration and links to existing gateway management", () => {
    render(<MemoryRouter><CodexPage /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "Codex 路由与管理" })).toBeVisible();
    expect(screen.getByText("规划中")).toBeVisible();
    expect(screen.getByText(/CLI.*Desktop.*配置同步.*尚未实现/)).toBeVisible();
    expect(screen.getByRole("link", { name: "模型路由" })).toHaveAttribute("href", "/routes");
    expect(screen.getByRole("link", { name: "上游服务" })).toHaveAttribute("href", "/upstreams");
    expect(screen.getByRole("link", { name: "接入凭证" })).toHaveAttribute("href", "/credentials");
  });

  it("does not reveal credential values or offer config write or sync controls", () => {
    render(<MemoryRouter><CodexPage /></MemoryRouter>);

    expect(screen.queryByLabelText(/凭证|令牌|密钥/)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /写入|同步|保存/ })).not.toBeInTheDocument();
  });
});
