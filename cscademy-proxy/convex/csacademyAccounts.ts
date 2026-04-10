import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdminOrService } from "./auth";

export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdminOrService(ctx);

    return ctx.db
      .query("csacademyAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    csaEmail: v.string(),
    csaPassword: v.string(),
  },
  handler: async (ctx, { userId, csaEmail, csaPassword }) => {
    await requireAdminOrService(ctx);

    const existing = await ctx.db
      .query("csacademyAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { csaEmail, csaPassword });
      return existing._id;
    }

    return ctx.db.insert("csacademyAccounts", {
      userId,
      csaEmail,
      csaPassword,
    });
  },
});

export const remove = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdminOrService(ctx);

    const existing = await ctx.db
      .query("csacademyAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
