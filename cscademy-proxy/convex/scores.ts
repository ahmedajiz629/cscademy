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

export const listDetailedAdmin = query({
  handler: async (ctx) => {
    await requireAdminOrService(ctx);

    const [scores, users, problems] = await Promise.all([
      ctx.db.query("scores").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("trackProblems").collect(),
    ]);

    const userMap = new Map(users.map((user) => [user._id, user]));
    const problemMap = new Map(
      problems.map((problem) => [
        `${problem.trackSlug}:${problem.slug}`,
        problem,
      ])
    );

    return scores
      .map((score) => {
        const user = userMap.get(score.userId);
        const problem = problemMap.get(`${score.trackSlug}:${score.problemSlug}`);

        return {
          ...score,
          userName: user?.name ?? "Unknown user",
          userEmail: user?.email ?? "",
          problemName: problem?.name ?? score.problemSlug,
          problemPoints: problem?.points ?? 0,
          isOfflineProblem: problem?.isOffline === true,
          isProblemActive: problem?.isActive !== false,
        };
      })
      .sort((left, right) => {
        if (left.trackSlug !== right.trackSlug) {
          return left.trackSlug.localeCompare(right.trackSlug);
        }

        if (left.userName !== right.userName) {
          return left.userName.localeCompare(right.userName);
        }

        return left.problemName.localeCompare(right.problemName);
      });
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

export const setExact = mutation({
  args: {
    userId: v.id("users"),
    trackSlug: v.string(),
    problemSlug: v.string(),
    score: v.number(),
  },
  handler: async (ctx, { userId, trackSlug, problemSlug, score }) => {
    await requireAdminOrService(ctx);

    const problem = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug_slug", (q) =>
        q.eq("trackSlug", trackSlug).eq("slug", problemSlug)
      )
      .first();

    if (!problem) {
      throw new Error("Problem not found.");
    }

    const normalizedScore = Math.min(problem.points, Math.max(0, score));
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
        score: normalizedScore,
        lastAttemptAt: Date.now(),
      });
      return existing._id;
    }

    return ctx.db.insert("scores", {
      userId,
      trackSlug,
      problemSlug,
      score: normalizedScore,
      attempts: 0,
      lastAttemptAt: Date.now(),
    });
  },
});
