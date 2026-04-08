import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_FLAG_REASON = "probe_match";

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

export const listAll = query({
  handler: async (ctx) => {
    const sessions = await ctx.db.query("offlineProblemSessions").collect();
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
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
    const terminatedReason =
      !reason || reason === "connection_lost"
        ? session.flagReason ?? "connection_lost"
        : reason;

    await ctx.db.patch(session._id, {
      status: "terminated",
      terminatedAt: now,
      terminatedReason,
      lastHeartbeatAt: now,
      updatedAt: now,
    });

    return session._id;
  },
});

export const flag = mutation({
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
      flaggedAt: now,
      flagReason: session.flagReason ?? reason ?? DEFAULT_FLAG_REASON,
      flagCount: (session.flagCount ?? 0) + 1,
      updatedAt: now,
    });

    return session._id;
  },
});

export const reopen = mutation({
  args: {
    id: v.id("offlineProblemSessions"),
  },
  handler: async (ctx, { id }) => {
    const session = await ctx.db.get(id);

    if (!session) {
      throw new Error("Offline session not found.");
    }

    const now = Date.now();
    await ctx.db.replace(id, {
      userId: session.userId,
      trackSlug: session.trackSlug,
      problemSlug: session.problemSlug,
      sessionId: session.sessionId,
      gatewayUrl: session.gatewayUrl,
      status: "pending",
      createdAt: session.createdAt,
      updatedAt: now,
    });

    return id;
  },
});