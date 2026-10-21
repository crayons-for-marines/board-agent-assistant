# Board-driven release workflow

## Context
Azure Boards drives releases of the professional-website container. One **Issue** is one release and one **branch**. One **Task** is one **commit**. **ADO automation is the handler**: it reacts to Issue state changes. **Claude**:
1. Brainstorms with you and generates Tasks.
2. Writes the ADO handler scripts.
3. Turns active Tasks into commits (the artifacts).
4. Runs test scripts to confirm each deploy.

This uses Basic's own states (To Do → Doing → Done), so the board process doesn't change.

## Roles per Issue state

| Issue state | ADO handler | Claude | You |
|---|---|---|---|
| **To Do** | Created by the handler as the blank next version | Brainstorms with you. When an idea is ready to become a working artifact, Claude creates a Task under this Issue: one Task per future commit, with the agreed change in its Description. No building yet | Brainstorm and decide when an idea is ready |
| **Doing** | Creates branch `professional-X-Y-Z` off master. Creates the next blank To Do Issue `professional-X.Y.(Z+1)` | Works each Task in **Doing**: one commit on the Issue branch, message `<title> AB#<task>`, pushed | Move Tasks to Doing, review each commit, move Tasks to Done |
| **Done** = approval | Checks every Task is Done (if not, puts the Issue back to Doing and comments why). Opens the PR into master and attaches `<issue>.patch` plus a commit ↔ Task summary to the Issue as the release record. Completes the PR and deletes the branch. The merge starts the existing Build → Deploy chain | After Deploy, runs `tests/verify-deploy.sh <version>`: the Deploy run succeeded, revision `--v<ver>` is active with 100% traffic, the image tag equals the Build run id, and the site returns 200. Posts the result as a comment on the Issue | Set the Issue to Done |

Rules that still apply:
- A Task is worked only when it and its Issue are both in Doing.
- A Done Issue can't have active Tasks.
- **Failed Deploy:** the Issue is already Done. The verify step comments the failure on it, and the fix goes into the next Issue.

## Building the handler: an ADO custom extension, first
A private Azure DevOps extension, `board-release`, packaged with `tfx-cli` and shared only with the `dflat-websites` org. It's written in TypeScript with `azure-devops-extension-sdk` and `azure-devops-extension-api`.

Contributions:
1. **Work item observer** (`ms.vss-work-web.work-item-notifications`), targeted at Issue. When an Issue is saved with a State change, it runs the action for that state: **Doing** creates the branch and the next To Do Issue; **Done** checks the Tasks, opens the PR, attaches the patch and completes the PR.
2. **Card and form actions** (`ms.vss-work-web.work-item-context-menu`): "Start release" (→ Doing) and "Approve release" (→ Done). Changing a card's state by dragging it on the board doesn't open the form, so the observer never sees it. These menu actions cover that case.
3. **Release group** on the Issue form (`ms.vss-work-web.work-item-form-group`): shows the branch, PR, patch attachment, Build/Deploy runs and the latest verify result.

**Why an extension first:** it runs in your browser session as **you**. Branches, PRs and the PR completion are made under your identity, so setting the Issue to Done really is your approval. No Build Service permission grants are needed, and the reviewer policy is satisfied by you. A webhook pipeline (service hook → `azure-pipelines-board.yml`) can come later as a backstop for changes the extension never sees, using the same logic.

**Where it lives:** repo `board-release` in a separate org and project, `dflatdeveloper/board-agent-assistant`, so its pushes never start this site's Build. The extension is still shared with and installed in `dflat-websites`, where the board is. It follows the same branch + PR rules.

## Build order (Claude, after approval)
1. Create the `board-release` repo. On branch `extension-scaffold`, add `vss-extension.json`, `src/observer.ts`, `src/actions.ts`, `src/release-group.tsx`, `src/release.ts` (the shared Doing/Done logic) and a build script. Open a PR (you merge it, M4).
2. Package the extension and publish it privately with `tfx extension publish` (needs M1 and M2). You install it (M5).
3. In this repo, on branch `verify-deploy-script`: add `tests/verify-deploy.sh`, exclude `tests` from Build's path filter, and rewrite CLAUDE.md's approval rule (needs M3). Open a PR (you merge it, M6).
4. Update memory with this model, replacing `project_devops_release_handler.md` and extending `feedback_board_task_gate.md`.
5. Later: the webhook pipeline backstop, reusing `release.ts`.

## Verification
Run it on #1 `professional-0.2.0`:
- Moving #1 to Doing creates the branch and Issue `professional-0.2.1`.
- With #2 in Doing, Claude commits the version bump.
- Setting #1 to Done attaches the patch, merges the PR, deletes the branch, and runs Build and Deploy.
- `verify-deploy.sh 0.2.0` passes, and its result is posted as a comment on #1.

## Manual steps (you)
Claude can't do these. They're listed in the order the build needs them.

| # | Step | Needed before |
|---|---|---|
| M1 | Create a Visual Studio Marketplace publisher and tell Claude its ID | Build step 2 (publishing) |
| M2 | Make a PAT with **Marketplace (publish)** scope and make it available to `tfx` (for example as an env var in your shell) | Build step 2 |
| M3 | Approve the CLAUDE.md change: "the user merges the PR" becomes "the user approves by setting the release Issue to Done, and the ADO handler completes the PR". Claude still never merges or approves | Build step 3 |
| M4 | Review and merge the `extension-scaffold` PR in `board-release` | Build step 2 |
| M5 | Install the published `board-release` extension in the `dflat-websites` org (needs org admin) | Verification |
| M6 | Review and merge the `verify-deploy-script` PR in this repo | Verification |
| M7 | Verification run: move #1 to Doing, move #2 to Doing, review the commit, move #2 to Done, then set #1 to Done | Verification |
