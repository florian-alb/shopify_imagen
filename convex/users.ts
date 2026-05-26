import { query } from "./_generated/server";
import { requireUserId } from "./authz";

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
