import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listByTrack = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    return problems
      .filter((p) => p.isActive !== false)
      .sort((a, b) => a.order - b.order);
  },
});

// Admin variant — returns all problems including disabled ones
export const listByTrackAdmin = query({
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
    const problem = results[0] || null;
    // Return null for disabled problems (students see "not found")
    if (problem?.isActive === false) return null;
    return problem;
  },
});

export const countByTrack = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    return problems.filter((p) => p.isActive !== false).length;
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
    publicRepositoryUrl: v.optional(v.string()),
    evaluationImage: v.optional(v.string()),
    baseCommit: v.optional(v.string()),
    defaultSubmissionRef: v.optional(v.string()),
    isOffline: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.trackSlug === "software-engineering") {
      const existing = await ctx.db
        .query("trackProblems")
        .withIndex("by_trackSlug", (q) => q.eq("trackSlug", args.trackSlug))
        .collect();

      if (existing.length > 0) {
        throw new Error(
          "The software engineering track supports a single challenge only."
        );
      }
    }

    return ctx.db.insert("trackProblems", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("trackProblems"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    points: v.optional(v.number()),
    order: v.optional(v.number()),
    sampleInput: v.optional(v.string()),
    sampleOutput: v.optional(v.string()),
    starterCode: v.optional(v.string()),
    contestTaskId: v.optional(v.number()),
    referer: v.optional(v.string()),
    publicRepositoryUrl: v.optional(v.string()),
    evaluationImage: v.optional(v.string()),
    baseCommit: v.optional(v.string()),
    defaultSubmissionRef: v.optional(v.string()),
    isOffline: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) clean[k] = v;
    }
    await ctx.db.patch(id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("trackProblems") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
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

export const setActive = mutation({
  args: { id: v.id("trackProblems"), isActive: v.boolean() },
  handler: async (ctx, { id, isActive }) => {
    await ctx.db.patch(id, { isActive });
  },
});

