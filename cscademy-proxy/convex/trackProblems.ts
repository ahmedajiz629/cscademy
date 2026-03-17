import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByTrack = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    return problems.sort((a, b) => a.order - b.order);
  },
});

export const getBySlug = query({
  args: { trackSlug: v.string(), slug: v.string() },
  handler: async (ctx, { trackSlug, slug }) => {
    const results = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug_slug", (q) =>
        q.eq("trackSlug", trackSlug).eq("slug", slug)
      )
      .collect();
    return results[0] || null;
  },
});

export const countByTrack = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    return problems.length;
  },
});

export const create = mutation({
  args: {
    trackSlug: v.string(),
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    points: v.number(),
    order: v.number(),
    sampleInput: v.optional(v.string()),
    sampleOutput: v.optional(v.string()),
    starterCode: v.optional(v.string()),
    contestTaskId: v.optional(v.number()),
    referer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("trackProblems", args);
  },
});

export const clearByTrack = mutation({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    for (const p of problems) {
      await ctx.db.delete(p._id);
    }
    return problems.length;
  },
});
