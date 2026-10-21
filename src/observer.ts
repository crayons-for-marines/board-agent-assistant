// Watches the work item form. When an Issue is saved with a new State, runs
// the action for that state. Board drags never open the form, so the menu
// actions in actions.ts cover those.
import * as SDK from "azure-devops-extension-sdk";
import { IWorkItemFormService, WorkItemTrackingServiceIds } from "azure-devops-extension-api/WorkItemTracking";
import { approveRelease, errorText, startRelease } from "./release";
import { hostContext, toast } from "./host";

// The State each open form had when it was loaded or last saved.
const knownState = new Map<number, string>();

async function form(): Promise<IWorkItemFormService> {
  return SDK.getService<IWorkItemFormService>(WorkItemTrackingServiceIds.WorkItemFormService);
}

async function remember(id: number): Promise<void> {
  const state = (await (await form()).getFieldValue("System.State")) as string;
  knownState.set(id, state);
}

async function onSaved(id: number): Promise<void> {
  const service = await form();
  const [type, state] = (await Promise.all([
    service.getFieldValue("System.WorkItemType"),
    service.getFieldValue("System.State"),
  ])) as [string, string];
  const previous = knownState.get(id);
  knownState.set(id, state);
  if (type !== "Issue" || state === previous) {
    return;
  }

  const action = state === "Doing" ? startRelease : state === "Done" ? approveRelease : undefined;
  if (!action) {
    return;
  }
  try {
    const result = await action(await hostContext(), id);
    await toast(result.message);
  } catch (error) {
    await toast(`Release action failed: ${errorText(error)}`);
  }
  await service.refresh();
}

SDK.init();
SDK.register(SDK.getContributionId(), () => ({
  onLoaded: (args: { id: number }) => remember(args.id),
  onRefreshed: (args: { id: number }) => remember(args.id),
  onReset: (args: { id: number }) => remember(args.id),
  onSaved: (args: { id: number }) => onSaved(args.id),
  onUnloaded: (args: { id: number }) => {
    knownState.delete(args.id);
  },
}));
