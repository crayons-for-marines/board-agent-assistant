// "Start release" and "Approve release" on board cards, backlog rows and the
// form toolbar. Each sets the Issue's State and then runs the matching action,
// because a State change made through REST never reaches the form observer.
import * as SDK from "azure-devops-extension-sdk";
import { ActionResult, approveRelease, errorText, ReleaseContext, startRelease } from "./release";
import { hostContext, toast } from "./host";

interface ActionContext {
  id?: number;
  workItemId?: number;
  workItemIds?: number[];
}

function selectedIds(context: ActionContext): number[] {
  if (context.workItemIds?.length) {
    return context.workItemIds;
  }
  const id = context.workItemId ?? context.id;
  return id ? [id] : [];
}

function menuAction(state: string, run: (ctx: ReleaseContext, id: number) => Promise<ActionResult>) {
  return {
    execute: async (context: ActionContext) => {
      const ids = selectedIds(context);
      if (ids.length !== 1) {
        await toast("Select exactly one release Issue.");
        return;
      }
      const [id] = ids;
      try {
        const ctx = await hostContext();
        const issue = await ctx.work.getWorkItem(id, ctx.project, ["System.WorkItemType"]);
        if (issue.fields["System.WorkItemType"] !== "Issue") {
          await toast(`#${id} isn't an Issue.`);
          return;
        }
        await ctx.work.updateWorkItem([{ op: "add", path: "/fields/System.State", value: state }], id, ctx.project);
        const result = await run(ctx, id);
        await toast(result.message);
      } catch (error) {
        await toast(`Release action failed: ${errorText(error)}`);
      }
    },
  };
}

SDK.init();
SDK.register("start-release", () => menuAction("Doing", startRelease));
SDK.register("approve-release", () => menuAction("Done", approveRelease));
