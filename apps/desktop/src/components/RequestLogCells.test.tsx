import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import type { CallLog } from "../domain/types";
import { RequestDuration } from "./RequestLogCells";

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
