import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  requireAdminOrService,
  requireIdentity,
  requireSelfOrAdminOrService,
} from "./auth";

async function requireViewerUserId(ctx: Parameters<typeof requireIdentity>[0]) {
  const identity = await requireIdentity(ctx);

  if (!identity.userId) {
    throw new Error("Unauthorized");
  }

  return identity.userId;
}

export const getMineByTrack = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const userId = await requireViewerUserId(ctx);

    return ctx.db
      .query("scores")
      .withIndex("by_user_track", (q) =>
        q.eq("userId", userId).eq("trackSlug", trackSlug)
      )
      .collect();
  },
});

export const getMineByProblem = query({
  args: { trackSlug: v.string(), problemSlug: v.string() },
  handler: async (ctx, { trackSlug, problemSlug }) => {
    const userId = await requireViewerUserId(ctx);

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

export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireViewerUserId(ctx);

    return ctx.db
      .query("scores")
      .withIndex("by_user_track", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const getByUserAndTrack = query({
  args: { userId: v.id("users"), trackSlug: v.string() },
  handler: async (ctx, { userId, trackSlug }) => {
    await requireSelfOrAdminOrService(ctx, userId);

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
    await requireSelfOrAdminOrService(ctx, userId);

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
    await requireSelfOrAdminOrService(ctx, userId);

    return ctx.db
      .query("scores")
      .withIndex("by_user_track", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminOrService(ctx);
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
    await requireAdminOrService(ctx);

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
    }

    return ctx.db.insert("scores", {
      userId,
      trackSlug,
      problemSlug,
      score,
      attempts: 1,
      lastAttemptAt: Date.now(),
    });
  },
});
