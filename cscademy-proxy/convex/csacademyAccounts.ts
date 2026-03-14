import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
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
    const existing = await ctx.db
      .query("csacademyAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { csaEmail, csaPassword });
      return existing._id;
    } else {
      return ctx.db.insert("csacademyAccounts", {
        userId,
        csaEmail,
        csaPassword,
      });
    }
  },
});

export const remove = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const existing = await ctx.db
      .query("csacademyAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
