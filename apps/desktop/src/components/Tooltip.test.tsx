import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Tooltip } from "./Tooltip";

it("keeps selectable details open when pointer focus moves into the floating panel", async () => {
  const user = userEvent.setup();
  render(<><Tooltip label="请求时间" content={<code>req-copy-this-id</code>}>时间</Tooltip><button>其他操作</button></>);
  await user.click(screen.getByRole("button", { name: "请求时间" }));
  await user.click(screen.getByText("req-copy-this-id"));
  expect(screen.getByRole("tooltip")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "请求时间" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "其他操作" })).toHaveFocus();
});

it("opens on keyboard focus, dismisses with Escape, and does not trap tab navigation", async () => {
  const user = userEvent.setup();
  render(<><Tooltip label="协议" content="Res → Chat → Res">Res</Tooltip><button>详情</button></>);
  await user.tab();
  expect(screen.getByRole("tooltip")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("tooltip")).toBeVisible();
  await user.tab();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "详情" })).toHaveFocus();
});
