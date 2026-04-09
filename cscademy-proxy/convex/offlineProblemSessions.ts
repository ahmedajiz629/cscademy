import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

const DEFAULT_FLAG_REASON = "probe_match";
const DEFAULT_TERMINATED_REASON = "connection_lost";

type OfflineProblemSessionDocument = Doc<"offlineProblemSessions">;
type OfflineProblemSessionRecord = Omit<
  OfflineProblemSessionDocument,
  "_id" | "_creationTime"
>;

function buildSessionDocument(
  session: OfflineProblemSessionDocument,
  overrides: Partial<OfflineProblemSessionRecord> = {}
): OfflineProblemSessionRecord {
  const nextSession: OfflineProblemSessionRecord = {
    userId: session.userId,
    trackSlug: session.trackSlug,
    problemSlug: session.problemSlug,
    sessionId: session.sessionId,
    gatewayUrl: session.gatewayUrl,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };

  if (session.startedAt !== undefined) {
    nextSession.startedAt = session.startedAt;
  }
  if (session.lastHeartbeatAt !== undefined) {
    nextSession.lastHeartbeatAt = session.lastHeartbeatAt;
  }
  if (session.terminatedAt !== undefined) {
    nextSession.terminatedAt = session.terminatedAt;
  }
  if (session.terminatedReason !== undefined) {
    nextSession.terminatedReason = session.terminatedReason;
  }
  if (session.flaggedAt !== undefined) {
    nextSession.flaggedAt = session.flaggedAt;
  }
  if (session.flagReason !== undefined) {
    nextSession.flagReason = session.flagReason;
  }
  if (session.flagCount !== undefined) {
    nextSession.flagCount = session.flagCount;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete (nextSession as Record<string, any>)[key];
      continue;
    }

    (nextSession as Record<string, any>)[key] = value;
  }

  return nextSession;
}

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
    await ctx.db.replace(
      id,
      buildSessionDocument(session, {
        status: "pending",
        updatedAt: now,
      })
    );

    return id;
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("offlineProblemSessions"),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("terminated")
    ),
  },
  handler: async (ctx, { id, status }) => {
    const session = await ctx.db.get(id);

    if (!session) {
      throw new Error("Offline session not found.");
    }

    const now = Date.now();
    const overrides: Record<string, any> = {
      status,
      updatedAt: now,
    };

    if (status === "active") {
      overrides.startedAt = session.startedAt ?? now;
      overrides.lastHeartbeatAt = now;
    }

    if (status === "terminated") {
      overrides.terminatedAt = session.terminatedAt ?? now;
      overrides.terminatedReason =
        session.terminatedReason ??
        session.flagReason ??
        DEFAULT_TERMINATED_REASON;
      overrides.lastHeartbeatAt = now;
    }

    await ctx.db.replace(id, buildSessionDocument(session, overrides));

    return id;
  },
});

export const setIncident = mutation({
  args: {
    id: v.id("offlineProblemSessions"),
    incidentReason: v.string(),
  },
  handler: async (ctx, { id, incidentReason }) => {
    const session = await ctx.db.get(id);

    if (!session) {
      throw new Error("Offline session not found.");
    }

    const now = Date.now();
    const nextReason = incidentReason.trim() || undefined;

    await ctx.db.replace(
      id,
      buildSessionDocument(session, {
        updatedAt: now,
        flaggedAt: nextReason ? session.flaggedAt ?? now : session.flaggedAt,
        flagReason: nextReason,
        terminatedReason: nextReason,
        flagCount: nextReason ? session.flagCount ?? 1 : session.flagCount,
      })
    );

    return id;
  },
});