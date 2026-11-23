import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import type { CallLog } from "../domain/types";
import { RequestDuration, RequestStatus } from "./RequestLogCells";

const log: CallLog = {
  id: "req-timing",
  time: "2026-11-21T08:00:00.000Z",
  model: "reasoner",
  credential: "已脱敏",
  upstream: "Primary",
  direction: "Chat → Chat → Chat",
  status: "成功",
  durationMs: 100,
  stream: true,
  firstTokenMs: 25,
};

it("explains first-content and full-request timing from the keyboard", async () => {
  const user = userEvent.setup();
  render(<RequestDuration log={log} />);
  await user.tab();
  expect(screen.getByRole("button", { name: /请求耗时/ })).toHaveFocus();
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("首字");
  expect(tooltip).toHaveTextContent("首个有效生成内容");
  expect(tooltip).toHaveTextContent("总耗时");
  expect(tooltip).toHaveTextContent("响应完成或失败");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it.each([
  ["upstream_body", "失败 · 流已中断", "读取上游响应体时"],
  ["downstream_closed", "失败 · 流已中断", "下游客户端已断开"],
  ["upstream_headers", "失败", "收到上游响应头前"],
] as const)("explains %s without marking a failed stream successful", async (phase, label, explanation) => {
  const user = userEvent.setup();
  const failedLog = { ...log, status: "失败" as const, upstreamStatus: phase === "upstream_headers" ? undefined : 200, gatewayStatus: phase === "upstream_headers" ? 502 : 200, streamFailurePhase: phase };
  render(<RequestStatus log={failedLog} />);
  expect(screen.getByText(label)).toHaveClass("status-negative");
  expect(screen.queryByText("成功")).not.toBeInTheDocument();
  await user.tab();
  expect(screen.getByRole("button", { name: /状态/ })).toHaveFocus();
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent(explanation);
  expect(tooltip).toHaveTextContent(phase === "upstream_headers" ? "下游 HTTP 502" : "下游 HTTP 200");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});

it("preserves a legacy failed 502 record without inventing an upstream status or failure phase", async () => {
  const user = userEvent.setup();
  render(<RequestStatus log={{ ...log, status: "失败", gatewayStatus: 502 }} />);
  expect(screen.getByText("失败")).toHaveClass("status-negative");
  expect(screen.queryByText(/流已中断/)).not.toBeInTheDocument();
  await user.tab();
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("网关 HTTP 502");
  expect(tooltip).not.toHaveTextContent("上游 HTTP");
  expect(tooltip).not.toHaveTextContent("失败阶段");
});

it("keeps a completed stream successful without an interruption warning", async () => {
  const user = userEvent.setup();
  render(<RequestStatus log={{ ...log, httpStatus: 200 }} />);
  expect(screen.getByText("成功")).toHaveClass("status-positive");
  await user.tab();
  expect(screen.getByRole("tooltip")).toHaveTextContent("HTTP 200");
  expect(screen.getByRole("tooltip")).not.toHaveTextContent("流已中断");
});

it("does not infer a partial downstream stream from upstream headers followed by a wire 502", async () => {
  const user = userEvent.setup();
  render(<RequestStatus log={{ ...log, status: "失败", upstreamStatus: 200, gatewayStatus: 502, streamFailurePhase: "upstream_body", firstTokenMs: undefined }} />);
  expect(screen.getByRole("button", { name: /状态/ })).toHaveTextContent(/^失败$/);
  await user.tab();
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("上游 HTTP 200");
  expect(tooltip).toHaveTextContent("下游 HTTP 502");
  expect(tooltip).not.toHaveTextContent(/流已中断|HTTP 200 不代表流完整完成/);
});

it("uses the actual downstream 201 in a partial-stream clarification", async () => {
  const user = userEvent.setup();
  render(<RequestStatus log={{ ...log, status: "失败", upstreamStatus: 201, gatewayStatus: 201, streamFailurePhase: "upstream_body" }} />);
  expect(screen.getByRole("button", { name: /状态/ })).toHaveTextContent("失败 · 流已中断");
  await user.tab();
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("下游 HTTP 201");
  expect(tooltip).toHaveTextContent("HTTP 201 不代表流完整完成");
  expect(tooltip).not.toHaveTextContent("HTTP 200");
});
