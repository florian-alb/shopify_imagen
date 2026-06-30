import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./authz";
import { approvalStatusForUser, isApprovedUser } from "./userAccess";

export const hasUsers = query({
  args: {},
  handler: async (ctx) => {
    const first = await ctx.db.query("users").first();
    return Boolean(first);
  }
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return ctx.db.get(userId);
  }
});

export const currentAccess = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const approvalStatus = approvalStatusForUser(user);
    return {
      userId,
      email: user.email ?? null,
      name: user.name ?? null,
      role: user.role ?? "user",
      approvalStatus,
      isApproved: approvalStatus === "approved"
    };
  }
});

export const isApprovedForAuthz = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args: { userId: Id<"users"> }) => {
    const user = await ctx.db.get(args.userId);
    return isApprovedUser(user);
  }
});
