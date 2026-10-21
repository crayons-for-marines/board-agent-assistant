// The Doing and Done release actions. Nothing here touches the extension SDK:
// callers pass in REST clients and the acting user, so the observer, the menu
// actions and a later webhook-pipeline backstop all run the same logic.
import { WorkItemTrackingRestClient } from "azure-devops-extension-api/WorkItemTracking";
import { WorkItem, WorkItemExpand } from "azure-devops-extension-api/WorkItemTracking/WorkItemTracking";
import { GitRestClient } from "azure-devops-extension-api/Git";
import {
  GitCommitRef,
  GitPullRequest,
  GitPullRequestMergeStrategy,
  GitVersionOptions,
  GitVersionType,
  PullRequestStatus,
  VersionControlChangeType,
} from "azure-devops-extension-api/Git/Git";
import { createTwoFilesPatch } from "diff";

export const REPOSITORY = "professional";
export const TARGET_BRANCH = "master";
const ISSUE_TYPE = "Issue";
const TASK_TYPE = "Task";
const TITLE_PATTERN = /^professional-(\d+)\.(\d+)\.(\d+)$/;
const EMPTY_OBJECT_ID = "0000000000000000000000000000000000000000";
const APPROVE_VOTE = 10;

export interface ReleaseContext {
  project: string;
  userId: string;
  work: WorkItemTrackingRestClient;
  git: GitRestClient;
}

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export function parseVersion(title: string): Version | undefined {
  const match = TITLE_PATTERN.exec(title.trim());
  if (!match) {
    return undefined;
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function versionText(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function issueTitle(v: Version): string {
  return `professional-${versionText(v)}`;
}

export function branchName(v: Version): string {
  return `professional-${v.major}-${v.minor}-${v.patch}`;
}

export function nextVersion(v: Version): Version {
  return { ...v, patch: v.patch + 1 };
}

/** Returns the release version of a work item, or undefined when it isn't a release Issue. */
export function releaseVersion(item: WorkItem): Version | undefined {
  if (item.fields["System.WorkItemType"] !== ISSUE_TYPE) {
    return undefined;
  }
  return parseVersion(String(item.fields["System.Title"] ?? ""));
}

/** Issue → Doing: create the release branch off master and the next blank To Do Issue. */
export async function startRelease(ctx: ReleaseContext, issueId: number): Promise<ActionResult> {
  const issue = await ctx.work.getWorkItem(issueId, ctx.project);
  const version = releaseVersion(issue);
  if (!version) {
    return { ok: false, message: `#${issueId} isn't a release Issue titled professional-X.Y.Z.` };
  }

  const branch = branchName(version);
  const notes: string[] = [];

  if (await branchExists(ctx, branch)) {
    notes.push(`Branch ${branch} already exists.`);
  } else {
    const master = await branchHead(ctx, TARGET_BRANCH);
    const [update] = await ctx.git.updateRefs(
      [{ name: `refs/heads/${branch}`, oldObjectId: EMPTY_OBJECT_ID, newObjectId: master } as never],
      REPOSITORY,
      ctx.project,
    );
    if (!update.success) {
      return { ok: false, message: `Couldn't create ${branch}: ${update.customMessage ?? update.updateStatus}.` };
    }
    notes.push(`Created branch ${branch} from ${TARGET_BRANCH}.`);
  }

  const next = issueTitle(nextVersion(version));
  const existing = await findIssue(ctx, next);
  if (existing) {
    notes.push(`Next Issue ${next} already exists as #${existing}.`);
  } else {
    const created = await ctx.work.createWorkItem(
      [
        { op: "add", path: "/fields/System.Title", value: next },
        { op: "add", path: "/fields/System.AreaPath", value: issue.fields["System.AreaPath"] },
        { op: "add", path: "/fields/System.IterationPath", value: issue.fields["System.IterationPath"] },
      ],
      ctx.project,
      ISSUE_TYPE,
    );
    notes.push(`Created next Issue ${next} as #${created.id}.`);
  }

  await comment(ctx, issueId, ["Start release", ...notes]);
  return { ok: true, message: notes.join(" ") };
}

/**
 * Issue → Done: the user's approval. Check every Task is Done, then open the PR,
 * attach the patch and commit ↔ Task summary, and complete the PR. If anything
 * blocks the release, put the Issue back to Doing and say why.
 */
export async function approveRelease(ctx: ReleaseContext, issueId: number): Promise<ActionResult> {
  const issue = await ctx.work.getWorkItem(issueId, ctx.project, undefined, undefined, WorkItemExpand.Relations);
  const version = releaseVersion(issue);
  if (!version) {
    return { ok: false, message: `#${issueId} isn't a release Issue titled professional-X.Y.Z.` };
  }
  const branch = branchName(version);
  const title = issueTitle(version);

  const tasks = await childTasks(ctx, issue);
  const open = tasks.filter((t) => t.fields["System.State"] !== "Done");
  if (tasks.length === 0) {
    return reopen(ctx, issueId, `${title} has no Tasks, so there is nothing to release.`);
  }
  if (open.length > 0) {
    const list = open.map((t) => `#${t.id} ${t.fields["System.Title"]} (${t.fields["System.State"]})`);
    return reopen(ctx, issueId, `These Tasks aren't Done yet: ${list.join("; ")}.`);
  }

  let pr = await findPullRequest(ctx, branch);
  if (pr?.status === PullRequestStatus.Completed) {
    return { ok: true, message: `PR ${pr.pullRequestId} for ${branch} is already completed.` };
  }
  if (!(await branchExists(ctx, branch))) {
    return reopen(ctx, issueId, `Branch ${branch} doesn't exist. Start the release first.`);
  }

  const master = await branchHead(ctx, TARGET_BRANCH);
  const head = await branchHead(ctx, branch);
  const patch = await buildPatch(ctx, master, head);
  if (!patch) {
    return reopen(ctx, issueId, `${branch} has no changes against ${TARGET_BRANCH}.`);
  }

  if (!pr) {
    pr = await ctx.git.createPullRequest(
      {
        sourceRefName: `refs/heads/${branch}`,
        targetRefName: `refs/heads/${TARGET_BRANCH}`,
        title: `Release ${title}`,
        description: `Release ${title}. Approved by setting #${issueId} to Done.`,
        workItemRefs: [{ id: String(issueId) } as never],
      } as never,
      REPOSITORY,
      ctx.project,
    );
  }

  const commits = await ctx.git.getPullRequestCommits(REPOSITORY, pr.pullRequestId, ctx.project);
  const summary = commitSummary(commits, tasks);

  const attachment = await ctx.work.createAttachment(patch, ctx.project, `${title}.patch`);
  await ctx.work.updateWorkItem(
    [
      {
        op: "add",
        path: "/relations/-",
        value: { rel: "AttachedFile", url: attachment.url, attributes: { comment: `Release patch for PR ${pr.pullRequestId}` } },
      },
    ],
    issueId,
    ctx.project,
  );

  // Setting the Issue to Done is the approval, so the vote is the user's own.
  await ctx.git.createPullRequestReviewer({ vote: APPROVE_VOTE } as never, REPOSITORY, pr.pullRequestId, ctx.userId, ctx.project);

  const completionOptions = {
    deleteSourceBranch: true,
    mergeStrategy: GitPullRequestMergeStrategy.NoFastForward,
    mergeCommitMessage: `Merge pull request ${pr.pullRequestId} from ${branch} into ${TARGET_BRANCH}`,
    transitionWorkItems: false,
  };
  let outcome: string;
  try {
    await ctx.git.updatePullRequest(
      { status: PullRequestStatus.Completed, lastMergeSourceCommit: pr.lastMergeSourceCommit, completionOptions } as never,
      REPOSITORY,
      pr.pullRequestId,
      ctx.project,
    );
    outcome = `Completed PR ${pr.pullRequestId}; the merge starts Build → Deploy.`;
  } catch (error) {
    // A policy (for example a running PR build) can block completion. Auto-complete
    // finishes the merge as soon as the policies pass.
    await ctx.git.updatePullRequest(
      { autoCompleteSetBy: { id: ctx.userId }, completionOptions } as never,
      REPOSITORY,
      pr.pullRequestId,
      ctx.project,
    );
    outcome = `PR ${pr.pullRequestId} is set to auto-complete once its policies pass (${errorText(error)}).`;
  }

  await comment(ctx, issueId, [`Approve release ${title}`, `Attached ${title}.patch.`, outcome, "", ...summary]);
  return { ok: true, message: outcome };
}

async function reopen(ctx: ReleaseContext, issueId: number, reason: string): Promise<ActionResult> {
  await ctx.work.updateWorkItem([{ op: "add", path: "/fields/System.State", value: "Doing" }], issueId, ctx.project);
  await comment(ctx, issueId, ["Release not approved: moved back to Doing.", reason]);
  return { ok: false, message: reason };
}

async function comment(ctx: ReleaseContext, issueId: number, lines: string[]): Promise<void> {
  const html = lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : "")).join("");
  // This client has no add-comment call; a System.History update is a Discussion comment.
  await ctx.work.updateWorkItem([{ op: "add", path: "/fields/System.History", value: html }], issueId, ctx.project);
}

async function branchExists(ctx: ReleaseContext, branch: string): Promise<boolean> {
  const refs = await ctx.git.getRefs(REPOSITORY, ctx.project, `heads/${branch}`);
  return refs.some((r) => r.name === `refs/heads/${branch}`);
}

async function branchHead(ctx: ReleaseContext, branch: string): Promise<string> {
  const refs = await ctx.git.getRefs(REPOSITORY, ctx.project, `heads/${branch}`);
  const ref = refs.find((r) => r.name === `refs/heads/${branch}`);
  if (!ref) {
    throw new Error(`Branch ${branch} not found in ${REPOSITORY}.`);
  }
  return ref.objectId;
}

async function findIssue(ctx: ReleaseContext, title: string): Promise<number | undefined> {
  const result = await ctx.work.queryByWiql(
    {
      query:
        "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project " +
        `AND [System.WorkItemType] = '${ISSUE_TYPE}' AND [System.Title] = '${title.replace(/'/g, "''")}'`,
    },
    ctx.project,
  );
  return result.workItems[0]?.id;
}

export async function findPullRequest(ctx: ReleaseContext, branch: string): Promise<GitPullRequest | undefined> {
  const prs = await ctx.git.getPullRequests(
    REPOSITORY,
    {
      sourceRefName: `refs/heads/${branch}`,
      targetRefName: `refs/heads/${TARGET_BRANCH}`,
      status: PullRequestStatus.All,
    } as never,
    ctx.project,
  );
  return prs.find((pr) => pr.status !== PullRequestStatus.Abandoned);
}

async function childTasks(ctx: ReleaseContext, issue: WorkItem): Promise<WorkItem[]> {
  const ids = (issue.relations ?? [])
    .filter((r) => r.rel === "System.LinkTypes.Hierarchy-Forward")
    .map((r) => Number(r.url.split("/").pop()));
  if (ids.length === 0) {
    return [];
  }
  const items = await ctx.work.getWorkItems(ids, ctx.project, ["System.Title", "System.State", "System.WorkItemType"]);
  return items.filter((i) => i.fields["System.WorkItemType"] === TASK_TYPE);
}

/** A unified diff of every file that differs between master and the release branch head. */
async function buildPatch(ctx: ReleaseContext, base: string, target: string): Promise<string> {
  const commit = (version: string) => ({
    version,
    versionType: GitVersionType.Commit,
    versionOptions: GitVersionOptions.None,
  });
  const diff = await ctx.git.getCommitDiffs(
    REPOSITORY,
    ctx.project,
    true,
    undefined,
    undefined,
    commit(base) as never,
    commit(target) as never,
  );

  const parts: string[] = [];
  for (const change of diff.changes ?? []) {
    const item = change.item;
    if (!item || item.isFolder) {
      continue;
    }
    const type = change.changeType;
    const path = item.path;
    const oldPath = change.sourceServerItem ?? path;
    const before = type & VersionControlChangeType.Add ? "" : await fileText(ctx, oldPath, diff.baseCommit ?? base);
    const after = type & VersionControlChangeType.Delete ? "" : await fileText(ctx, path, diff.targetCommit ?? target);
    if (before === undefined || after === undefined) {
      parts.push(`diff --git a${oldPath} b${path}\nBinary files differ\n`);
      continue;
    }
    parts.push(`diff --git a${oldPath} b${path}\n` + createTwoFilesPatch(`a${oldPath}`, `b${path}`, before, after, "", "", { context: 3 }));
  }
  return parts.join("");
}

/** File text at a commit, or undefined for a binary file. */
async function fileText(ctx: ReleaseContext, path: string, version: string): Promise<string | undefined> {
  const text = await ctx.git.getItemText(
    REPOSITORY,
    path,
    ctx.project,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { version, versionType: GitVersionType.Commit, versionOptions: GitVersionOptions.None } as never,
  );
  return text.includes("\u0000") ? undefined : text;
}

/** One line per commit, matched to its Task through the AB#<id> in the message. */
function commitSummary(commits: GitCommitRef[], tasks: WorkItem[]): string[] {
  const titles = new Map(tasks.map((t) => [t.id, String(t.fields["System.Title"])]));
  const lines = ["Commit ↔ Task"];
  for (const c of [...commits].reverse()) {
    const subject = (c.comment ?? "").split("\n")[0];
    const ids = [...subject.matchAll(/AB#(\d+)/g)].map((m) => Number(m[1]));
    const linked = ids.length ? ids.map((id) => `#${id} ${titles.get(id) ?? "(not a Task of this Issue)"}`).join(", ") : "no Task";
    lines.push(`${c.commitId.slice(0, 7)} ${subject} → ${linked}`);
  }
  const covered = new Set(lines.join(" ").match(/#\d+/g) ?? []);
  for (const [id, title] of titles) {
    if (!covered.has(`#${id}`)) {
      lines.push(`Task #${id} ${title} has no commit.`);
    }
  }
  return lines;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
