# Development

## Prerequisites

- Node.js 20 or later and npm.
- For publishing: a Visual Studio Marketplace publisher and a personal access token with the **Marketplace (publish)** scope.

## Install

```sh
npm install
```

`tfx-cli` is a dev dependency, so `npx tfx` and the npm scripts use the pinned version.

## Scripts

| Command | What it does |
|---|---|
| `npm run typecheck` | Type-checks `src/` with `tsc --noEmit` |
| `npm run build` | Runs `build.mjs`: bundles `observer`, `actions` and `release-group` into `dist/*.js` and writes a `dist/<name>.html` page for each |
| `npm run package` | Builds, then creates the `.vsix` in `out/` without publishing |
| `npm run publish` | Builds, then publishes the extension privately and shares it with the `dflat-websites` org |

`dist/`, `out/` and `*.vsix` are git-ignored.

## Publishing

1. Check that the `publisher` field of `vss-extension.json` is the Marketplace publisher ID, `dflatdeveloper`.
2. Make the PAT available to the publish script:

   ```sh
   export ADO_MARKETPLACE_PAT=<token>
   ```

3. Bump `version` in `vss-extension.json`. The Marketplace rejects a version it has already seen.
4. Publish:

   ```sh
   npm run publish
   ```

5. The first time, an org admin installs the extension in `dflat-websites` from **Organization settings → Extensions → Shared**. Later versions update in place.

## Testing a change

There are no automated tests yet. To check a change end to end, publish a new version and run a release on the board:

1. Move a release Issue to Doing and confirm the branch and the next Issue are created.
2. Commit a Task's change to the branch with `AB#<task>` in the subject and move the Task to Done.
3. Set the Issue to Done and confirm the patch is attached, the PR is completed and the branch is deleted.
4. Open the Issue's **Release** group and check that every row is filled in.

To debug, open the browser's developer tools on the work item form. Each contribution runs in its own iframe named after its HTML page.

## Conventions

- Work goes on a branch and reaches `master` through a PR, like the website repo.
- Board and Repos logic belongs in `release.ts`, which stays free of SDK imports so the webhook backstop can reuse it. SDK and UI code belongs in the entry points and `host.ts`.
