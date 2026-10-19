import { WorkflowManager, start as startWorkflow, cleanup, vResultValidator, vWorkflowId } from "@convex-dev/workflow"
import { v } from "convex/values"
import { components, internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"

const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 2, retryActionsByDefault: false },
})
export const analyze = workflow.define({ args: { versionId: v.id("seoVersions") }, returns: v.null() })
  .handler(async (step, args): Promise<null> => {
    await step.runAction(internal.seoActions.analyze, args)
    return null
  })
export const start = internalMutation({
  args: { versionId: v.id("seoVersions") }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const workflowId = await startWorkflow(ctx, internal.seoWorkflows.analyze, args, {
      onComplete: internal.seoWorkflows.completed, context: args,
    })
    await ctx.db.patch(args.versionId, { workflowId })
    return null
  },
})
export const completed = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ versionId: v.id("seoVersions") }) }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (args.result.kind !== "success") await ctx.runMutation(internal.seoProjects.fail, {
      ...args.context, error: args.result.kind === "failed" ? args.result.error : "Analyse annulée.",
    })
    await ctx.scheduler.runAfter(86_400_000, internal.seoWorkflows.clean, { workflowId: args.workflowId })
    return null
  },
})
export const clean = internalMutation({
  args: { workflowId: vWorkflowId }, returns: v.null(),
  handler: async (ctx, args) => { await cleanup(ctx, components.workflow, args.workflowId); return null },
})
