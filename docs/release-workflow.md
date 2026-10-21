# Release workflow

Azure Boards drives releases of the `professional` website container.

- One **Issue** is one release and one branch. It's titled `professional-X.Y.Z`.
- One **Task** under that Issue is one commit on the release branch.
- The board uses the Basic process's own states: **To Do → Doing → Done**.

## Who does what

| Issue state | Extension | Claude | You |
|---|---|---|---|
| **To Do** | Created by the extension as the blank next version | Brainstorms with you. Creates one Task per future commit, with the agreed change in its Description | Decide when an idea is ready to become a Task |
| **Doing** | Creates branch `professional-X-Y-Z` off `master` and the next To Do Issue `professional-X.Y.(Z+1)` | Works each Task that is in Doing: one commit on the release branch, message `<title> AB#<task>`, pushed | Move Tasks to Doing, review each commit, move Tasks to Done |
| **Done** (your approval) | Checks every Task is Done, opens the PR into `master`, attaches the patch and the commit ↔ Task summary, approves and completes the PR, deletes the branch | After Deploy, runs `tests/verify-deploy.sh <version>` and posts the result as a comment on the Issue | Set the Issue to Done |

Rules:

- A Task is worked only when it and its Issue are both in Doing.
- A Done Issue can't have open Tasks. If it does, the extension moves it back to Doing and comments why.
- If Deploy fails, the Issue is already Done. The verify comment records the failure and the fix goes into the next Issue.

## Starting a release (→ Doing)

Set the Issue to **Doing** on its form and save, or use **Start release** from the card's or the form's menu. The extension then:

1. Creates `refs/heads/professional-X-Y-Z` in the `professional` repo from the head of `master`. If the branch already exists, it leaves it alone.
2. Creates the next Issue `professional-X.Y.(Z+1)` with the same Area and Iteration paths, unless an Issue with that title already exists.
3. Comments on the Issue with what it did, and shows the same text as a toast.

Running it twice is safe: the second run only reports that the branch and the next Issue already exist.

## Approving a release (→ Done)

Set the Issue to **Done** on its form and save, or use **Approve release**. The extension checks, in order:

1. The Issue has at least one child Task.
2. Every child Task is Done.
3. The release branch exists.
4. The branch has changes against `master`.

If any check fails, it moves the Issue back to **Doing** and comments the reason. If a PR for the branch is already completed, it stops and reports that.

When the checks pass, it:

1. Opens the PR `Release professional-X.Y.Z` from the release branch into `master`, linked to the Issue (or reuses an open one).
2. Attaches `professional-X.Y.Z.patch`, a unified diff of `master` against the branch head, to the Issue.
3. Adds your approval vote to the PR. Setting the Issue to Done is your approval, so the vote is yours.
4. Completes the PR with a no-fast-forward merge and deletes the source branch. If a branch policy blocks completion, it turns on auto-complete instead, so the merge happens once the policies pass.
5. Comments on the Issue with the outcome and the commit ↔ Task summary: one line per commit, matched to its Task by the `AB#<id>` in the commit subject, plus a line for every Task with no commit.

The merge into `master` starts the existing Build → Deploy pipelines.

## Why drag-and-drop needs the menu actions

Dragging a card to another column changes its State without opening the work item form, so the form observer never sees it. Use **Start release** and **Approve release** from the card's menu instead of dragging release Issues. Tasks can be dragged freely; the extension only acts on Issues.

## The Release group

Every Issue form shows a **Release** group with:

- **Branch**: the release branch, linked while it exists.
- **Pull request**: the PR and its status.
- **Patch**: the `.patch` files attached to the Issue.
- **Runs**: the Build and Deploy runs on `master` for the PR's merge commit.
- **Verify**: the newest Issue comment that mentions `verify-deploy`.

Issues that aren't titled `professional-X.Y.Z` show "Not a release Issue."
