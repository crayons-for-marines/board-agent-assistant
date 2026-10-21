# Troubleshooting

Every action shows a toast and, when it changes anything, writes an Issue comment. Start with the newest comment on the Issue.

## Messages

| Message | Cause | What to do |
|---|---|---|
| `#N isn't a release Issue titled professional-X.Y.Z.` | The title doesn't match the pattern | Fix the title, then run the action again from the menu |
| `#N isn't an Issue.` | A menu action was run on a Task or another type | Run it on the release Issue |
| `Select exactly one release Issue.` | A menu action was run with several cards selected | Select one card |
| `Couldn't create professional-X-Y-Z: …` | Branch creation was rejected, usually for permissions | Check that you can create branches in `professional` |
| `… has no Tasks, so there is nothing to release.` | Approval with no child Tasks | Add the Tasks; the Issue is back in Doing |
| `These Tasks aren't Done yet: …` | Approval with open Tasks | Finish or remove them, then set the Issue to Done again |
| `Branch … doesn't exist. Start the release first.` | Approval before the Doing action ran, or the branch was deleted | Run **Start release**, then approve |
| `… has no changes against master.` | Nothing was committed to the branch | Commit the Tasks' changes, then approve |
| `PR N for … is already completed.` | The release was already merged | Nothing to do |
| `PR N is set to auto-complete once its policies pass (…)` | A branch policy blocked completion | Wait for the policies, or fix whatever they report |
| `Release action failed: …` | An unexpected REST error | Read the error; the action can be run again from the menu |

## Nothing happened after a State change

- **You dragged the card.** Board drags don't open the form, so the observer can't see them. Use **Start release** or **Approve release** from the card's menu.
- **The extension isn't installed or enabled** in `dflat-websites`. Check **Organization settings → Extensions**.
- **The form was opened before the extension was installed or updated.** Reload the page.

## Running an action again

Both actions are safe to repeat:

- **Start release** skips a branch or next Issue that already exists.
- **Approve release** reuses an open PR and stops if the PR is already completed. A repeat run before completion attaches another `.patch` file to the Issue.

## The Release group is empty or wrong

- "Not a release Issue": the title doesn't match `professional-X.Y.Z`.
- Branch shows "not created or deleted after merge": expected after a completed release, because the branch is deleted on merge.
- Runs show "None yet": the PR isn't completed, or Build hasn't started for the merge commit. Only the 25 newest runs on `master` are checked.
- Verify shows "Not run yet": no comment among the newest 50 mentions `verify-deploy`.
