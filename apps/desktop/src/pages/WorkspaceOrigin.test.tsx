import { Profiler } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutesPage } from "./RoutesPage";
import { UpstreamsPage } from "./UpstreamsPage";
import { CredentialsPage } from "./CredentialsPage";
import { defaultWorkspaceClient } from "../data/workspace-client";
import { workspaceFixtures } from "../data/fixtures";

afterEach(() => vi.restoreAllMocks());

describe("workspace collection origin", () => {
  it.each([
    ["routes", RoutesPage, "本机运行时路由", "northstar-large"],
    ["upstreams", UpstreamsPage, "本机运行时数据", "Northstar AI"],
    ["credentials", CredentialsPage, "本机凭证 · 仅显示脱敏预览", "cxg_demo_"],
  ] as const)("never commits fixture %s with a live source label", async (_name, Page, liveLabel, sample) => {
    vi.spyOn(defaultWorkspaceClient, "getWorkspace").mockResolvedValue({
      ...workspaceFixtures,
      meta: { source: "runtime", live: true },
      upstreams: [], routes: [], credentials: [],
    });
    const commits: string[] = [];
    render(<Profiler id="source" onRender={() => commits.push(document.body.textContent ?? "")}><Page /></Profiler>);
    await screen.findByText(liveLabel);
    const liveCommits = commits.filter(text => text.includes(liveLabel));
    expect(liveCommits.length).toBeGreaterThan(0);
    expect(liveCommits.filter(text => text.includes(sample))).toEqual([]);
  });
});
