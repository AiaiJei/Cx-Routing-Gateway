import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceFixtures } from "../data/fixtures";
import { OverviewRuntimePanel } from "./OverviewRuntimePanel";

afterEach(() => vi.unstubAllGlobals());

describe("OverviewRuntimePanel", () => {
  it("copies only the displayed gateway address and confirms completion", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<MemoryRouter><OverviewRuntimePanel data={workspaceFixtures} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "复制本机接入地址" }));
    expect(await screen.findByText("已复制")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("接入地址已复制");
    expect(writeText).toHaveBeenCalledWith("http://127.0.0.1:8317");
  });
  it("shows clipboard failure without claiming success", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<MemoryRouter><OverviewRuntimePanel data={workspaceFixtures} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "复制本机接入地址" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("复制失败");
    expect(screen.queryByText("已复制")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制本机接入地址" })).toBeEnabled();
  });
  it("disables repeated copies while the browser operation is pending", async () => {
    let finish!: () => void;
    const operation = new Promise<void>(resolve => { finish = resolve; });
    const writeText = vi.fn(() => operation);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<MemoryRouter><OverviewRuntimePanel data={workspaceFixtures} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "复制本机接入地址" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("复制中…");
    expect(screen.getByRole("status")).toHaveTextContent("正在复制接入地址");
    expect(writeText).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await operation; });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("已复制");
  });
});
