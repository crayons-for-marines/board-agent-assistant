// Builds a ReleaseContext from the extension host: the current project, the
// signed-in user and REST clients that call Azure DevOps as that user.
import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, getClient, IGlobalMessagesService, IProjectPageService } from "azure-devops-extension-api";
import { WorkItemTrackingRestClient } from "azure-devops-extension-api/WorkItemTracking";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { ReleaseContext } from "./release";

export async function hostContext(): Promise<ReleaseContext> {
  await SDK.ready();
  const projects = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
  const project = await projects.getProject();
  if (!project) {
    throw new Error("No project in the current page context.");
  }
  return {
    project: project.name,
    userId: SDK.getUser().id,
    work: getClient(WorkItemTrackingRestClient),
    git: getClient(GitRestClient),
  };
}

export async function toast(message: string): Promise<void> {
  const messages = await SDK.getService<IGlobalMessagesService>(CommonServiceIds.GlobalMessagesService);
  messages.addToast({ message, duration: 8000 });
}
