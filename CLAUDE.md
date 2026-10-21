# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`ado-board-agentic-assistant` (display name "ADO Board Item Agentic Yeoman"): a private Azure DevOps extension (TypeScript, `azure-devops-extension-sdk` / `azure-devops-extension-api`, React for the form panel). It reacts to State changes on release Issues (`professional-X.Y.Z`) on the `dflat-websites` board and drives the `professional` repo: Doing creates the release branch and the next Issue; Done checks Tasks, opens/approves/completes the PR, attaches a `.patch`, and comments a commit ↔ Task summary. The design and build plan is in `board-release-plan.md`; user-facing docs are in `docs/`.

## Commands

```sh
npm install
npm run typecheck   # tsc --noEmit over src/
npm run build       # build.mjs: esbuild bundles each entry into dist/<name>.js + dist/<name>.html
npm run package     # build + tfx extension create → out/*.vsix (no publish)
npm run publish     # build + tfx publish, shared with dflat-websites; needs $ADO_MARKETPLACE_PAT
```

There are no automated tests. `npm run typecheck` and `npm run build` are the local checks; end-to-end verification means publishing a new version and running a release on the board (see `docs/development.md`). The Marketplace publisher is `dflatdeveloper` (`publisher` in `vss-extension.json`). Before publishing, bump `version` in `vss-extension.json` — the Marketplace rejects reused versions. Changing `scopes` forces an org admin to re-authorize the extension.

## Architecture

Everything runs in the user's browser inside the ADO web UI, and every REST call is made **as the signed-in user** — that's what makes setting an Issue to Done the user's own approval (PR vote, merge). No service accounts or Build Service permissions.

- `src/release.ts` — all Boards/Repos logic: `startRelease` / `approveRelease`, naming helpers (`parseVersion`, `issueTitle`, `branchName`, `nextVersion`), and the constants (`REPOSITORY`, `TARGET_BRANCH`, `TITLE_PATTERN`, `APPROVE_VOTE`, …). It takes a `ReleaseContext` (project, userId, REST clients) and **must not import the extension SDK**, so a planned webhook-pipeline backstop can reuse it with token-built clients. Actions return `ActionResult { ok, message }`; the caller toasts `message`, the action writes the longer record as an Issue comment. Both actions are idempotent (existing branch/next Issue/open PR are reused). Failed approval checks call `reopen()`, which moves the Issue back to Doing with a comment.
- `src/host.ts` — the only bridge from the SDK to `release.ts`: builds `ReleaseContext` from the host page, and `toast()`.
- Entry points (each bundled separately by `build.mjs` and loaded in its own iframe, as wired in `vss-extension.json`):
  - `observer.ts` — work-item-notifications contribution; tracks each form's last-known State and, on `onSaved`, runs the Doing/Done action if an Issue's State changed.
  - `actions.ts` — "Start release" / "Approve release" menu actions. Needed because board drag-and-drop doesn't open the form, so the observer never sees it. They set `System.State` via REST (which doesn't fire the form's `onSaved`, so no double run), then call the action.
  - `release-group.tsx` — React "Release" group on the Issue form showing branch, PR, patch attachments, Build runs on `master` for the PR's merge commit, and the newest `verify-deploy` comment.

Adding a new entry point means updating the `entries` list in `build.mjs` and a contribution in `vss-extension.json`.

## Conventions

- Board/Repos logic goes in `release.ts`; SDK and UI code stays in the entry points and `host.ts`.
- `release-group.tsx` hardcodes the `professional` repo name in its web links — keep it in step with `REPOSITORY`.
- `docs/` is mirrored to the project wiki. When behavior, messages, constants, or naming change, update the matching page (`release-workflow.md`, `configuration.md`'s constant table, `troubleshooting.md`'s message table).
- Work goes on a branch and reaches `master` through a PR. This repo lives in a separate org/project (`dflatdeveloper/board-agent-assistant`) from the website so its pushes never trigger the website's Build.
