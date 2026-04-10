import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { insertTrackAvailabilityNotification } from "./notificationHelpers";

/** Get the DB-stored active override for a specific track (null = use code default) */
export const getBySlug = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const results = await ctx.db
      .query("trackSettings")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    return results[0] || null;
  },
});

/** List all DB track setting overrides */
export const list = query({
  handler: async (ctx) => {
    return ctx.db.query("trackSettings").collect();
  },
});

/** Set the active state for a track (creates or updates the override) */
export const setActive = mutation({
  args: { trackSlug: v.string(), isActive: v.boolean() },
  handler: async (ctx, { trackSlug, isActive }) => {
    const existing = await ctx.db
      .query("trackSettings")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .first();

    const previousEffectiveState = existing?.isActive ?? true;

    if (existing) {
      await ctx.db.patch(existing._id, { isActive });
    } else {
      await ctx.db.insert("trackSettings", { trackSlug, isActive });
    }

    if (previousEffectiveState !== isActive) {
      await insertTrackAvailabilityNotification(ctx, trackSlug, isActive);
    }
  },
});

export const setLeaderboardConfig = mutation({
  args: {
    trackSlug: v.string(),
    leaderboardVisible: v.boolean(),
    leaderboardCoefficient: v.number(),
  },
  handler: async (ctx, { trackSlug, leaderboardVisible, leaderboardCoefficient }) => {
    const normalizedCoefficient = Number.isFinite(leaderboardCoefficient)
      ? Math.max(0, leaderboardCoefficient)
      : 1;

    const existing = await ctx.db
      .query("trackSettings")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        leaderboardVisible,
        leaderboardCoefficient: normalizedCoefficient,
      });
      return existing._id;
    }

    return ctx.db.insert("trackSettings", {
      trackSlug,
      isActive: true,
      leaderboardVisible,
      leaderboardCoefficient: normalizedCoefficient,
    });
  },
});
