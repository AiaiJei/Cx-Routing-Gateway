import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { AppShell } from "./AppShell";
import { RuntimeIndicator } from "./RuntimeIndicator";
const original = window.desktopControls;
afterEach(() => { window.desktopControls = original; vi.useRealTimers(); });

it("shows preview without IPC and real running state in the app shell", async () => {
  window.desktopControls = undefined;
  const preview = render(<RuntimeIndicator />);
  expect(screen.getByRole("status")).toHaveTextContent("浏览器预览");
  preview.unmount();
  window.desktopControls = { getStatus: async () => ({ state: "running" }) } as Window["desktopControls"];
  render(<MemoryRouter><AppShell><h1>总览</h1></AppShell></MemoryRouter>);
  expect(await screen.findByText("Gateway 运行中")).toBeVisible();
  expect(screen.queryByText("运行时未接入")).not.toBeInTheDocument();
});

it("refreshes after a failure and stops polling on unmount", async () => {
  vi.useFakeTimers();
  const getStatus = vi.fn().mockResolvedValueOnce({ state: "running" }).mockRejectedValueOnce(new Error("disconnected")).mockResolvedValue({ state: "failed" });
  window.desktopControls = { getStatus } as unknown as Window["desktopControls"];
  const view = render(<RuntimeIndicator />);
  await act(async () => {});
  expect(screen.getByRole("status")).toHaveTextContent("Gateway 运行中");
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByRole("status")).toHaveTextContent("无法获取 Gateway 状态");
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByRole("status")).toHaveTextContent("Gateway 运行异常");
  view.unmount();
  await vi.advanceTimersByTimeAsync(6000);
  expect(getStatus).toHaveBeenCalledTimes(3);
});
