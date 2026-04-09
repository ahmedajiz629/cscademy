import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getByUserAndTrack = query({
  args: { userId: v.id("users"), trackSlug: v.string() },
  handler: async (ctx, { userId, trackSlug }) => {
    return ctx.db
      .query("scores")
      .withIndex("by_user_track", (q) =>
        q.eq("userId", userId).eq("trackSlug", trackSlug)
      )
      .collect();
  },
});

export const getByUserAndProblem = query({
  args: {
    userId: v.id("users"),
    trackSlug: v.string(),
    problemSlug: v.string(),
  },
  handler: async (ctx, { userId, trackSlug, problemSlug }) => {
    return ctx.db
      .query("scores")
      .withIndex("by_user_problem", (q) =>
        q
          .eq("userId", userId)
          .eq("trackSlug", trackSlug)
          .eq("problemSlug", problemSlug)
      )
      .first();
  },
});

export const getAllByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("scores")
      .withIndex("by_user_track", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const listAll = query({
  handler: async (ctx) => {
    return ctx.db.query("scores").collect();
  },
});

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    trackSlug: v.string(),
    problemSlug: v.string(),
    score: v.number(),
  },
  handler: async (ctx, { userId, trackSlug, problemSlug, score }) => {
    const existing = await ctx.db
      .query("scores")
      .withIndex("by_user_problem", (q) =>
        q
          .eq("userId", userId)
          .eq("trackSlug", trackSlug)
          .eq("problemSlug", problemSlug)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        score: Math.max(existing.score, score),
        attempts: existing.attempts + 1,
        lastAttemptAt: Date.now(),
      });
      return existing._id;
    } else {
      return ctx.db.insert("scores", {
        userId,
        trackSlug,
        problemSlug,
        score,
        attempts: 1,
        lastAttemptAt: Date.now(),
      });
    }
  },
});
