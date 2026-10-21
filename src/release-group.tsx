// The Release group on the Issue form: branch, PR, patch attachment, the
// Build and Deploy runs for the merge, and the latest verify-deploy result.
import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { BuildRestClient } from "azure-devops-extension-api/Build";
import { Build, BuildResult } from "azure-devops-extension-api/Build/Build";
import { IWorkItemFormService, WorkItemTrackingServiceIds } from "azure-devops-extension-api/WorkItemTracking";
import { CommentSortOrder, WorkItemExpand } from "azure-devops-extension-api/WorkItemTracking/WorkItemTracking";
import { PullRequestStatus } from "azure-devops-extension-api/Git/Git";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { branchName, errorText, findPullRequest, issueTitle, releaseVersion, TARGET_BRANCH } from "./release";
import { hostContext } from "./host";

interface Link {
  text: string;
  url?: string;
}

interface Release {
  title: string;
  branch: Link;
  pr: Link;
  patches: Link[];
  runs: Link[];
  verify: string;
}

const NOT_RELEASE = "notRelease";

async function loadRelease(): Promise<Release | typeof NOT_RELEASE> {
  const form = await SDK.getService<IWorkItemFormService>(WorkItemTrackingServiceIds.WorkItemFormService);
  const id = await form.getId();
  const ctx = await hostContext();
  const issue = await ctx.work.getWorkItem(id, ctx.project, undefined, undefined, WorkItemExpand.Relations);
  const version = releaseVersion(issue);
  if (!version) {
    return NOT_RELEASE;
  }
  const branch = branchName(version);
  const host = SDK.getHost().name;
  const repoUrl = `https://dev.azure.com/${host}/${encodeURIComponent(ctx.project)}/_git/professional`;

  const refs = await ctx.git.getRefs("professional", ctx.project, `heads/${branch}`);
  const branchLive = refs.some((r) => r.name === `refs/heads/${branch}`);

  const pr = await findPullRequest(ctx, branch);
  const prLink: Link = pr
    ? { text: `PR ${pr.pullRequestId} (${PullRequestStatus[pr.status]})`, url: `${repoUrl}/pullrequest/${pr.pullRequestId}` }
    : { text: "No PR yet" };

  const patches = (issue.relations ?? [])
    .filter((r) => r.rel === "AttachedFile" && String(r.attributes?.name ?? "").endsWith(".patch"))
    .map((r) => ({ text: String(r.attributes.name), url: r.url }));

  let runs: Link[] = [];
  const merge = pr?.lastMergeCommit?.commitId;
  if (pr?.status === PullRequestStatus.Completed && merge) {
    const builds: Build[] = await getClient(BuildRestClient).getBuilds(
      ctx.project,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      25,
      undefined, undefined, undefined, undefined,
      `refs/heads/${TARGET_BRANCH}`,
    );
    runs = builds
      .filter((b) => b.sourceVersion === merge)
      .map((b) => ({
        text: `${b.definition.name} #${b.id}: ${b.finishTime ? resultText(b) : "running"}`,
        url: b._links?.web?.href,
      }));
  }

  const comments = await ctx.work.getComments(id, ctx.project, undefined, 50, CommentSortOrder.Desc);
  const verifyComment = comments.comments.find((c) => /verify-deploy/i.test(c.text));
  const verify = verifyComment ? stripHtml(verifyComment.text) : "Not run yet";

  return {
    title: issueTitle(version),
    branch: branchLive ? { text: branch, url: `${repoUrl}?version=GB${encodeURIComponent(branch)}` } : { text: `${branch} (not created or deleted after merge)` },
    pr: prLink,
    patches,
    runs,
    verify,
  };
}

function resultText(build: Build): string {
  return BuildResult[build.result] ?? String(build.result);
}

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").trim();
}

function LinkText({ link }: { link: Link }) {
  return link.url ? (
    <a href={link.url} target="_blank" rel="noreferrer">
      {link.text}
    </a>
  ) : (
    <span>{link.text}</span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 0" }}>
      <div style={{ width: 90, flexShrink: 0, color: "var(--text-secondary-color, #666)" }}>{label}</div>
      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function ReleaseGroup({ reloadSignal }: { reloadSignal: number }) {
  const [release, setRelease] = useState<Release | typeof NOT_RELEASE>();
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    loadRelease()
      .then((r) => {
        setRelease(r);
        setError(undefined);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  useEffect(load, [load, reloadSignal]);

  if (error) {
    return <div>Couldn't load the release: {error}</div>;
  }
  if (!release) {
    return <div>Loading…</div>;
  }
  if (release === NOT_RELEASE) {
    return <div>Not a release Issue. Release Issues are titled professional-X.Y.Z.</div>;
  }
  return (
    <div style={{ fontFamily: "Segoe UI, sans-serif", fontSize: 13 }}>
      <Row label="Branch"><LinkText link={release.branch} /></Row>
      <Row label="Pull request"><LinkText link={release.pr} /></Row>
      <Row label="Patch">
        {release.patches.length ? release.patches.map((p) => <div key={p.url}><LinkText link={p} /></div>) : "None attached"}
      </Row>
      <Row label="Runs">
        {release.runs.length ? release.runs.map((r) => <div key={r.text}><LinkText link={r} /></div>) : "None yet"}
      </Row>
      <Row label="Verify">{release.verify}</Row>
    </div>
  );
}

let reloads = 0;
const root = createRoot(document.getElementById("root")!);
const render = () => root.render(<ReleaseGroup reloadSignal={reloads++} />);

SDK.init();
SDK.register(SDK.getContributionId(), () => ({
  onLoaded: render,
  onSaved: render,
  onRefreshed: render,
}));
SDK.ready().then(() => SDK.resize());
