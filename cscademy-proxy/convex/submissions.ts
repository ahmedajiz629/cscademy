import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    problemSlug: v.string(),
    sourceCode: v.string(),
    type: v.string(),
    input: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("submissions", {
      ...args,
      status: "pending",
    });
  },
});

export const updateResult = mutation({
  args: {
    id: v.id("submissions"),
    status: v.string(),
    result: v.optional(v.any()),
    score: v.optional(v.number()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const listByProblem = query({
  args: { problemSlug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("submissions")
      .withIndex("by_problem", (q) => q.eq("problemSlug", args.problemSlug))
      .order("desc")
      .take(20);
  },
});

export const listRecent = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("submissions").order("desc").take(50);
  },
});
