import { getAuthUserId } from "@convex-dev/auth/server";
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { isApprovedUser } from "./userAccess";

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel> | GenericActionCtx<DataModel>;
type DbCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

function hasDb(ctx: Ctx): ctx is DbCtx {
  return "db" in ctx;
}

export async function requireUserId(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Authentication required.");
  if (hasDb(ctx)) {
    const user = await ctx.db.get(userId);
    if (!isApprovedUser(user)) throw new Error("This account is waiting for admin approval.");
  } else {
    const approved: boolean = await ctx.runQuery(internal.users.isApprovedForAuthz, { userId });
    if (!approved) throw new Error("This account is waiting for admin approval.");
  }
  return userId;
}
