import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByUserAndProblem = query({
  args: {
    userId: v.id("users"),
    trackSlug: v.string(),
    problemSlug: v.string(),
  },
  handler: async (ctx, { userId, trackSlug, problemSlug }) => {
    return ctx.db
      .query("offlineProblemSessions")
      .withIndex("by_user_problem", (q) =>
        q.eq("userId", userId).eq("trackSlug", trackSlug).eq("problemSlug", problemSlug)
      )
      .first();
  },
});

export const listByUserAndTrack = query({
  args: {
    userId: v.id("users"),
    trackSlug: v.string(),
  },
  handler: async (ctx, { userId, trackSlug }) => {
    return ctx.db
      .query("offlineProblemSessions")
      .withIndex("by_user_track", (q) =>
        q.eq("userId", userId).eq("trackSlug", trackSlug)
      )
      .collect();
  },
});

export const prepareEntry = mutation({
  args: {
    userId: v.id("users"),
    trackSlug: v.string(),
    problemSlug: v.string(),
    sessionId: v.string(),
    gatewayUrl: v.string(),
  },
  handler: async (ctx, { userId, trackSlug, problemSlug, sessionId, gatewayUrl }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("offlineProblemSessions")
      .withIndex("by_user_problem", (q) =>
        q.eq("userId", userId).eq("trackSlug", trackSlug).eq("problemSlug", problemSlug)
      )
      .first();

    if (existing?.status === "terminated") {
      throw new Error("This offline task has already been terminated for the participant.");
    }

    if (existing?.status === "active") {
      throw new Error("This offline task is already active.");
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        sessionId,
        gatewayUrl,
        status: "pending",
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("offlineProblemSessions", {
      userId,
      trackSlug,
      problemSlug,
      sessionId,
      gatewayUrl,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const activate = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db
      .query("offlineProblemSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session) {
      throw new Error("Offline session not found.");
    }

    if (session.status === "terminated") {
      throw new Error("Offline session already terminated.");
    }

    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "active",
      startedAt: session.startedAt ?? now,
      lastHeartbeatAt: now,
      updatedAt: now,
    });

    return session._id;
  },
});

export const heartbeat = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db
      .query("offlineProblemSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session || session.status !== "active") {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(session._id, {
      lastHeartbeatAt: now,
      updatedAt: now,
    });

    return session._id;
  },
});

export const terminate = mutation({
  args: {
    sessionId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, reason }) => {
    const session = await ctx.db
      .query("offlineProblemSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session || session.status === "terminated") {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "terminated",
      terminatedAt: now,
      terminatedReason: reason ?? "connection_lost",
      lastHeartbeatAt: now,
      updatedAt: now,
    });

    return session._id;
  },
});