# Architecture

The extension runs in your browser, inside the Azure DevOps web UI. Every REST call it makes is made as **you**, the signed-in user. That's why setting an Issue to Done counts as your approval: the branch, the PR, the approval vote and the merge are all yours. No Build Service permissions or service accounts are involved.

## Contributions

Declared in [`vss-extension.json`](../vss-extension.json):

| Contribution | Type | Where it appears | Page |
|---|---|---|---|
| `release-observer` | `ms.vss-work-web.work-item-notifications` | Every work item form (hidden) | `dist/observer.html` |
| `start-release` | `ms.vss-web.action` | Card and backlog context menu, form toolbar menu | `dist/actions.html` |
| `approve-release` | `ms.vss-web.action` | Card and backlog context menu, form toolbar menu | `dist/actions.html` |
| `release-group` | `ms.vss-work-web.work-item-form-group` | A **Release** group on every work item form | `dist/release-group.html` |

The extension asks for the scopes `vso.work_write`, `vso.code_write` and `vso.build`.

## Source files

```
src/
  release.ts         The Doing and Done actions and the release naming rules. No SDK code.
  host.ts            Builds a ReleaseContext from the extension host; shows toasts.
  observer.ts        Form observer: runs an action when a saved Issue's State changed.
  actions.ts         Menu actions: set the State through REST, then run the action.
  release-group.tsx  React panel that shows the release on the Issue form.
build.mjs            Bundles each entry point with esbuild and writes its HTML page.
```

### `release.ts`: the shared logic

`startRelease(ctx, id)` and `approveRelease(ctx, id)` hold everything the extension does to Boards and Repos. They take a `ReleaseContext`:

```ts
interface ReleaseContext {
  project: string;                   // team project name
  userId: string;                    // the acting user's id, used for the PR vote and auto-complete
  work: WorkItemTrackingRestClient;
  git: GitRestClient;
}
```

Because nothing in `release.ts` imports the extension SDK, the same functions can later run from a webhook pipeline (the planned backstop for changes the extension never sees), given REST clients built from a token instead of the browser session.

Both actions return an `ActionResult` (`{ ok, message }`). The caller shows `message` as a toast; the action itself writes the longer record as an Issue comment.

The naming helpers are exported for the Release group:

| Function | `professional-0.2.0` gives |
|---|---|
| `parseVersion(title)` | `{ major: 0, minor: 2, patch: 0 }` |
| `issueTitle(v)` | `professional-0.2.0` |
| `branchName(v)` | `professional-0-2-0` |
| `nextVersion(v)` | `{ major: 0, minor: 2, patch: 1 }` |

### `observer.ts`: catching State changes on the form

The observer keeps the State each open form had when it loaded, refreshed, reset or last saved. On `onSaved` it compares the saved State with that value. If an Issue's State changed to Doing or Done, it runs `startRelease` or `approveRelease`, shows the result as a toast and refreshes the form so the new comment and relations appear.

### `actions.ts`: the menu actions

Each menu action needs exactly one selected work item, checks it's an Issue, sets `System.State` through REST, and runs the action. A State change made through REST doesn't fire the form's `onSaved`, so the observer doesn't run the action a second time.

### `release-group.tsx`: the form panel

On load, save and refresh, the panel reads the Issue with its relations, then looks up the branch, the PR, the `.patch` attachments, the Build runs on `master` whose source version is the PR's merge commit, and the newest comment mentioning `verify-deploy`.

## Flow

```
             form save (State changed)             card / toolbar menu
                       │                                    │
                 observer.ts                           actions.ts
                       │                        set State through REST
                       └──────────────┬─────────────────────┘
                                      ▼
                    release.ts  startRelease / approveRelease
                                      │  as the signed-in user
                      ┌───────────────┼────────────────┐
                      ▼               ▼                ▼
                 Repos: branch,   Boards: next     Boards: comment,
                 PR, vote, merge  Issue, State     patch attachment
                      │
                      ▼
              merge into master → Build → Deploy
```

## Where things live

- **This repo**: `dflatdeveloper/board-agent-assistant`, a separate org and project from the website, so pushes here never start the website's Build.
- **The board and the website repo**: the `dflat-websites` org, where the extension is shared and installed.
