# Configuration

The extension has no settings page. Its names and conventions are constants in [`src/release.ts`](../src/release.ts):

| Constant | Value | Used for |
|---|---|---|
| `REPOSITORY` | `professional` | The repo that gets the release branch and PR |
| `TARGET_BRANCH` | `master` | The branch releases start from and merge into |
| `ISSUE_TYPE` | `Issue` | The work item type of a release |
| `TASK_TYPE` | `Task` | The child work item type that must be Done before approval |
| `TITLE_PATTERN` | `^professional-(\d+)\.(\d+)\.(\d+)$` | Which Issues count as releases |
| `APPROVE_VOTE` | `10` | The PR vote cast for you ("Approved") |

`src/release-group.tsx` also builds the repo's web links from the `professional` repo name.

The repo and project come from the page you're on, so the extension works in whichever project of `dflat-websites` holds both the board and the `professional` repo.

## Naming

| Thing | Format | Example |
|---|---|---|
| Release Issue title | `professional-X.Y.Z` | `professional-0.2.0` |
| Release branch | `professional-X-Y-Z` | `professional-0-2-0` |
| Next Issue | patch version + 1 | `professional-0.2.1` |
| Commit subject | `<title> AB#<task id>` | `Bump version to 0.2.0 AB#2` |
| Patch attachment | `<issue title>.patch` | `professional-0.2.0.patch` |
| PR title | `Release <issue title>` | `Release professional-0.2.0` |

The next Issue always bumps the patch number. For a minor or major release, rename the blank To Do Issue before you start it.

## Manifest

[`vss-extension.json`](../vss-extension.json) fields to know:

| Field | Value | Note |
|---|---|---|
| `publisher` | `REPLACE_WITH_PUBLISHER_ID` | Set to your Marketplace publisher ID before publishing |
| `version` | `0.1.0` | Bump on every publish |
| `public` | `false` | Private; shared only with `dflat-websites` |
| `scopes` | `vso.work_write`, `vso.code_write`, `vso.build` | Changing scopes makes the org admin re-authorize the extension |

## Board and repo assumptions

- The project uses the Basic process, with Issue and Task states To Do, Doing and Done.
- Tasks are children of their Issue (Parent/Child links).
- The `professional` repo's branch policies allow you to approve and complete your own PR. If a required build is still running, the extension sets auto-complete instead.
