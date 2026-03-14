import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getByUserAndTrack = query({
  args: { userId: v.id("users"), trackId: v.id("tracks") },
  handler: async (ctx, { userId, trackId }) => {
    return ctx.db
      .query("scores")
      .withIndex("by_user_track", (q) =>
        q.eq("userId", userId).eq("trackId", trackId)
      )
      .collect();
  },
});

export const getByUserAndProblem = query({
  args: { userId: v.id("users"), problemId: v.id("trackProblems") },
  handler: async (ctx, { userId, problemId }) => {
    return ctx.db
      .query("scores")
      .withIndex("by_user_problem", (q) =>
        q.eq("userId", userId).eq("problemId", problemId)
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
    trackId: v.id("tracks"),
    problemId: v.id("trackProblems"),
    score: v.number(),
  },
  handler: async (ctx, { userId, trackId, problemId, score }) => {
    const existing = await ctx.db
      .query("scores")
      .withIndex("by_user_problem", (q) =>
        q.eq("userId", userId).eq("problemId", problemId)
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
        trackId,
        problemId,
        score,
        attempts: 1,
        lastAttemptAt: Date.now(),
      });
    }
  },
});
