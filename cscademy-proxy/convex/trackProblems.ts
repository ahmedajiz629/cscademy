import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const listByTrack = query({
  args: { trackId: v.id("tracks") },
  handler: async (ctx, { trackId }) => {
    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackId", (q) => q.eq("trackId", trackId))
      .collect();
    return problems.sort((a, b) => a.order - b.order);
  },
});

export const getById = query({
  args: { id: v.id("trackProblems") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    trackId: v.id("tracks"),
    name: v.string(),
    slug: v.string(),
    contestTaskId: v.number(),
    description: v.string(),
    points: v.number(),
    order: v.number(),
    sampleInput: v.optional(v.string()),
    sampleOutput: v.optional(v.string()),
    starterCode: v.optional(v.string()),
    referer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("trackProblems", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("trackProblems"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    contestTaskId: v.optional(v.number()),
    description: v.optional(v.string()),
    points: v.optional(v.number()),
    order: v.optional(v.number()),
    sampleInput: v.optional(v.string()),
    sampleOutput: v.optional(v.string()),
    starterCode: v.optional(v.string()),
    referer: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const clean: Record<string, any> = {};
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) clean[k] = val;
    }
    await ctx.db.patch(id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("trackProblems") },
  handler: async (ctx, { id }) => {
    // Remove related scores
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_user_problem", (q) => q.eq("userId", "" as any))
      .collect();
    // Can't efficiently query by problemId alone, so filter
    const allScores = await ctx.db.query("scores").collect();
    for (const s of allScores) {
      if (s.problemId === id) await ctx.db.delete(s._id);
    }
    await ctx.db.delete(id);
  },
});
