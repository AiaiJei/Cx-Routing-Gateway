# README and screenshot refresh — 2026-11-26

## Scope

- Refresh the public README introduction, release links, capability summary, and screenshots.
- Capture the current 1.1.10 renderer using the repository's read-only browser preview and fixture data.
- Do not use live Gateway configuration, account credentials, or upstream provider requests.

## Screenshots

| Asset | Page | Source state |
| --- | --- | --- |
| `screenshots/overview-current.png` | Overview | Read-only browser preview; synthetic fixture calls and statuses |
| `screenshots/routes-current.png` | Model routes | Read-only browser preview; synthetic upstreams and routes |
| `screenshots/codex-current.png` | Codex access | Browser preview; local configuration and account are not read |

Captured from the task worktree preview at 1440 × 1000. The README labels these as preview images and explicitly distinguishes fixture data from live runtime state.

## Verification

- Desktop production build: `npm --prefix apps/desktop run build` — PASS.
- Screenshot assets: present and manually inspected.
- README relative image links: all resolve in the task worktree.
- Diff whitespace check: `git diff --check` — PASS.
- Live provider/account acceptance: NOT_RUN; not required for documentation screenshots.
